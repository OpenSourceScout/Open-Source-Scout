"""
Agent 1: Triage Nurse - Issue ranking and selection.
"""
from typing import List, Optional
import json
import re

from core.agents.base import BaseAgent
from core.schemas import (
    GitHubIssue, GitHubRepo, Agent1Output,
    RankedIssue, RepoInfo
)
from core.memory.hindsight_client import get_scout_hindsight
from core.memory.skipped_repos import normalize_repo_id
from core.runtime.groq_context import pipeline_user_id_var
from core.scoring import IssueScorer, ScoreResult
from integrations.groq_client import GroqClient, MODEL_LLAMA_4_SCOUT_17B


class TriageNurseAgent(BaseAgent):
    """
    Agent 1: Triage Nurse
    
    Responsible for:
    - Fetching and filtering issues
    - Scoring issues based on beginner-friendliness
    - Ranking and selecting the best issue
    - Generating human-readable reasons for selection
    """
    
    def __init__(
        self,
        groq_client: GroqClient,
        model: Optional[str] = None
    ):
        super().__init__(groq_client, model or MODEL_LLAMA_4_SCOUT_17B)
        self.scorer = IssueScorer()
    
    @property
    def name(self) -> str:
        return "Triage Nurse"
    
    @property
    def role_prompt(self) -> str:
        return """You are the Triage Nurse agent, an expert at evaluating GitHub issues for beginner contributors.

Your role is to:
1. Analyze issue titles, descriptions, and labels
2. Identify issues suitable for first-time contributors
3. Provide clear, actionable reasons why each issue is good for beginners

Focus on:
- Clarity of requirements
- Scope appropriateness
- Available context and guidance
- Potential learning opportunities

Be encouraging but honest about difficulty levels."""
    
    def run(
        self,
        repo: GitHubRepo,
        issues: List[GitHubIssue],
        top_n: int = 3
    ) -> Agent1Output:
        """
        Rank issues and select the best one.
        
        Args:
            repo: Repository information
            issues: List of issues to rank
            top_n: Number of top issues to return
            
        Returns:
            Agent1Output with ranked issues
        """
        self.activate_agent_llm_context()
        self.log(f"Analyzing {len(issues)} issues for {repo.full_name}")

        recalled_memory_ids: list[str] = []
        memory_summary = ""
        patterns_section = ""
        disliked_issues: list[dict[str, object]] = []
        uid = pipeline_user_id_var.get()
        repo_language = (repo.language or "").strip()
        if not repo_language and repo.languages:
            repo_language = next(iter(repo.languages.keys()), "")
        if uid:
            try:
                hx = get_scout_hindsight()
                memories = hx.recall_sync(
                    uid,
                    f"issue completion patterns and thumbs-down feedback in {repo_language}: labels, size, complexity",
                    top_k=8,
                )
                recalled_memory_ids = [
                    str(m.get("memory_id") or "") for m in memories if m.get("memory_id")
                ]
                recalled_memory_ids = [x for x in recalled_memory_ids if x]
                if memories:
                    lines = "\n".join(f"- {(m.get('text') or '')[:400]}" for m in memories[:8])
                    patterns_section = f"\n\n## User completion patterns\n{lines}\n"
                    memory_summary = (
                        f"Influenced by {len(recalled_memory_ids)} past memories about issue preferences"
                    )
                disliked_issues = self._extract_disliked_issues(memories)
            except Exception as e:
                self.log(f"Hindsight recall skipped: {e}", level="warning")

        if not issues:
            # Return empty result if no issues
            return Agent1Output(
                repo=RepoInfo(
                    url=repo.html_url,
                    default_branch=repo.default_branch,
                    description=repo.description,
                    languages=list(repo.languages.keys())[:5] if repo.languages else None
                ),
                ranked_issues=[],
                selected_issue_number=0,
                recalled_memory_ids=recalled_memory_ids,
                memory_summary=memory_summary,
            )
        
        # Score all issues with thumbs-down penalty
        ranked = []
        for issue in issues:
            score_result = self.scorer.score_issue(issue)
            penalty = self._issue_dislike_penalty(issue, disliked_issues)
            if penalty:
                score_result = ScoreResult(
                    total=max(0, score_result.total - penalty),
                    breakdown=score_result.breakdown,
                    reasons=score_result.reasons,
                )
            ranked.append((issue, score_result))

        ranked.sort(key=lambda x: x[1].total, reverse=True)
        ranked = ranked[:top_n]
        
        # Generate enhanced reasons using LLM
        ranked_issues = []
        for issue, score_result in ranked:
            # Get LLM to enhance the reasons
            enhanced_reasons = self._enhance_reasons(issue, score_result.reasons, patterns_section)
            
            ranked_issues.append(RankedIssue(
                number=issue.number,
                title=issue.title,
                url=issue.html_url,
                labels=issue.labels,
                score_total=score_result.total,
                score_breakdown=score_result.breakdown,
                why=enhanced_reasons,
                body=issue.body,
                created_at=issue.created_at,
                updated_at=issue.updated_at,
                comments=issue.comments,
            ))
        
        # Select the top issue
        selected = ranked_issues[0].number if ranked_issues else 0
        
        self.log(f"Selected issue #{selected} with score {ranked_issues[0].score_total if ranked_issues else 0}")
        
        return Agent1Output(
            repo=RepoInfo(
                url=repo.html_url,
                default_branch=repo.default_branch,
                description=repo.description,
                languages=list(repo.languages.keys())[:5] if repo.languages else None
            ),
            ranked_issues=ranked_issues,
            selected_issue_number=selected,
            recalled_memory_ids=recalled_memory_ids,
            memory_summary=memory_summary,
        )
    
    def _enhance_reasons(
        self,
        issue: GitHubIssue,
        base_reasons: List[str],
        patterns_section: str = "",
    ) -> List[str]:
        """Use LLM to enhance scoring reasons."""
        try:
            feedback_ctx = self._get_feedback_prompt()
            prompt = f"""Given this GitHub issue, provide 3-4 concise bullet points explaining why it's suitable for a beginner contributor.

Issue #{issue.number}: {issue.title}

Description:
{(issue.body or "No description")[:1000]}

Labels: {', '.join(issue.labels) if issue.labels else 'None'}

Base analysis notes:
{chr(10).join('- ' + r for r in base_reasons)}
{patterns_section}
{feedback_ctx}
Respond with a JSON object containing a "reasons" array of 3-4 short, specific bullet points. Each should be one sentence. Focus on actionability and encouragement.

Example format:
{{"reasons": ["Clear scope: single file change needed", "Good documentation in issue", "Active maintainer responses"]}}"""

            response = self.groq.complete(
                prompt=prompt,
                model=self.model,
                system_prompt=self.role_prompt,
                temperature=0.5,
                max_tokens=500,
                json_mode=True
            )
            
            data = json.loads(response)
            return data.get("reasons", base_reasons)[:4]
        
        except Exception as e:
            self.log(f"Failed to enhance reasons: {e}", level="warning")
            return base_reasons[:4]

    def _extract_disliked_issues(self, memories: list) -> list[dict[str, object]]:
        """Extract issue thumbs-down feedback from memories for ranking penalties."""
        disliked: list[dict[str, object]] = []
        for m in memories or []:
            meta = m.get("metadata") if isinstance(m.get("metadata"), dict) else {}
            if (meta.get("kind") or "").lower() != "thumbs":
                continue
            if (meta.get("vote") or "").lower() != "down":
                continue
            if (meta.get("target_type") or "").lower() != "issue":
                continue
            issue_url = meta.get("issue_url") or meta.get("target_id") or ""
            repo_id = normalize_repo_id(meta.get("repo_url") or issue_url)
            labels = [
                str(l).strip().lower()
                for l in (meta.get("labels") or [])
                if str(l).strip()
            ]
            title = (meta.get("title") or "").strip()
            disliked.append(
                {
                    "issue_url": issue_url,
                    "repo_id": repo_id,
                    "labels": set(labels),
                    "tokens": self._tokenize_text(title),
                }
            )
        return disliked

    def _issue_dislike_penalty(self, issue: GitHubIssue, disliked_issues: list[dict[str, object]]) -> int:
        if not disliked_issues:
            return 0
        issue_url = issue.html_url or issue.url
        repo_id = normalize_repo_id(issue_url)
        labels = {lbl.lower() for lbl in issue.labels}
        title_tokens = self._tokenize_text(issue.title)
        penalty = 0
        for disliked in disliked_issues:
            if issue_url and disliked.get("issue_url") == issue_url:
                return 40
            disliked_labels = disliked.get("labels") or set()
            disliked_tokens = disliked.get("tokens") or set()
            if repo_id and disliked.get("repo_id") == repo_id:
                if labels and disliked_labels and labels.intersection(disliked_labels):
                    penalty += 10
                if title_tokens and disliked_tokens and title_tokens.intersection(disliked_tokens):
                    penalty += 8
                continue
            if labels and disliked_labels and labels.intersection(disliked_labels):
                penalty += 6
        return min(penalty, 20)

    def _tokenize_text(self, text: str) -> set[str]:
        if not text:
            return set()
        return set(re.findall(r"[a-z0-9]{3,}", text.lower()))

"""
Agent 1: Triage Nurse - Issue ranking and selection.
"""
from typing import List, Optional
import json

from core.agents.base import BaseAgent
from core.schemas import (
    GitHubIssue, GitHubRepo, Agent1Output,
    RankedIssue, RepoInfo
)
from core.memory.hindsight_client import get_scout_hindsight
from core.runtime.groq_context import pipeline_user_id_var
from core.scoring import IssueScorer
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
        uid = pipeline_user_id_var.get()
        repo_language = (repo.language or "").strip()
        if not repo_language and repo.languages:
            repo_language = next(iter(repo.languages.keys()), "")
        if uid:
            try:
                hx = get_scout_hindsight()
                memories = hx.recall_sync(
                    uid,
                    f"issue completion patterns in {repo_language}: labels, size, complexity",
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
        
        # Score all issues
        ranked = self.scorer.rank_issues(issues, top_n=top_n)
        
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

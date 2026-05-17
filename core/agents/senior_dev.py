"""
Agent 3: Senior Dev - Fix plan and PR draft generator.
"""
from typing import Optional
import json

from core.agents.base import BaseAgent
from core.schemas import (
    GitHubIssue, GitHubRepo, Agent1Output, Agent2Output,
    Agent3Output, PRDraft
)
from core.memory.hindsight_client import get_scout_hindsight
from core.runtime.groq_context import pipeline_user_id_var
from integrations.groq_client import GroqClient


class SeniorDevAgent(BaseAgent):
    """
    Agent 3: Senior Developer
    
    Responsible for:
    - Creating comprehensive fix plan
    - Generating contributor briefing document
    - Drafting PR content
    - Suggesting test commands
    """
    
    def __init__(
        self,
        groq_client: GroqClient,
        model: Optional[str] = None
    ):
        # Use more powerful model for final generation
        super().__init__(groq_client, model or "llama-3.3-70b")
    
    @property
    def name(self) -> str:
        return "Senior Dev"
    
    @property
    def role_prompt(self) -> str:
        return """You are the Senior Developer agent, an expert mentor who creates comprehensive contribution guides.

Your role is to:
1. Synthesize information from issue analysis and code location
2. Create detailed, actionable fix plans
3. Write professional PR drafts
4. Identify edge cases and testing strategies

Write for a beginner audience. Be clear, encouraging, and thorough.
Include specific file paths, function names, and code hints where possible.
Explain the 'why' behind each step."""
    
    def run(
        self,
        repo: GitHubRepo,
        issue: GitHubIssue,
        agent1_output: Agent1Output,
        agent2_output: Agent2Output
    ) -> Agent3Output:
        """
        Generate the complete contributor briefing.
        
        Args:
            repo: Repository information
            issue: Selected issue
            agent1_output: Output from Triage Nurse
            agent2_output: Output from Archaeologist
            
        Returns:
            Agent3Output with briefing document and PR draft
        """
        self.activate_agent_llm_context()
        self.log(f"Generating briefing for issue #{issue.number}")

        recalled_memory_ids: list[str] = []
        memory_summary = ""
        style_preamble = ""
        uid = pipeline_user_id_var.get()
        if uid:
            try:
                hx = get_scout_hindsight()
                reflect_ctx = {
                    "fix_summary": f"#{issue.number}: {issue.title}",
                    "file_changes": [h.path for h in agent2_output.hits[:15]],
                    "language": repo.language or "",
                }
                ref = hx.reflect_sync(
                    uid,
                    "What fix-plan tone, PR description style, and commit-message convention "
                    "does this user prefer?",
                    reflect_ctx,
                )
                recalled_memory_ids = list(ref.get("cited_memory_ids") or [])
                ans = (ref.get("answer") or "").strip()
                if ans:
                    style_preamble = f"## User Style Preamble\n{ans}\n\n"
                    memory_summary = (
                        f"Influenced by reflection citing {len(recalled_memory_ids)} memories"
                    )
            except Exception as e:
                self.log(f"Hindsight reflect skipped: {e}", level="warning")

        # Build the context for the LLM
        context = self._build_context(repo, issue, agent1_output, agent2_output)

        # Generate the briefing document
        briefing = self._generate_briefing(context, style_preamble)
        
        # Generate PR draft
        pr_draft = self._generate_pr_draft(issue, agent2_output)
        
        # Generate test commands
        test_commands = self._generate_test_commands(repo, agent2_output)
        
        # Identify risks
        risk_notes = self._identify_risks(context)
        
        return Agent3Output(
            briefing_markdown=briefing,
            pr_draft=pr_draft,
            test_commands=test_commands,
            risk_notes=risk_notes,
            recalled_memory_ids=recalled_memory_ids,
            memory_summary=memory_summary,
        )
    
    def _build_context(
        self,
        repo: GitHubRepo,
        issue: GitHubIssue,
        agent1_output: Agent1Output,
        agent2_output: Agent2Output
    ) -> dict:
        """Build context dictionary for generation."""
        # Get the ranked issue info
        ranked_issue = None
        for ri in agent1_output.ranked_issues:
            if ri.number == issue.number:
                ranked_issue = ri
                break
        
        return {
            "repo": {
                "name": repo.full_name,
                "url": repo.html_url,
                "description": repo.description,
                "default_branch": repo.default_branch,
                "languages": list(repo.languages.keys())[:5] if repo.languages else [],
                "primary_language": repo.language
            },
            "issue": {
                "number": issue.number,
                "title": issue.title,
                "body": issue.body or "No description provided",
                "url": issue.html_url,
                "labels": issue.labels,
                "created_at": issue.created_at,
                "updated_at": issue.updated_at,
                "comments": issue.comments,
                "score": ranked_issue.score_total if ranked_issue else 0,
                "why_selected": ranked_issue.why if ranked_issue else []
            },
            "code_analysis": {
                "keywords": agent2_output.keywords,
                "confidence": agent2_output.confidence,
                "files": [
                    {
                        "path": hit.path,
                        "symbols": hit.symbols,
                        "why": hit.why_relevant,
                        "snippet": hit.snippet[:500]
                    }
                    for hit in agent2_output.hits[:5]
                ],
                "call_trace": agent2_output.call_trace_hint,
                "additional_files": agent2_output.next_files_to_check
            }
        }
    
    def _generate_briefing(self, context: dict, style_preamble: str = "") -> str:
        """Generate the contributor briefing document."""
        feedback_ctx = self._get_feedback_prompt()
        prompt = f"""Write a Contributor Briefing as Markdown for a new open-source contributor.

You MUST strictly follow this exact Markdown template. Do NOT omit the `#`, `##`, or `- **` Markdown symbols! Do NOT wrap your response in ```markdown tags. Output the raw text.

{style_preamble}
TEMPLATE:
# Contributor Briefing: <Issue Title>

## At a glance
- **Repository:** <repo full name>
- **Issue Link:** <issue url>
- **Dates:** <created at> to <updated at>
- **Confidence:** <confidence>
- **Stack:** <languages>

## Repository setup
<Explain how to clone and set up based on language and README. Add empty lines between paragraphs.>

## Issue analysis
<Explain the issue clearly. Add empty lines between paragraphs.>

## Code location
<List the files using `- \`file_path\` ` and explain why. Include small fenced code blocks if it helps.>

## Implementation plan
<Numbered list of steps:>
1. **<Step name>**: <detail...>
2. **<Step name>**: <detail...>

## Testing
<How to test this fix. List standard commands if known.>

## PR preparation
<Steps to prepare PR>

## Notes and risks
<List any risks or gotchas>

DATA TO SYNTHESIZE:
{json.dumps(context, indent=2)}

{feedback_ctx}

Output the RAW MARKDOWN starting immediately with `# Contributor Briefing:`:"""

        response = self.groq.complete(
            prompt=prompt,
            model=self.model,
            system_prompt=self.role_prompt,
            temperature=0.4,
            max_tokens=4096
        )
        
        return response
    
    def _generate_pr_draft(
        self,
        issue: GitHubIssue,
        agent2_output: Agent2Output
    ) -> PRDraft:
        """Generate PR draft content."""
        try:
            # Create branch name from issue
            title_slug = issue.title.lower()
            title_slug = ''.join(c if c.isalnum() or c == ' ' else '' for c in title_slug)
            title_slug = '-'.join(title_slug.split()[:5])
            branch_name = f"fix/{issue.number}-{title_slug}"
            
            # Get files for commit message
            files_changed = [hit.path for hit in agent2_output.hits[:3]]
            
            feedback_ctx = self._get_feedback_prompt()
            prompt = f"""Generate a professional PR draft for this issue.

Issue #{issue.number}: {issue.title}
Description: {(issue.body or "")[:500]}
Files likely modified: {', '.join(files_changed)}
{feedback_ctx}
Respond with JSON:
{{
  "commit_message": "Short commit message following conventional commits format",
  "pr_title": "PR title",
  "pr_body": "Full PR description with context, changes made, and testing notes"
}}"""

            response = self.groq.complete(
                prompt=prompt,
                model=self.model,
                system_prompt=self.role_prompt,
                temperature=0.3,
                max_tokens=800,
                json_mode=True
            )
            
            data = json.loads(response)
            
            return PRDraft(
                branch_name=branch_name[:50],
                commit_message=data.get("commit_message", f"fix: resolve issue #{issue.number}"),
                pr_title=data.get("pr_title", f"Fix: {issue.title}"),
                pr_body=data.get("pr_body", f"Resolves #{issue.number}")
            )
        
        except Exception as e:
            self.log(f"Failed to generate PR draft: {e}", level="warning")
            return PRDraft(
                branch_name=f"fix/{issue.number}",
                commit_message=f"fix: resolve issue #{issue.number}",
                pr_title=f"Fix: {issue.title}",
                pr_body=f"## Description\nResolves #{issue.number}\n\n## Changes\n- TODO\n\n## Testing\n- TODO"
            )
    
    def _generate_test_commands(
        self,
        repo: GitHubRepo,
        agent2_output: Agent2Output
    ) -> list:
        """Generate test commands based on repo language."""
        commands = []
        
        languages = list(repo.languages.keys()) if repo.languages else []
        primary = repo.language or ""
        
        # Python
        if "Python" in languages or "python" in primary.lower():
            commands.extend([
                "pytest",
                "pytest -v",
                "python -m pytest tests/",
            ])
        
        # JavaScript/TypeScript
        if any(lang in languages for lang in ["JavaScript", "TypeScript"]):
            commands.extend([
                "npm test",
                "npm run test",
                "yarn test",
            ])
        
        # Go
        if "Go" in languages:
            commands.append("go test ./...")
        
        # Rust
        if "Rust" in languages:
            commands.append("cargo test")
        
        # Java
        if "Java" in languages:
            commands.extend([
                "mvn test",
                "gradle test",
            ])
        
        # Default
        if not commands:
            commands = ["# Check project README for test commands"]
        
        return commands[:5]
    
    def _identify_risks(self, context: dict) -> list:
        """Identify potential risks and gotchas."""
        risks = []
        
        # Check confidence
        if context["code_analysis"]["confidence"] == "Low":
            risks.append("Low confidence in code location - double-check with maintainers")
        
        # Check for complex keywords
        issue_text = f"{context['issue']['title']} {context['issue']['body']}".lower()
        
        if any(kw in issue_text for kw in ["breaking", "deprecate", "migration"]):
            risks.append("May involve breaking changes - coordinate with maintainers")
        
        if any(kw in issue_text for kw in ["security", "auth", "password", "token"]):
            risks.append("Security-sensitive area - extra review recommended")
        
        if any(kw in issue_text for kw in ["database", "schema", "migration"]):
            risks.append("Database changes may need migration scripts")
        
        if not risks:
            risks.append("No major risks identified - proceed with standard care")
        
        return risks

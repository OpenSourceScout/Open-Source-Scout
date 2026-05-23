"""
Agent 4: Testing Agent - Quality Assurance validator for the multi-agent pipeline.

Validates structural correctness, semantic quality, and cross-agent consistency.
Provides feedback to failing agents for iterative improvement.
"""
from typing import List, Optional, Dict
from pathlib import Path
import json

from core.agents.base import BaseAgent
from core.schemas import (
    GitHubIssue, GitHubRepo,
    Agent1Output, Agent2Output, Agent3Output,
    PathfinderOutput, CodeReviewOutput,
    AgentTestResult, TestingAgentOutput,
)
from integrations.groq_client import GroqClient, MODEL_LLAMA_4_SCOUT_17B

PASS_THRESHOLD = 60


class TestingAgent(BaseAgent):
    """
    Agent 4: Testing Agent (QA Validator)

    Validates every upstream agent's output through two phases:
      1. Structural checks (deterministic) — schema completeness, file existence, bounds.
      2. Semantic checks (LLM-based) — relevance, accuracy, actionability, cross-agent consistency.

    When an agent's score falls below the pass threshold, the Testing Agent
    produces targeted feedback so the orchestrator can retry that agent.
    """

    def __init__(self, groq_client: GroqClient, model: Optional[str] = None):
        super().__init__(groq_client, model or MODEL_LLAMA_4_SCOUT_17B)

    @property
    def name(self) -> str:
        return "Testing Agent"

    @property
    def role_prompt(self) -> str:
        return (
            "You are the Testing Agent, a rigorous QA validator for a multi-agent "
            "AI pipeline that helps beginners contribute to open-source projects.\n\n"
            "Your role is to:\n"
            "1. Evaluate the quality and accuracy of outputs from other agents\n"
            "2. Check for factual correctness, relevance, and completeness\n"
            "3. Identify inconsistencies between different agents' outputs\n"
            "4. Provide specific, actionable feedback for improvement\n\n"
            "Be strict but fair. A beginner will rely on this output, so quality matters.\n"
            "Rate each agent's output on a 0-100 scale where:\n"
            "- 80-100: Excellent, ready for the user\n"
            "- 60-79: Acceptable with minor issues\n"
            "- 40-59: Needs improvement\n"
            "- 0-39: Significant issues, must retry"
        )

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(
        self,
        repo: GitHubRepo,
        issue: GitHubIssue,
        agent1_output: Agent1Output,
        agent2_output: Agent2Output,
        agent3_output: Agent3Output,
        repo_path: Optional[Path] = None,
        file_tree: Optional[List[str]] = None,
        pathfinder_output: Optional[PathfinderOutput] = None,
        code_review_output: Optional[CodeReviewOutput] = None,
    ) -> TestingAgentOutput:
        """Validate all upstream agent outputs and return a QA report."""
        self.activate_agent_llm_context()
        self.log("Starting QA validation of pipeline outputs")

        # Phase 1: Structural validation (deterministic)
        struct_issues_p = (
            self._validate_pathfinder_structural(pathfinder_output)
            if pathfinder_output else []
        )
        struct_issues_c = (
            self._validate_code_reviewer_structural(code_review_output)
            if code_review_output else []
        )
        struct_issues_1 = self._validate_agent1_structural(agent1_output)
        struct_issues_2 = self._validate_agent2_structural(agent2_output, repo_path)
        struct_issues_3 = self._validate_agent3_structural(agent3_output)

        # Phase 2: Semantic validation (LLM-based)
        semantic_results = self._validate_semantic(
            repo, issue,
            agent1_output, agent2_output, agent3_output,
            file_tree,
            pathfinder_output,
            code_review_output,
        )

        # Merge structural + semantic results per agent
        agent_results: List[AgentTestResult] = []

        # Include Pathfinder if its output was provided
        agents_to_validate = []
        if pathfinder_output:
            agents_to_validate.append(
                ("Pathfinder", struct_issues_p, "pathfinder")
            )
        agents_to_validate.extend([
            ("Triage Nurse", struct_issues_1, "triage_nurse"),
            ("Archaeologist", struct_issues_2, "archaeologist"),
            ("Senior Dev", struct_issues_3, "senior_dev"),
        ])
        if code_review_output:
            agents_to_validate.append(
                ("Code Reviewer", struct_issues_c, "code_reviewer")
            )

        for agent_name, struct_issues, sem_key in agents_to_validate:
            sem = semantic_results.get(sem_key, {})
            all_issues = struct_issues + sem.get("issues", [])
            suggestions = sem.get("suggestions", [])
            sem_score = sem.get("score", 70)

            structural_penalty = min(len(struct_issues) * 10, 40)
            final_score = max(0, min(100, sem_score - structural_penalty))
            passed = final_score >= PASS_THRESHOLD and len(struct_issues) == 0

            agent_results.append(AgentTestResult(
                agent_name=agent_name,
                passed=passed,
                score=final_score,
                issues_found=all_issues,
                suggestions=suggestions,
                details=sem.get("details", ""),
            ))

        overall_score = sum(r.score for r in agent_results) // len(agent_results)
        overall_passed = all(r.passed for r in agent_results)
        retry_agents = [r.agent_name for r in agent_results if not r.passed]


        summary = self._generate_summary(agent_results, overall_score, overall_passed)

        self.log(
            f"QA validation complete: {'PASSED' if overall_passed else 'NEEDS RETRY'} "
            f"(score: {overall_score}/100)"
        )

        return TestingAgentOutput(
            overall_passed=overall_passed,
            overall_score=overall_score,
            agent_results=agent_results,
            summary=summary,
            retry_recommended=not overall_passed,
            retry_agents=retry_agents,
            iterations_used=1,
        )

    # ------------------------------------------------------------------
    # Structural validators (deterministic)
    # ------------------------------------------------------------------

    def _validate_pathfinder_structural(self, output: PathfinderOutput) -> List[str]:
        issues: List[str] = []

        if not output.ranked_repos:
            issues.append("No ranked repositories produced")
            return issues

        if not output.tech_stack:
            issues.append("No tech stack recorded in output")

        for repo in output.ranked_repos:
            if repo.score_total < 0 or repo.score_total > 100:
                issues.append(
                    f"Repo {repo.full_name} has invalid score: {repo.score_total}"
                )
            if not repo.why_match:
                issues.append(
                    f"Repo {repo.full_name} has no match reasons"
                )

        return issues

    def _validate_code_reviewer_structural(self, output: CodeReviewOutput) -> List[str]:
        issues: List[str] = []
        if not output.file_feedback:
            issues.append("No file feedback produced by Code Reviewer")
        if output.overall_status not in ("approved", "needs_improvement"):
            issues.append(f"Invalid overall status: '{output.overall_status}'")
        for fb in output.file_feedback:
            if not fb.review_comments:
                issues.append(f"No review comments for file: {fb.file_path}")
        return issues

    def _validate_agent1_structural(self, output: Agent1Output) -> List[str]:
        issues: List[str] = []

        if not output.ranked_issues:
            issues.append("No ranked issues produced")
            return issues

        if output.selected_issue_number == 0:
            issues.append("No issue was selected (selected_issue_number is 0)")

        selected_in_list = any(
            ri.number == output.selected_issue_number
            for ri in output.ranked_issues
        )
        if not selected_in_list and output.selected_issue_number != 0:
            issues.append(
                f"Selected issue #{output.selected_issue_number} not in ranked list"
            )

        for ri in output.ranked_issues:
            if not ri.why:
                issues.append(f"Issue #{ri.number} has no explanation reasons")

        return issues

    def _validate_agent2_structural(
        self,
        output: Agent2Output,
        repo_path: Optional[Path] = None,
    ) -> List[str]:
        issues: List[str] = []

        if not output.hits:
            issues.append("No code locations found")

        if not output.keywords:
            issues.append("No keywords extracted from issue")

        if output.confidence not in ("High", "Medium", "Low"):
            issues.append(f"Invalid confidence level: '{output.confidence}'")

        # File existence check (when the cloned repo is available)
        if repo_path:
            for hit in output.hits:
                full_path = repo_path / hit.path
                if not full_path.exists():
                    issues.append(f"Referenced file does not exist: {hit.path}")

        for hit in output.hits:
            if not hit.snippet or not hit.snippet.strip():
                issues.append(f"Empty code snippet for: {hit.path}")
            if not hit.why_relevant or len(hit.why_relevant) < 10:
                issues.append(
                    f"Missing or too-short relevance explanation for: {hit.path}"
                )

        return issues

    def _validate_agent3_structural(self, output: Agent3Output) -> List[str]:
        issues: List[str] = []

        if not output.briefing_markdown or len(output.briefing_markdown.strip()) < 200:
            issues.append("Briefing document is too short (< 200 chars)")

        pr = output.pr_draft
        if not pr.branch_name:
            issues.append("PR draft missing branch name")
        if not pr.commit_message:
            issues.append("PR draft missing commit message")
        if not pr.pr_title:
            issues.append("PR draft missing PR title")
        if not pr.pr_body or len(pr.pr_body.strip()) < 50:
            issues.append("PR body is too short (< 50 chars)")

        briefing_lower = output.briefing_markdown.lower()
        for section in ("overview", "implementation", "testing"):
            if section not in briefing_lower:
                issues.append(f"Briefing may be missing '{section}' section")

        return issues

    # ------------------------------------------------------------------
    # Semantic validator (LLM-based)
    # ------------------------------------------------------------------

    def _validate_semantic(
        self,
        repo: GitHubRepo,
        issue: GitHubIssue,
        agent1_output: Agent1Output,
        agent2_output: Agent2Output,
        agent3_output: Agent3Output,
        file_tree: Optional[List[str]] = None,
        pathfinder_output: Optional[PathfinderOutput] = None,
        code_review_output: Optional[CodeReviewOutput] = None,
    ) -> Dict:
        try:
            agent1_summary = {
                "ranked_issues": [
                    {
                        "number": ri.number,
                        "title": ri.title,
                        "score": ri.score_total,
                        "reasons": ri.why,
                    }
                    for ri in agent1_output.ranked_issues[:3]
                ],
                "selected_issue": agent1_output.selected_issue_number,
            }

            agent2_summary = {
                "issue_number": agent2_output.issue_number,
                "keywords": agent2_output.keywords,
                "confidence": agent2_output.confidence,
                "hits": [
                    {
                        "path": h.path,
                        "symbols": h.symbols[:5],
                        "why": h.why_relevant,
                    }
                    for h in agent2_output.hits[:5]
                ],
                "call_trace": agent2_output.call_trace_hint,
            }

            agent3_summary = {
                "briefing_length": len(agent3_output.briefing_markdown),
                "briefing_preview": agent3_output.briefing_markdown[:800],
                "pr_draft": {
                    "branch": agent3_output.pr_draft.branch_name,
                    "commit_msg": agent3_output.pr_draft.commit_message,
                    "pr_title": agent3_output.pr_draft.pr_title,
                    "pr_body_preview": agent3_output.pr_draft.pr_body[:400],
                },
                "test_commands": agent3_output.test_commands,
                "risks": agent3_output.risk_notes,
            }

            tree_ctx = ""
            if file_tree:
                tree_ctx = (
                    "\nRepository file tree (sample):\n"
                    + "\n".join(file_tree[:30])
                )

            pathfinder_ctx = ""
            pathfinder_prompt_section = ""
            pathfinder_json_section = ""
            if pathfinder_output:
                pathfinder_summary = {
                    "tech_stack": pathfinder_output.tech_stack,
                    "repos_found": len(pathfinder_output.ranked_repos),
                    "top_repos": [
                        {
                            "name": r.full_name,
                            "score": r.score_total,
                            "why_match": r.why_match[:3],
                            "language": r.language,
                        }
                        for r in pathfinder_output.ranked_repos[:3]
                    ],
                }
                pathfinder_ctx = (
                    f"\nAGENT 0 (Pathfinder) Output:\n"
                    f"{json.dumps(pathfinder_summary, indent=2)}\n"
                )
                pathfinder_prompt_section = (
                    "\n**Pathfinder:**\n"
                    "- Are the recommended repositories relevant to the user's tech stack?\n"
                    "- Are the match reasons specific and helpful?\n"
                    "- Are the scores reasonable given the repo characteristics?\n"
                )
                pathfinder_json_section = (
                    '  "pathfinder": {\n'
                    '    "score": <0-100>,\n'
                    '    "issues": ["list of specific problems found"],\n'
                    '    "suggestions": ["list of actionable improvement suggestions"],\n'
                    '    "details": "brief explanation of evaluation"\n'
                    '  },\n'
                )

            code_review_ctx = ""
            code_review_prompt_section = ""
            code_review_json_section = ""
            if code_review_output:
                code_review_summary = {
                    "overall_status": code_review_output.overall_status,
                    "summary": code_review_output.summary,
                    "file_feedback_count": len(code_review_output.file_feedback),
                    "feedbacks": [
                        {
                            "path": fb.file_path,
                            "status": fb.status,
                            "comments": fb.review_comments,
                        }
                        for fb in code_review_output.file_feedback
                    ]
                }
                code_review_ctx = (
                    f"\nAGENT 5 (Code Reviewer) Output:\n"
                    f"{json.dumps(code_review_summary, indent=2)}\n"
                )
                code_review_prompt_section = (
                    "\n**Code Reviewer:**\n"
                    "- Are the code reviewer's comments helpful, educational, and constructive?\n"
                    "- Does the status ('approved' vs 'needs_improvement') match the actual issues identified?\n"
                )
                code_review_json_section = (
                    '  "code_reviewer": {\n'
                    '    "score": <0-100>,\n'
                    '    "issues": ["list of specific problems found"],\n'
                    '    "suggestions": ["list of actionable improvement suggestions"],\n'
                    '    "details": "brief explanation of evaluation"\n'
                    '  },\n'
                )

            prompt = f"""Evaluate the quality of these AI agents' outputs for a beginner open-source contribution tool.

REPOSITORY: {repo.full_name} ({repo.language or 'Unknown'})
Description: {repo.description or 'N/A'}
Languages: {', '.join(list(repo.languages.keys())[:5]) if repo.languages else 'Unknown'}

TARGET ISSUE #{issue.number}: {issue.title}
Issue Body: {(issue.body or 'No description')[:600]}
Labels: {', '.join(issue.labels) if issue.labels else 'None'}
{tree_ctx}
{pathfinder_ctx}
{code_review_ctx}
AGENT 1 (Triage Nurse) Output:
{json.dumps(agent1_summary, indent=2)}

AGENT 2 (Archaeologist) Output:
{json.dumps(agent2_summary, indent=2)}

AGENT 3 (Senior Dev) Output:
{json.dumps(agent3_summary, indent=2)}

For EACH agent, evaluate:
{pathfinder_prompt_section}
**Triage Nurse:**
- Are the ranking reasons relevant and helpful for beginners?
- Does the selected issue make sense as the best choice?

**Archaeologist:**
- Are the code locations actually relevant to the issue?
- Does the confidence level match the evidence?
- Are the keywords appropriate?

**Senior Dev:**
- Is the briefing comprehensive and actionable for a beginner?
- Is the PR draft professional and well-structured?
- Are test commands appropriate for the tech stack?
- Are the identified risks reasonable?

{code_review_prompt_section}

**Cross-agent consistency:**
- Does Agent 3's briefing reference the files found by Agent 2?
- Is there consistency in issue understanding across agents?

Respond with JSON:
{{
{pathfinder_json_section}{code_review_json_section}  "triage_nurse": {{
    "score": <0-100>,
    "issues": ["list of specific problems found"],
    "suggestions": ["list of actionable improvement suggestions"],
    "details": "brief explanation of evaluation"
  }},
  "archaeologist": {{
    "score": <0-100>,
    "issues": ["list of specific problems found"],
    "suggestions": ["list of actionable improvement suggestions"],
    "details": "brief explanation of evaluation"
  }},
  "senior_dev": {{
    "score": <0-100>,
    "issues": ["list of specific problems found"],
    "suggestions": ["list of actionable improvement suggestions"],
    "details": "brief explanation of evaluation"
  }}
}}"""

            response = self.groq.complete(
                prompt=prompt,
                model=self.model,
                system_prompt=self.role_prompt,
                temperature=0.3,
                max_tokens=2000,
                json_mode=True,
            )

            return json.loads(response)

        except Exception as e:
            self.log(f"Semantic validation failed: {e}", level="warning")
            default = {
                "score": 70,
                "issues": [],
                "suggestions": [],
                "details": "Semantic validation unavailable",
            }
            return {
                "triage_nurse": default,
                "archaeologist": default,
                "senior_dev": default,
            }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _generate_summary(
        self,
        results: List[AgentTestResult],
        overall_score: int,
        passed: bool,
    ) -> str:
        status = "PASSED" if passed else "NEEDS IMPROVEMENT"
        lines = [f"Pipeline QA Status: {status} (Score: {overall_score}/100)", ""]

        for r in results:
            icon = "✅" if r.passed else "❌"
            lines.append(f"{icon} {r.agent_name}: {r.score}/100")
            if r.issues_found:
                for issue in r.issues_found[:3]:
                    lines.append(f"   - {issue}")

        if not passed:
            failed = [r.agent_name for r in results if not r.passed]
            lines.append(f"\nRetry recommended for: {', '.join(failed)}")

        return "\n".join(lines)

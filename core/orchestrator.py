"""
Orchestrator - Coordinates the multi-agent pipeline including QA validation.
"""
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable, List

from core.agents.triage_nurse import TriageNurseAgent
from core.agents.archaeologist import ArchaeologistAgent
from core.agents.senior_dev import SeniorDevAgent
from core.agents.testing_agent import TestingAgent
from core.schemas import (
    GitHubRepo, GitHubIssue,
    Agent1Output, Agent2Output, Agent3Output, TestingAgentOutput, RunLog,
)
from integrations.github_client import GitHubClient
from integrations.groq_client import GroqClient
from utils.cache import CacheManager

logger = logging.getLogger(__name__)

MAX_QA_RETRIES = 2


class ScoutOrchestrator:
    """
    Orchestrates the multi-agent pipeline for issue analysis.

    Pipeline:
    1. Triage Nurse: Fetch and rank issues
    2. Archaeologist: Locate relevant code
    3. Senior Dev: Generate fix plan and PR draft
    4. Testing Agent: Validate all outputs; retry failing agents up to MAX_QA_RETRIES times
    """

    def __init__(
        self,
        github_client: GitHubClient,
        groq_client: GroqClient,
        cache_manager: Optional[CacheManager] = None,
        fast_model: str = "openai/gpt-oss-120b",
        powerful_model: str = "llama-3.3-70b",
    ):
        self.github = github_client
        self.groq = groq_client
        self.cache = cache_manager or CacheManager()

        # Initialize agents
        self.agent1 = TriageNurseAgent(groq_client, model=fast_model)
        self.agent2 = ArchaeologistAgent(groq_client, model=fast_model)
        self.agent3 = SeniorDevAgent(groq_client, model=powerful_model)
        self.testing_agent = TestingAgent(groq_client, model=powerful_model)

        self._status_callback: Optional[Callable[[str], None]] = None
    
    def set_status_callback(self, callback: Callable[[str], None]):
        """Set callback for status updates."""
        self._status_callback = callback
    
    def _update_status(self, message: str):
        """Update status via callback if set."""
        logger.info(message)
        if self._status_callback:
            self._status_callback(message)
    
    def run(
        self,
        repo_url: str,
        beginner_only: bool = True,
        top_issues: int = 3,
        selected_issue_number: Optional[int] = None,
    ) -> dict:
        """
        Run the complete analysis pipeline with QA validation and feedback loop.

        Returns:
            Dictionary with all outputs, testing report, and metadata.
        """
        start_time = datetime.now()

        try:
            # --- Data gathering ---
            self._update_status("📡 Fetching repository information...")
            repo = self.github.get_repo(repo_url)

            self._update_status("🔍 Fetching issues...")
            issues = self.github.get_issues(repo_url, beginner_only=beginner_only)

            if not issues:
                self._update_status("⚠️ No issues found matching criteria")
                return {
                    "success": False,
                    "error": "No issues found. Try disabling 'Beginner-only mode' to see all issues.",
                    "repo": repo,
                }

            self._update_status(f"Found {len(issues)} issues")

            self._update_status("📦 Cloning repository (this may take a moment)...")
            repo_path = self.github.clone_repo(repo_url)

            self._update_status("🗂️ Analyzing repository structure...")
            file_tree = self.github.get_file_tree(repo_path)

            # --- Agent 1: Triage Nurse ---
            self._update_status("🏥 Agent 1 (Triage Nurse): Ranking issues...")
            agent1_output = self.agent1.run(repo, issues, top_n=top_issues)

            if not agent1_output.ranked_issues:
                return {
                    "success": False,
                    "error": "Could not rank any issues",
                    "repo": repo,
                    "agent1_output": agent1_output,
                }

            # Resolve target issue
            target_issue_number = (
                selected_issue_number or agent1_output.selected_issue_number
            )
            target_issue = self._find_issue(issues, target_issue_number)
            if not target_issue:
                target_issue_number = agent1_output.ranked_issues[0].number
                target_issue = self._find_issue(issues, target_issue_number)

            # --- Agent 2: Archaeologist ---
            self._update_status(
                f"🔭 Agent 2 (Archaeologist): Searching code for issue #{target_issue.number}..."
            )
            agent2_output = self.agent2.run(target_issue, repo_path, file_tree)

            # --- Agent 3: Senior Dev ---
            self._update_status("👨‍💻 Agent 3 (Senior Dev): Generating briefing document...")
            agent3_output = self.agent3.run(
                repo, target_issue, agent1_output, agent2_output
            )

            # --- Agent 4: Testing Agent (QA) with feedback loop ---
            testing_output = self._run_qa_loop(
                repo=repo,
                issue=target_issue,
                issues=issues,
                agent1_output=agent1_output,
                agent2_output=agent2_output,
                agent3_output=agent3_output,
                repo_path=repo_path,
                file_tree=file_tree,
                top_issues=top_issues,
            )

            # Use the (possibly improved) outputs from the QA loop
            agent1_output = testing_output.pop("agent1_output")
            agent2_output = testing_output.pop("agent2_output")
            agent3_output = testing_output.pop("agent3_output")
            qa_output: TestingAgentOutput = testing_output["testing_output"]

            self._update_status("✅ Analysis complete!")

            duration = (datetime.now() - start_time).total_seconds()

            run_log = RunLog(
                timestamp=start_time.isoformat(),
                repo_url=repo_url,
                selected_issue=target_issue_number,
                agent1_output=agent1_output,
                agent2_output=agent2_output,
                agent3_output=agent3_output,
                testing_output=qa_output,
                duration_seconds=duration,
            )
            self.cache.save_run_log(run_log)

            return {
                "success": True,
                "repo": repo,
                "issues": issues,
                "target_issue": target_issue,
                "agent1_output": agent1_output,
                "agent2_output": agent2_output,
                "agent3_output": agent3_output,
                "testing_output": qa_output,
                "duration_seconds": duration,
            }

        except Exception as e:
            logger.exception("Pipeline failed")
            self._update_status(f"❌ Error: {e}")
            return {"success": False, "error": str(e)}
    
    # ------------------------------------------------------------------
    # Phased execution (used by the API for two-step UI flow)
    # ------------------------------------------------------------------

    def run_phase1(
        self,
        repo_url: str,
        beginner_only: bool = True,
        top_issues: int = 3,
    ) -> dict:
        """Run only Phase 1: Issue ranking."""
        try:
            self._update_status("📡 Fetching repository information...")
            repo = self.github.get_repo(repo_url)

            self._update_status("🔍 Fetching issues...")
            issues = self.github.get_issues(repo_url, beginner_only=beginner_only)

            if not issues:
                return {
                    "success": False,
                    "error": "No issues found matching criteria",
                    "repo": repo,
                }

            self._update_status(f"🏥 Ranking {len(issues)} issues...")
            agent1_output = self.agent1.run(repo, issues, top_n=top_issues)

            return {
                "success": True,
                "repo": repo,
                "issues": issues,
                "agent1_output": agent1_output,
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def run_phase2(self, repo_url: str, issue: GitHubIssue) -> dict:
        """Run Phase 2: Code location for a specific issue."""
        try:
            self._update_status("📦 Cloning repository...")
            repo_path = self.github.clone_repo(repo_url)

            self._update_status("🗂️ Analyzing repository structure...")
            file_tree = self.github.get_file_tree(repo_path)

            self._update_status(f"🔭 Searching code for issue #{issue.number}...")
            agent2_output = self.agent2.run(issue, repo_path, file_tree)

            return {
                "success": True,
                "agent2_output": agent2_output,
                "repo_path": repo_path,
                "file_tree": file_tree,
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def run_phase3(
        self,
        repo: GitHubRepo,
        issue: GitHubIssue,
        agent1_output: Agent1Output,
        agent2_output: Agent2Output,
    ) -> dict:
        """Run Phase 3: Generate briefing document."""
        try:
            self._update_status("👨‍💻 Generating contributor briefing...")
            agent3_output = self.agent3.run(repo, issue, agent1_output, agent2_output)
            return {"success": True, "agent3_output": agent3_output}

        except Exception as e:
            return {"success": False, "error": str(e)}

    def run_testing(
        self,
        repo: GitHubRepo,
        issue: GitHubIssue,
        agent1_output: Agent1Output,
        agent2_output: Agent2Output,
        agent3_output: Agent3Output,
        repo_path: Optional[Path] = None,
        file_tree: Optional[List[str]] = None,
        pathfinder_output=None,
    ) -> dict:
        """Run QA Testing Agent with feedback loop (retries failing agents up to MAX_QA_RETRIES)."""
        try:
            issues_list: list = []

            result = self._run_qa_loop(
                repo=repo,
                issue=issue,
                issues=issues_list,
                agent1_output=agent1_output,
                agent2_output=agent2_output,
                agent3_output=agent3_output,
                repo_path=repo_path or Path("."),
                file_tree=file_tree or [],
                pathfinder_output=pathfinder_output,
            )

            return {
                "success": True,
                "testing_output": result["testing_output"],
                "agent2_output": result["agent2_output"],
                "agent3_output": result["agent3_output"],
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # QA feedback loop (used by the full pipeline)
    # ------------------------------------------------------------------

    def _run_qa_loop(
        self,
        repo: GitHubRepo,
        issue: GitHubIssue,
        issues: list,
        agent1_output: Agent1Output,
        agent2_output: Agent2Output,
        agent3_output: Agent3Output,
        repo_path: Path,
        file_tree: List[str],
        top_issues: int = 3,
        pathfinder_output=None,
    ) -> dict:
        """
        Run the Testing Agent and, if needed, retry failing agents
        with QA feedback up to MAX_QA_RETRIES times.

        Returns a dict with the (possibly updated) agent outputs and testing report.
        """
        for iteration in range(MAX_QA_RETRIES + 1):
            round_label = f"(round {iteration + 1}/{MAX_QA_RETRIES + 1})"
            self._update_status(
                f"🧪 Agent 4 (Testing Agent): Validating outputs {round_label}..."
            )

            testing_output = self.testing_agent.run(
                repo=repo,
                issue=issue,
                agent1_output=agent1_output,
                agent2_output=agent2_output,
                agent3_output=agent3_output,
                repo_path=repo_path,
                file_tree=file_tree,
                pathfinder_output=pathfinder_output,
            )
            testing_output.iterations_used = iteration + 1

            if testing_output.overall_passed or iteration == MAX_QA_RETRIES:
                break

            # --- Apply feedback and re-run failing agents ---
            self._update_status(
                f"🔄 QA found issues — retrying: {', '.join(testing_output.retry_agents)}..."
            )

            # Build per-agent feedback strings
            feedback_map: dict[str, str] = {}
            for result in testing_output.agent_results:
                if not result.passed:
                    parts = []
                    if result.issues_found:
                        parts.append("Issues: " + "; ".join(result.issues_found))
                    if result.suggestions:
                        parts.append("Suggestions: " + "; ".join(result.suggestions))
                    feedback_map[result.agent_name] = "\n".join(parts)

            # Determine cascade: if an upstream agent is retried,
            # downstream agents must also re-run.
            rerun_1 = "Triage Nurse" in feedback_map
            rerun_2 = "Archaeologist" in feedback_map or rerun_1
            rerun_3 = "Senior Dev" in feedback_map or rerun_2

            if rerun_1:
                self.agent1.set_feedback(feedback_map.get("Triage Nurse", ""))
                self._update_status("🏥 Retrying Agent 1 (Triage Nurse) with QA feedback...")
                agent1_output = self.agent1.run(repo, issues, top_n=top_issues)
                self.agent1.clear_feedback()

            if rerun_2:
                self.agent2.set_feedback(feedback_map.get("Archaeologist", ""))
                self._update_status("🔭 Retrying Agent 2 (Archaeologist) with QA feedback...")
                agent2_output = self.agent2.run(issue, repo_path, file_tree)
                self.agent2.clear_feedback()

            if rerun_3:
                self.agent3.set_feedback(feedback_map.get("Senior Dev", ""))
                self._update_status("👨‍💻 Retrying Agent 3 (Senior Dev) with QA feedback...")
                agent3_output = self.agent3.run(
                    repo, issue, agent1_output, agent2_output
                )
                self.agent3.clear_feedback()

        return {
            "agent1_output": agent1_output,
            "agent2_output": agent2_output,
            "agent3_output": agent3_output,
            "testing_output": testing_output,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _find_issue(
        issues: list, number: int
    ) -> Optional[GitHubIssue]:
        return next((i for i in issues if i.number == number), None)

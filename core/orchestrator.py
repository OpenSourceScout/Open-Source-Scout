"""
Orchestrator - Coordinates the multi-agent pipeline using LangGraph.

Uses a LangGraph StateGraph to model the agent pipeline as a proper
state machine with conditional edges for the QA feedback loop.
"""
import errno
import logging
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

from core.agents.triage_nurse import TriageNurseAgent
from core.agents.archaeologist import ArchaeologistAgent
from core.agents.senior_dev import SeniorDevAgent
from core.agents.testing_agent import TestingAgent
from core.schemas import (
    GitHubRepo, GitHubIssue,
    Agent1Output, Agent2Output, Agent3Output, TestingAgentOutput, RunLog,
)
from integrations.github_client import GitHubClient
from integrations.groq_client import GroqClient, MODEL_LLAMA_4_SCOUT_17B
from utils.cache import CacheManager

logger = logging.getLogger(__name__)

MAX_QA_RETRIES = 2


# ---------------------------------------------------------------------------
# LangGraph State definition
# ---------------------------------------------------------------------------

class PipelineState(TypedDict, total=False):
    """Shared state flowing through the LangGraph pipeline."""
    # Inputs
    repo_url: str
    beginner_only: bool
    top_issues: int
    selected_issue_number: Optional[int]

    # Data gathered
    repo: Optional[GitHubRepo]
    issues: Optional[List[GitHubIssue]]
    target_issue: Optional[GitHubIssue]
    repo_path: Optional[Path]
    file_tree: Optional[List[str]]

    # Agent outputs
    agent1_output: Optional[Agent1Output]
    agent2_output: Optional[Agent2Output]
    agent3_output: Optional[Agent3Output]
    testing_output: Optional[TestingAgentOutput]

    # QA loop control
    qa_iteration: int
    max_qa_retries: int
    retry_agents: List[str]
    qa_feedback: Dict[str, str]

    # Pipeline metadata
    success: bool
    error: Optional[str]
    duration_seconds: float


class ScoutOrchestrator:
    """
    Orchestrates the multi-agent pipeline for issue analysis using LangGraph.

    Pipeline (modeled as a LangGraph StateGraph):
    1. Triage Nurse: Fetch and rank issues
    2. Archaeologist: Locate relevant code
    3. Senior Dev: Generate fix plan and PR draft
    4. Testing Agent: Validate all outputs; retry failing agents up to MAX_QA_RETRIES times

    The QA feedback loop is implemented as a conditional edge cycle in the graph.
    """

    def __init__(
        self,
        github_client: GitHubClient,
        groq_client: GroqClient,
        cache_manager: Optional[CacheManager] = None,
        fast_model: str = "openai/gpt-oss-120b",
        powerful_model: str = "llama-3.3-70b",
        triage_model: Optional[str] = None,
        testing_model: Optional[str] = None,
    ):
        self.github = github_client
        self.groq = groq_client
        self.cache = cache_manager or CacheManager()

        triage_m = triage_model or MODEL_LLAMA_4_SCOUT_17B
        testing_m = testing_model or MODEL_LLAMA_4_SCOUT_17B

        self.agent1 = TriageNurseAgent(groq_client, model=triage_m)
        self.agent2 = ArchaeologistAgent(groq_client, model=fast_model)
        self.agent3 = SeniorDevAgent(groq_client, model=powerful_model)
        self.testing_agent = TestingAgent(groq_client, model=testing_m)

        self._status_callback: Optional[Callable[[str], None]] = None

    def set_status_callback(self, callback: Callable[[str], None]):
        """Set callback for status updates."""
        self._status_callback = callback

    def _update_status(self, message: str):
        """Update status via callback if set."""
        logger.info(message)
        if self._status_callback:
            self._status_callback(message)

    # ------------------------------------------------------------------
    # LangGraph: Full pipeline graph builder
    # ------------------------------------------------------------------

    def _build_full_graph(self):
        """
        Build the full LangGraph StateGraph for the complete pipeline.

        Graph topology:
          START -> fetch_data -> triage_nurse -> archaeologist -> senior_dev
                -> qa_validator --(conditional)--> apply_feedback -> retry_router
                                                                     |-> triage_nurse
                                                                     |-> archaeologist
                                                                     |-> senior_dev
                                 --(pass/max retries)--> finalize -> END
        """
        graph = StateGraph(PipelineState)

        # -- Add nodes --
        graph.add_node("fetch_data", self._node_fetch_data)
        graph.add_node("triage_nurse", self._node_triage_nurse)
        graph.add_node("archaeologist", self._node_archaeologist)
        graph.add_node("senior_dev", self._node_senior_dev)
        graph.add_node("qa_validator", self._node_qa_validator)
        graph.add_node("apply_feedback", self._node_apply_feedback)
        graph.add_node("finalize", self._node_finalize)

        # -- Add edges --
        graph.add_edge(START, "fetch_data")
        graph.add_edge("fetch_data", "triage_nurse")
        graph.add_edge("triage_nurse", "archaeologist")
        graph.add_edge("archaeologist", "senior_dev")
        graph.add_edge("senior_dev", "qa_validator")

        # Conditional edge: after QA, decide whether to retry or finalize
        graph.add_conditional_edges(
            "qa_validator",
            self._should_retry,
            {
                "apply_feedback": "apply_feedback",
                "finalize": "finalize",
            },
        )

        # After applying feedback, route to the earliest failing agent
        graph.add_conditional_edges(
            "apply_feedback",
            self._retry_router,
            {
                "triage_nurse": "triage_nurse",
                "archaeologist": "archaeologist",
                "senior_dev": "senior_dev",
            },
        )

        graph.add_edge("finalize", END)

        return graph.compile()

    # ------------------------------------------------------------------
    # LangGraph: QA-only graph builder (for run_testing)
    # ------------------------------------------------------------------

    def _build_qa_graph(self):
        """Build a smaller graph for just the QA feedback loop."""
        graph = StateGraph(PipelineState)

        graph.add_node("qa_validator", self._node_qa_validator)
        graph.add_node("apply_feedback", self._node_apply_feedback)
        graph.add_node("retry_archaeologist", self._node_archaeologist)
        graph.add_node("retry_senior_dev", self._node_senior_dev)
        graph.add_node("retry_triage", self._node_triage_nurse)
        graph.add_node("finalize_qa", self._node_finalize_qa)

        graph.add_edge(START, "qa_validator")

        graph.add_conditional_edges(
            "qa_validator",
            self._should_retry,
            {
                "apply_feedback": "apply_feedback",
                "finalize": "finalize_qa",
            },
        )

        graph.add_conditional_edges(
            "apply_feedback",
            self._retry_router,
            {
                "triage_nurse": "retry_triage",
                "archaeologist": "retry_archaeologist",
                "senior_dev": "retry_senior_dev",
            },
        )

        graph.add_edge("retry_triage", "retry_archaeologist")
        graph.add_edge("retry_archaeologist", "retry_senior_dev")
        graph.add_edge("retry_senior_dev", "qa_validator")
        graph.add_edge("finalize_qa", END)

        return graph.compile()

    # ------------------------------------------------------------------
    # LangGraph Node functions
    # ------------------------------------------------------------------

    def _node_fetch_data(self, state: PipelineState) -> dict:
        """Node: Fetch repository info, issues, clone repo, build file tree."""
        self._update_status("📡 Fetching repository information...")
        repo = self.github.get_repo(state["repo_url"])

        self._update_status("🔍 Fetching issues...")
        issues = self.github.get_issues(
            state["repo_url"],
            beginner_only=state.get("beginner_only", True),
        )

        if not issues:
            self._update_status("⚠️ No issues found matching criteria")
            return {
                "repo": repo,
                "issues": [],
                "success": False,
                "error": "No issues found. Try disabling 'Beginner-only mode' to see all issues.",
            }

        self._update_status(f"Found {len(issues)} issues")

        self._update_status("📦 Cloning repository (this may take a moment)...")
        repo_path = self.github.clone_repo(state["repo_url"])

        self._update_status("🗂️ Analyzing repository structure...")
        file_tree = self.github.get_file_tree(repo_path)

        return {
            "repo": repo,
            "issues": issues,
            "repo_path": repo_path,
            "file_tree": file_tree,
            "success": True,
        }

    def _node_triage_nurse(self, state: PipelineState) -> dict:
        """Node: Run Agent 1 (Triage Nurse) to rank issues."""
        if state.get("error"):
            return {}

        self._update_status("🏥 Agent 1 (Triage Nurse): Ranking issues...")
        agent1_output = self.agent1.run(
            state["repo"],
            state["issues"],
            top_n=state.get("top_issues", 3),
        )

        if not agent1_output.ranked_issues:
            return {
                "agent1_output": agent1_output,
                "success": False,
                "error": "Could not rank any issues",
            }

        # Resolve target issue
        selected = state.get("selected_issue_number") or agent1_output.selected_issue_number
        target = self._find_issue(state["issues"], selected)
        if not target:
            selected = agent1_output.ranked_issues[0].number
            target = self._find_issue(state["issues"], selected)

        return {
            "agent1_output": agent1_output,
            "target_issue": target,
        }

    def _node_archaeologist(self, state: PipelineState) -> dict:
        """Node: Run Agent 2 (Archaeologist) to locate code."""
        if state.get("error"):
            return {}

        target = state.get("target_issue")
        if not target:
            return {}

        self._update_status(
            f"🔭 Agent 2 (Archaeologist): Searching code for issue #{target.number}..."
        )
        agent2_output = self.agent2.run(
            target,
            state["repo_path"],
            state["file_tree"],
        )
        return {"agent2_output": agent2_output}

    def _node_senior_dev(self, state: PipelineState) -> dict:
        """Node: Run Agent 3 (Senior Dev) to generate briefing."""
        if state.get("error"):
            return {}

        self._update_status("👨‍💻 Agent 3 (Senior Dev): Generating briefing document...")
        agent3_output = self.agent3.run(
            state["repo"],
            state["target_issue"],
            state["agent1_output"],
            state["agent2_output"],
        )
        return {"agent3_output": agent3_output}

    def _node_qa_validator(self, state: PipelineState) -> dict:
        """Node: Run Agent 4 (Testing Agent) for QA validation."""
        if state.get("error"):
            return {}

        iteration = state.get("qa_iteration", 0) + 1
        max_retries = state.get("max_qa_retries", MAX_QA_RETRIES)
        round_label = f"(round {iteration}/{max_retries + 1})"

        self._update_status(
            f"🧪 Agent 4 (Testing Agent): Validating outputs {round_label}..."
        )

        testing_output = self.testing_agent.run(
            repo=state["repo"],
            issue=state["target_issue"],
            agent1_output=state["agent1_output"],
            agent2_output=state["agent2_output"],
            agent3_output=state["agent3_output"],
            repo_path=state.get("repo_path"),
            file_tree=state.get("file_tree"),
        )
        testing_output.iterations_used = iteration

        return {
            "testing_output": testing_output,
            "qa_iteration": iteration,
        }

    def _node_apply_feedback(self, state: PipelineState) -> dict:
        """Node: Extract QA feedback and set it on failing agents."""
        testing_output = state["testing_output"]

        self._update_status(
            f"🔄 QA found issues — retrying: {', '.join(testing_output.retry_agents)}..."
        )

        feedback_map: Dict[str, str] = {}
        for result in testing_output.agent_results:
            if not result.passed:
                parts = []
                if result.issues_found:
                    parts.append("Issues: " + "; ".join(result.issues_found))
                if result.suggestions:
                    parts.append("Suggestions: " + "; ".join(result.suggestions))
                feedback_map[result.agent_name] = "\n".join(parts)

        # Determine cascade
        rerun_1 = "Triage Nurse" in feedback_map
        rerun_2 = "Archaeologist" in feedback_map or rerun_1
        rerun_3 = "Senior Dev" in feedback_map or rerun_2

        retry_agents: List[str] = []
        if rerun_1:
            retry_agents.append("Triage Nurse")
            self.agent1.set_feedback(feedback_map.get("Triage Nurse", ""))
        if rerun_2:
            retry_agents.append("Archaeologist")
            self.agent2.set_feedback(feedback_map.get("Archaeologist", ""))
        if rerun_3:
            retry_agents.append("Senior Dev")
            self.agent3.set_feedback(feedback_map.get("Senior Dev", ""))

        return {
            "retry_agents": retry_agents,
            "qa_feedback": feedback_map,
        }

    def _node_finalize(self, state: PipelineState) -> dict:
        """Node: Final node in the full pipeline — clear feedback."""
        self.agent1.clear_feedback()
        self.agent2.clear_feedback()
        self.agent3.clear_feedback()
        self._update_status("✅ Analysis complete!")
        return {"success": True}

    def _node_finalize_qa(self, state: PipelineState) -> dict:
        """Node: Final node for QA-only graph."""
        self.agent1.clear_feedback()
        self.agent2.clear_feedback()
        self.agent3.clear_feedback()
        return {}

    # ------------------------------------------------------------------
    # LangGraph Conditional edge functions
    # ------------------------------------------------------------------

    def _should_retry(self, state: PipelineState) -> str:
        """Decide whether to retry agents or finalize after QA."""
        testing_output = state.get("testing_output")
        if testing_output is None:
            return "finalize"

        iteration = state.get("qa_iteration", 1)
        max_retries = state.get("max_qa_retries", MAX_QA_RETRIES)

        if testing_output.overall_passed or iteration > max_retries:
            return "finalize"

        return "apply_feedback"

    def _retry_router(self, state: PipelineState) -> str:
        """Route to the earliest failing agent for retry."""
        retry_agents = state.get("retry_agents", [])
        if "Triage Nurse" in retry_agents:
            return "triage_nurse"
        if "Archaeologist" in retry_agents:
            return "archaeologist"
        return "senior_dev"

    # ------------------------------------------------------------------
    # Public API — Full pipeline run
    # ------------------------------------------------------------------

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
            compiled = self._build_full_graph()

            initial_state: PipelineState = {
                "repo_url": repo_url,
                "beginner_only": beginner_only,
                "top_issues": top_issues,
                "selected_issue_number": selected_issue_number,
                "qa_iteration": 0,
                "max_qa_retries": MAX_QA_RETRIES,
                "retry_agents": [],
                "qa_feedback": {},
                "success": True,
            }

            final_state = compiled.invoke(initial_state)

            duration = (datetime.now() - start_time).total_seconds()

            if not final_state.get("success", False) or final_state.get("error"):
                return {
                    "success": False,
                    "error": final_state.get("error", "Pipeline failed"),
                    "repo": final_state.get("repo"),
                    "agent1_output": final_state.get("agent1_output"),
                }

            # Save run log
            target_issue = final_state.get("target_issue")
            run_log = RunLog(
                timestamp=start_time.isoformat(),
                repo_url=repo_url,
                selected_issue=target_issue.number if target_issue else 0,
                agent1_output=final_state.get("agent1_output"),
                agent2_output=final_state.get("agent2_output"),
                agent3_output=final_state.get("agent3_output"),
                testing_output=final_state.get("testing_output"),
                duration_seconds=duration,
            )
            self.cache.save_run_log(run_log)

            return {
                "success": True,
                "repo": final_state.get("repo"),
                "issues": final_state.get("issues"),
                "target_issue": target_issue,
                "agent1_output": final_state.get("agent1_output"),
                "agent2_output": final_state.get("agent2_output"),
                "agent3_output": final_state.get("agent3_output"),
                "testing_output": final_state.get("testing_output"),
                "duration_seconds": duration,
            }

        except Exception as e:
            logger.exception("Pipeline failed")
            error_msg = str(e)
            if "RateLimitError" in error_msg or "rate limit" in error_msg.lower():
                error_msg = "API rate limit exceeded. Please try again later or configure a new API key."
            self._update_status(f"❌ Error: {error_msg}")
            return {"success": False, "error": error_msg}

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
            error_msg = str(e)
            if "RateLimitError" in error_msg or "rate limit" in error_msg.lower():
                error_msg = "API rate limit exceeded. Please try again later."
            return {"success": False, "error": error_msg}

    def run_phase2(self, repo_url: str, issue: GitHubIssue) -> dict:
        """Run Phase 2: Code location for a specific issue."""
        repo_path = None
        try:
            self._update_status("📦 Cloning repository...")
            try:
                repo_path = self.github.clone_repo(repo_url)
            except (OSError, RuntimeError) as e:
                logger.exception("Phase 2 failed during git clone")
                cache = getattr(self.github, "cache_dir", "")
                return {
                    "success": False,
                    "error": (
                        f"Git clone failed: {e}. "
                        f"Clone cache directory is {cache}. "
                        "If this project lives under OneDrive, set environment variable "
                        "OSS_REPO_CACHE to a path outside OneDrive (e.g. C:/dev/oss-repos) "
                        "and restart the backend."
                    ),
                }

            self._update_status("🗂️ Analyzing repository structure...")
            try:
                file_tree = self.github.get_file_tree(repo_path)
            except OSError as e:
                logger.exception("Phase 2 failed while scanning repository tree")
                return {
                    "success": False,
                    "error": (
                        f"Repository file scan failed: {e}. "
                        f"Clone path: {repo_path}."
                    ),
                }

            self._update_status(f"🔭 Searching code for issue #{issue.number}...")
            try:
                agent2_output = self.agent2.run(issue, repo_path, file_tree)
            except OSError as e:
                logger.exception("Phase 2 failed during code search (Archaeologist)")
                return {
                    "success": False,
                    "error": f"Code search failed: {e}",
                }

            return {
                "success": True,
                "agent2_output": agent2_output,
                "repo_path": repo_path,
                "file_tree": file_tree,
            }

        except Exception as e:
            logger.exception("Phase 2 failed (unexpected error)")
            error_msg = str(e)
            if "RateLimitError" in error_msg or "rate limit" in error_msg.lower():
                error_msg = "API rate limit exceeded. Please try again later."
            elif isinstance(e, OSError) and getattr(e, "errno", None) == errno.EINVAL:
                error_msg = (
                    "Windows [Errno 22] Invalid argument — usually OneDrive, a stuck git cache, or a bad "
                    "backend port. Fix: (1) Stop all Python/uvicorn, run Open-Source-Scout\\run-backend.ps1 "
                    "(uses port 8003 by default), (2) In frontend folder run: "
                    "$env:OSS_API_PROXY_TARGET='http://localhost:8003'; npm run dev "
                    "(3) Optional: set OSS_REPO_CACHE to a folder outside OneDrive. "
                    f"Original: {e}"
                )
            return {"success": False, "error": error_msg}

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
            error_msg = str(e)
            if "RateLimitError" in error_msg or "rate limit" in error_msg.lower():
                error_msg = "API rate limit exceeded. Please try again later."
            return {"success": False, "error": error_msg}

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
        """Run QA Testing Agent with feedback loop using LangGraph."""
        try:
            result = self._run_qa_loop(
                repo=repo,
                issue=issue,
                issues=[],
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
            error_msg = str(e)
            if "RateLimitError" in error_msg or "rate limit" in error_msg.lower():
                error_msg = "API rate limit exceeded. Please try again later."
            return {"success": False, "error": error_msg}

    # ------------------------------------------------------------------
    # QA feedback loop — LangGraph powered
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

        Uses a LangGraph StateGraph internally for the QA cycle.

        Returns a dict with the (possibly updated) agent outputs and testing report.
        """
        compiled = self._build_qa_graph()

        # Inject the current state for the QA graph
        qa_state: PipelineState = {
            "repo": repo,
            "target_issue": issue,
            "issues": issues,
            "agent1_output": agent1_output,
            "agent2_output": agent2_output,
            "agent3_output": agent3_output,
            "repo_path": repo_path,
            "file_tree": file_tree,
            "top_issues": top_issues,
            "qa_iteration": 0,
            "max_qa_retries": MAX_QA_RETRIES,
            "retry_agents": [],
            "qa_feedback": {},
            "success": True,
        }

        final_state = compiled.invoke(qa_state)

        return {
            "agent1_output": final_state.get("agent1_output", agent1_output),
            "agent2_output": final_state.get("agent2_output", agent2_output),
            "agent3_output": final_state.get("agent3_output", agent3_output),
            "testing_output": final_state.get("testing_output"),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _find_issue(
        issues: list, number: int
    ) -> Optional[GitHubIssue]:
        return next((i for i in issues if i.number == number), None)

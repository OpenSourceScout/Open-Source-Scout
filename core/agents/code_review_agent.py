from __future__ import annotations

from typing import List, Dict, Any, Optional
import difflib
import re

from core.agents.base import BaseAgent
from core.schemas import GitHubIssue, CodeReviewOutput, CodeReviewFileFeedback
from utils.text_chunking import truncate_to_tokens


class LearningReviewAgent(BaseAgent):
    """
    Agent responsible for reviewing code changes against an issue and briefing report.
    Provides educational feedback without returning code or patches.
    """

    def __init__(
        self,
        groq_client,
        model: Optional[str] = None,
    ):
        super().__init__(groq_client, model or "openai/gpt-oss-120b")

    @property
    def name(self) -> str:
        return "Learning Reviewer"

    @property
    def role_prompt(self) -> str:
        return (
            "You are the Learning Reviewer agent. Your goal is to check whether the user's code changes "
            "resolve the selected issue while helping them learn.\n\n"
            "Rules:\n"
            "- Do NOT output code, patches, or exact code lines.\n"
            "- Do NOT quote more than a few tokens from the code.\n"
            "- Provide conceptual guidance: what is missing, why it matters, and how to verify.\n"
            "- Be concise, actionable, and kind.\n"
            "- Always provide feedback for every file in the input list."
        )

    def run(
        self,
        review_files: List[Dict[str, str]],
        target_issue: GitHubIssue,
        briefing_markdown: str,
    ) -> Dict[str, Any]:
        self.activate_agent_llm_context()
        self.log(f"Starting learning review for issue #{target_issue.number}")

        prompt = self._build_prompt(review_files, target_issue, briefing_markdown)

        result = self.groq.complete_structured(
            prompt=prompt,
            response_model=CodeReviewOutput,
            model=self.model,
            system_prompt=self.role_prompt,
            agent_name=self.name,
            temperature=0.2,
            max_tokens=2048,
        )

        normalized = self._normalize_output(result, review_files)
        self.log(f"Learning review completed for issue #{target_issue.number}")
        return normalized.model_dump()

    def _build_prompt(
        self,
        review_files: List[Dict[str, str]],
        target_issue: GitHubIssue,
        briefing_markdown: str,
    ) -> str:
        issue_text = f"Issue #{target_issue.number}: {target_issue.title}\n\n{target_issue.body or ''}"
        issue_text = truncate_to_tokens(issue_text, 400)
        briefing_text = truncate_to_tokens(briefing_markdown or "", 600)

        file_count = max(len(review_files), 1)
        total_file_budget = 2000
        per_file_budget = max(200, min(800, total_file_budget // file_count))

        file_sections: list[str] = []
        for idx, file_data in enumerate(review_files, start=1):
            file_path = file_data.get("path", "")
            diff_text = self._make_diff(file_data.get("original", ""), file_data.get("modified", ""))
            diff_text = truncate_to_tokens(diff_text, per_file_budget)
            file_sections.append(
                f"## File {idx}: {file_path}\n"
                f"Diff:\n{diff_text}\n"
            )

        files_block = "\n".join(file_sections) if file_sections else "(no files provided)"

        return (
            "Review the following code changes. Determine whether the changes resolve the issue and align "
            "with the briefing plan. Provide learning-oriented feedback without code.\n\n"
            "Respond with JSON matching the schema, and include feedback for every file.\n\n"
            f"Issue:\n{issue_text}\n\n"
            f"Briefing excerpt:\n{briefing_text}\n\n"
            f"Changed files and diffs:\n{files_block}\n\n"
            "Output guidance:\n"
            "- overall_status: approved or needs_improvement\n"
            "- summary: 1-2 sentences\n"
            "- file_feedback: per file, 1-4 bullet-like sentences in review_comments\n"
            "- can_push: true (always)"
        )

    def _make_diff(self, original: str, modified: str) -> str:
        if original == modified:
            return "(no changes detected)"
        diff = difflib.unified_diff(
            original.splitlines(),
            modified.splitlines(),
            fromfile="original",
            tofile="modified",
            lineterm="",
        )
        diff_text = "\n".join(list(diff)[:400])
        return diff_text or "(diff unavailable)"

    def _normalize_output(
        self,
        result: CodeReviewOutput,
        review_files: List[Dict[str, str]],
    ) -> CodeReviewOutput:
        if result.overall_status not in ("approved", "needs_improvement"):
            result.overall_status = "needs_improvement"

        if not (result.summary or "").strip():
            result.summary = (
                "Changes look aligned with the issue." if result.overall_status == "approved"
                else "Some changes may still be missing to fully resolve the issue."
            )

        feedback_by_path = {fb.file_path: fb for fb in result.file_feedback}
        normalized_feedback: list[CodeReviewFileFeedback] = []

        for file_data in review_files:
            path = file_data.get("path", "")
            fb = feedback_by_path.get(path)
            if fb is None:
                fb = CodeReviewFileFeedback(
                    file_path=path,
                    status="needs_review",
                    review_comments=[
                        "Review note missing for this file. Re-check the change against the issue intent."
                    ],
                )
            fb.review_comments = [
                c for c in (self._sanitize_comment(x) for x in fb.review_comments) if c
            ]
            if not fb.review_comments:
                fb.review_comments = [
                    "No major issues spotted. Verify behavior and run the suggested tests."
                ]
            if fb.status not in ("approved", "needs_improvement", "needs_review"):
                fb.status = "needs_review"
            normalized_feedback.append(fb)

        result.file_feedback = normalized_feedback
        result.can_push = True
        return result

    def _sanitize_comment(self, text: str) -> str:
        cleaned = re.sub(r"```.*?```", "", text or "", flags=re.S)
        cleaned = cleaned.replace("`", "")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if len(cleaned) > 280:
            cleaned = cleaned[:277].rstrip() + "..."
        return cleaned


class CodeReviewAgent(LearningReviewAgent):
    """Backwards-compatible alias for the Learning Reviewer agent."""

    pass

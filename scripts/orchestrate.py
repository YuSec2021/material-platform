#!/usr/bin/env python3
"""State-driven orchestrator for planning, iteration, and bugfix flows."""

from __future__ import annotations

import argparse
import json
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RETRY_LIMIT = 2
SPRINT_PASS = "SPRINT PASS"
SPRINT_FAIL = "SPRINT FAIL"
CONTRACT_APPROVED = "CONTRACT APPROVED"
CODEX_EXEC_MODERN_MIN_VERSION = (0, 120, 0)


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def append_ndjson(path: Path, payload: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def compress_progress(path: Path) -> None:
    if not path.exists():
        return
    lines = read_text(path).splitlines()
    sprint_headers = [idx for idx, line in enumerate(lines) if line.startswith("## Sprint ")]
    should_compress = (
        len(lines) > 60
        or len(sprint_headers) > 3
        or any("Traceback" in line or "FAILED" in line for line in lines)
    )
    if not should_compress:
        return

    summary = [line for line in lines if line.strip()][:5]
    if not summary:
        summary = ["Project summary compressed by orchestrator."]

    entries: list[str] = []
    for header_index in sprint_headers[-3:]:
        next_headers = [idx for idx in sprint_headers if idx > header_index]
        end_index = next_headers[0] if next_headers else len(lines)
        entries.extend([line for line in lines[header_index:end_index] if line.strip()][:5])
        entries.append("")

    write_text(path, "\n".join(summary + [""] + entries).rstrip() + "\n")


def extract_sprint_id(value: str) -> int | None:
    match = re.search(r"sprint=(\d+)", value)
    return int(match.group(1)) if match else None


def eval_sprint_id(path: Path) -> int | None:
    match = re.search(r"eval-result-(\d+)", path.name)
    return int(match.group(1)) if match else None


def parse_semver(version: str) -> tuple[int, int, int] | None:
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", version)
    if not match:
        return None
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def codex_version_tuple() -> tuple[int, int, int] | None:
    try:
        result = subprocess.run(
            ["codex", "--version"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    return parse_semver(f"{result.stdout}\n{result.stderr}")


def codex_command(prompt: str) -> str:
    quoted_prompt = shlex.quote(prompt)
    version = codex_version_tuple()
    if version is not None and version >= CODEX_EXEC_MODERN_MIN_VERSION:
        return f"codex exec --full-auto --skip-git-repo-check {quoted_prompt}"
    return f"codex -a never exec --skip-git-repo-check {quoted_prompt}"


def parse_key(text: str, key: str) -> str | None:
    match = re.search(rf"^{re.escape(key)}\s*:\s*(.+)$", text, flags=re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip() if match else None


@dataclass
class RouteDecision:
    rule: str
    action: str
    rationale: str
    mode: str
    current_sprint: int
    command: str | None = None
    prompt: str | None = None
    needs_human: bool = False
    last_failure_reason: str = ""
    cleanup_eval_trigger: bool = False


class HarnessProject:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.spec_path = self.root / "planner-spec.json"
        self.contract_path = self.root / "sprint-contract.md"
        self.eval_trigger_path = self.root / "eval-trigger.txt"
        self.progress_path = self.root / "claude-progress.txt"
        self.run_state_path = self.root / "run-state.json"
        self.log_path = self.root / "orchestrator-log.ndjson"
        self.events_path = self.root / "run-events.ndjson"
        self.change_request_path = self.root / "change-request.md"
        self.bug_report_path = self.root / "bug-report.md"

    def load_run_state(self) -> dict[str, Any]:
        if not self.run_state_path.exists():
            return {
                "mode": "planning",
                "current_sprint": 0,
                "retry_count": 0,
                "last_successful_sprint": 0,
                "last_failure_reason": "",
                "needs_human": False,
                "active_branch": "",
                "base_branch": "",
                "last_run_at": "",
                "request_kind": "",
            }
        return json.loads(read_text(self.run_state_path))

    def save_run_state(self, state: dict[str, Any]) -> None:
        write_text(self.run_state_path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")

    def planner_spec(self) -> dict[str, Any]:
        return json.loads(read_text(self.spec_path))

    def eval_results(self) -> list[Path]:
        return sorted(self.root.glob("eval-result-*.md"))

    def passing_sprints(self) -> set[int]:
        passed: set[int] = set()
        for path in self.eval_results():
            sprint_id = eval_sprint_id(path)
            if sprint_id is not None and SPRINT_PASS in read_text(path):
                passed.add(sprint_id)
        return passed

    def current_sprint(self) -> int:
        spec = self.planner_spec()
        passed = self.passing_sprints()
        for sprint in spec.get("sprints", []):
            sprint_id = int(sprint["id"])
            if sprint.get("skipped"):
                continue
            if sprint_id not in passed:
                return sprint_id
        return 0

    def all_sprints_complete(self) -> bool:
        spec = self.planner_spec()
        passed = self.passing_sprints()
        for sprint in spec.get("sprints", []):
            sprint_id = int(sprint["id"])
            if sprint.get("skipped"):
                continue
            if sprint_id not in passed:
                return False
        return True

    def latest_failed_eval(self, sprint_id: int) -> Path | None:
        candidates = sorted(self.root.glob(f"eval-result-{sprint_id}*.md"))
        for path in reversed(candidates):
            if SPRINT_FAIL in read_text(path):
                return path
        return None

    def observed_state(self) -> dict[str, Any]:
        run_state = self.load_run_state()
        observed: dict[str, Any] = {
            "project_dir": str(self.root),
            "has_spec": self.spec_path.exists(),
            "has_contract": self.contract_path.exists(),
            "contract_approved": CONTRACT_APPROVED in read_text(self.contract_path),
            "has_eval_trigger": self.eval_trigger_path.exists(),
            "has_run_state": self.run_state_path.exists(),
            "has_change_request": self.change_request_path.exists(),
            "change_request_type": parse_key(read_text(self.change_request_path), "Type"),
            "has_bug_report": self.bug_report_path.exists(),
            "retry_count": int(run_state.get("retry_count", 0) or 0),
            "trigger_sprint": extract_sprint_id(read_text(self.eval_trigger_path)),
        }
        if observed["has_spec"]:
            observed["current_sprint"] = self.current_sprint()
            observed["all_sprints_complete"] = self.all_sprints_complete()
        return observed


def decide_route(project: HarnessProject, user_prompt: str) -> RouteDecision:
    observed = project.observed_state()
    run_state = project.load_run_state()
    retry_count = int(run_state.get("retry_count", 0) or 0)

    if not observed["has_spec"]:
        return RouteDecision(
            rule="no_spec_yet",
            action="invoke_planner",
            rationale="planner-spec.json is missing at session start",
            mode="planning",
            current_sprint=0,
            prompt=f"New project: {user_prompt}. Write planner-spec.json and init.sh.",
        )

    current_sprint = int(observed.get("current_sprint", 0) or 0)

    if observed["has_eval_trigger"]:
        trigger_sprint = observed["trigger_sprint"] or current_sprint
        has_pass = any(
            eval_sprint_id(path) == trigger_sprint and SPRINT_PASS in read_text(path)
            for path in project.eval_results()
        )
        failed_eval = project.latest_failed_eval(trigger_sprint)
        if has_pass:
            return RouteDecision(
                rule="eval_trigger_has_pass",
                action="clear_eval_trigger_and_continue",
                rationale="eval-trigger.txt exists but the sprint already has SPRINT PASS",
                mode="contract",
                current_sprint=current_sprint,
                cleanup_eval_trigger=True,
            )
        if failed_eval is not None:
            if retry_count > RETRY_LIMIT:
                return RouteDecision(
                    rule="retry_limit_exceeded",
                    action="pause_for_human",
                    rationale="the same sprint already exceeded the retry limit",
                    mode="paused",
                    current_sprint=trigger_sprint,
                    needs_human=True,
                    last_failure_reason=f"Sprint {trigger_sprint} exceeded retry limit",
                )
            return RouteDecision(
                rule="eval_trigger_with_fail",
                action="invoke_codex_for_retry",
                rationale="generator already committed and evaluator requested a targeted retry",
                mode="implementing",
                current_sprint=trigger_sprint,
                command=codex_command(
                    f"Sprint {trigger_sprint} failed. Read {failed_eval.name}. Fix only the cited issues. "
                    "Re-commit and update eval-trigger.txt. Follow AGENTS.md Generator rules."
                ),
            )
        return RouteDecision(
            rule="eval_trigger_exists",
            action="invoke_evaluator",
            rationale="generator signaled that sprint output is ready for live CHECK",
            mode="checking",
            current_sprint=trigger_sprint,
            prompt=f"Run CHECK for Sprint {trigger_sprint}. Read sprint-contract.md and eval-trigger.txt.",
        )

    if observed["has_contract"]:
        if observed["contract_approved"]:
            return RouteDecision(
                rule="approved_contract_phase",
                action="invoke_codex_for_implementation",
                rationale="sprint-contract.md is approved and ready for implementation",
                mode="implementing",
                current_sprint=current_sprint,
                command=codex_command(
                    f"sprint-contract.md is approved. Implement Sprint {current_sprint}. "
                    "Commit and write eval-trigger.txt. Follow AGENTS.md Generator rules."
                ),
            )
        return RouteDecision(
            rule="contract_review_phase",
            action="invoke_evaluator_contract_review",
            rationale="a sprint contract exists but has not been approved yet",
            mode="contract",
            current_sprint=current_sprint,
            prompt="Review sprint-contract.md. Approve or return required changes.",
        )

    if observed["has_bug_report"]:
        return RouteDecision(
            rule="bug_report_ready",
            action="invoke_codex_for_bugfix_contract",
            rationale="bug-report.md exists, so this request should become a dedicated bugfix sprint",
            mode="contract",
            current_sprint=current_sprint,
            command=codex_command(
                "Read planner-spec.json and bug-report.md. Propose sprint-contract.md for a bugfix sprint. "
                "Limit scope to the reported regression only, include browser-verifiable success criteria, "
                "and stop after writing the file."
            ),
        )

    if observed["has_change_request"]:
        change_type = (observed["change_request_type"] or "").lower()
        if change_type == "bugfix":
            return RouteDecision(
                rule="change_request_bugfix",
                action="invoke_codex_for_bugfix_contract",
                rationale="change-request.md marks this work as a bugfix",
                mode="contract",
                current_sprint=current_sprint,
                command=codex_command(
                    "Read planner-spec.json and change-request.md. Propose sprint-contract.md for a bugfix sprint. "
                    "Limit scope to the requested fix and stop after writing the file."
                ),
            )
        if change_type == "minor_feature":
            return RouteDecision(
                rule="change_request_minor_feature",
                action="invoke_codex_for_iteration_contract",
                rationale="change-request.md marks this work as a bounded iteration",
                mode="contract",
                current_sprint=current_sprint,
                command=codex_command(
                    "Read planner-spec.json and change-request.md. Identify the next iteration sprint and propose "
                    "sprint-contract.md for this minor feature. Keep the current architecture and VDL, and stop after writing the file."
                ),
            )
        if change_type in {"major_feature", "replan"}:
            return RouteDecision(
                rule="change_request_replan",
                action="invoke_planner_replan",
                rationale="change-request.md requires spec revision before a new sprint can be contracted",
                mode="planning",
                current_sprint=current_sprint,
                prompt=(
                    "Existing product change request: read planner-spec.json and change-request.md. "
                    "Revise planner-spec.json for this larger iteration before any coding begins."
                ),
            )
        return RouteDecision(
            rule="change_request_invalid",
            action="pause_for_human",
            rationale="change-request.md exists but its Type field is missing or invalid",
            mode="paused",
            current_sprint=current_sprint,
            needs_human=True,
            last_failure_reason="Invalid change-request.md Type",
        )

    if observed.get("all_sprints_complete"):
        return RouteDecision(
            rule="all_sprints_complete",
            action="complete",
            rationale="every sprint in planner-spec.json already has SPRINT PASS",
            mode="complete",
            current_sprint=0,
        )

    return RouteDecision(
        rule="ready_for_next_sprint",
        action="invoke_codex_for_contract",
        rationale="spec exists and no active contract, evaluation trigger, bug report, or change request is present",
        mode="contract",
        current_sprint=current_sprint,
        command=codex_command(
            f"Read planner-spec.json. Propose sprint-contract.md for Sprint {current_sprint}. "
            "Follow AGENTS.md Generator rules. Stop after writing the file."
        ),
    )


def update_run_state(project: HarnessProject, decision: RouteDecision) -> None:
    state = project.load_run_state()
    state["mode"] = decision.mode
    state["current_sprint"] = decision.current_sprint
    state["needs_human"] = decision.needs_human
    state["last_failure_reason"] = decision.last_failure_reason
    state["last_run_at"] = iso_now()
    if decision.action == "invoke_codex_for_retry":
        state["retry_count"] = int(state.get("retry_count", 0) or 0) + 1
    elif decision.action != "pause_for_human":
        state["retry_count"] = 0

    if decision.action == "invoke_codex_for_bugfix_contract":
        state["request_kind"] = "bugfix"
    elif decision.action == "invoke_codex_for_iteration_contract":
        state["request_kind"] = "iteration"
    elif decision.action == "invoke_planner_replan":
        state["request_kind"] = "replan"
    elif decision.action not in {"pause_for_human", "invoke_codex_for_retry"}:
        state["request_kind"] = ""

    project.save_run_state(state)


def log_decision(project: HarnessProject, decision: RouteDecision) -> None:
    observed = project.observed_state()
    ts = iso_now()
    append_ndjson(
        project.log_path,
        {
            "ts": ts,
            "observed": observed,
            "rule": decision.rule,
            "action": decision.action,
            "rationale": decision.rationale,
        },
    )
    action_to_event = {
        "invoke_planner": "planner_requested",
        "invoke_planner_replan": "planner_replan_requested",
        "invoke_codex_for_contract": "contract_requested",
        "invoke_codex_for_bugfix_contract": "bugfix_contract_requested",
        "invoke_codex_for_iteration_contract": "iteration_contract_requested",
        "invoke_evaluator_contract_review": "contract_review_requested",
        "invoke_codex_for_implementation": "generator_requested",
        "invoke_evaluator": "evaluator_requested",
        "invoke_codex_for_retry": "generator_retry_requested",
        "pause_for_human": "orchestrator_paused",
        "complete": "orchestrator_completed",
        "clear_eval_trigger_and_continue": "eval_trigger_cleaned",
    }
    append_ndjson(
        project.events_path,
        {
            "ts": ts,
            "event": action_to_event[decision.action],
            "mode": decision.mode,
            "current_sprint": decision.current_sprint,
        },
    )


def maybe_cleanup_eval_trigger(project: HarnessProject, decision: RouteDecision) -> None:
    if decision.cleanup_eval_trigger and project.eval_trigger_path.exists():
        project.eval_trigger_path.unlink()


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-dir", default=".", help="Target project directory.")
    parser.add_argument("--user-prompt", default="", help="Initial prompt for a brand-new product.")
    parser.add_argument("--run-generator", action="store_true", help="Execute Codex CLI automatically.")
    parser.add_argument("--json", action="store_true", help="Print decision as JSON.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    project = HarnessProject(Path(args.project_dir))
    compress_progress(project.progress_path)
    decision = decide_route(project, args.user_prompt)
    maybe_cleanup_eval_trigger(project, decision)
    update_run_state(project, decision)
    log_decision(project, decision)

    if args.run_generator and decision.command:
        return subprocess.run(decision.command, cwd=str(project.root), shell=True).returncode

    payload = {
        "project_dir": str(project.root),
        "rule": decision.rule,
        "action": decision.action,
        "mode": decision.mode,
        "current_sprint": decision.current_sprint,
        "rationale": decision.rationale,
        "command": decision.command,
        "prompt": decision.prompt,
        "needs_human": decision.needs_human,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for key, value in payload.items():
            print(f"{key}: {value}")
    return 2 if decision.needs_human else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

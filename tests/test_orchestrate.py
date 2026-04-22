from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "orchestrate.py"


def run_orchestrator(project_dir: Path, *extra: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--project-dir", str(project_dir), *extra],
        capture_output=True,
        text=True,
        check=False,
    )


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_spec(path: Path) -> None:
    write_json(
        path,
        {
            "product": "Test product",
            "design_language": {},
            "tech_stack": {},
            "features": [],
            "sprints": [{"id": 1, "title": "Sprint One", "features": ["F1"]}],
        },
    )


def test_routes_to_planner_when_spec_missing(tmp_path: Path) -> None:
    result = run_orchestrator(tmp_path, "--user-prompt", "Build a writing app", "--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["rule"] == "no_spec_yet"
    assert payload["action"] == "invoke_planner"


def test_routes_to_bugfix_contract_when_bug_report_exists(tmp_path: Path) -> None:
    write_spec(tmp_path / "planner-spec.json")
    (tmp_path / "bug-report.md").write_text(
        "# Bug Report\n\nTitle: Login fails\nExpected: success\nActual: error\n",
        encoding="utf-8",
    )
    result = run_orchestrator(tmp_path, "--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["rule"] == "bug_report_ready"
    assert payload["action"] == "invoke_codex_for_bugfix_contract"


def test_routes_to_iteration_contract_for_minor_feature(tmp_path: Path) -> None:
    write_spec(tmp_path / "planner-spec.json")
    (tmp_path / "change-request.md").write_text(
        "# Change Request\n\nType: minor_feature\nTitle: Add quick filters\n",
        encoding="utf-8",
    )
    result = run_orchestrator(tmp_path, "--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["rule"] == "change_request_minor_feature"
    assert payload["action"] == "invoke_codex_for_iteration_contract"


def test_routes_to_replan_for_major_feature(tmp_path: Path) -> None:
    write_spec(tmp_path / "planner-spec.json")
    (tmp_path / "change-request.md").write_text(
        "# Change Request\n\nType: major_feature\nTitle: Mobile app support\n",
        encoding="utf-8",
    )
    result = run_orchestrator(tmp_path, "--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["rule"] == "change_request_replan"
    assert payload["action"] == "invoke_planner_replan"


def test_pauses_when_change_request_type_is_invalid(tmp_path: Path) -> None:
    write_spec(tmp_path / "planner-spec.json")
    (tmp_path / "change-request.md").write_text(
        "# Change Request\n\nTitle: Missing type field\n",
        encoding="utf-8",
    )
    result = run_orchestrator(tmp_path, "--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 2
    assert payload["rule"] == "change_request_invalid"
    assert payload["action"] == "pause_for_human"


def test_codex_command_uses_modern_exec_when_version_is_new(monkeypatch) -> None:
    from scripts import orchestrate

    monkeypatch.setattr(orchestrate, "codex_version_tuple", lambda: (0, 120, 0))
    command = orchestrate.codex_command("Implement sprint")
    assert "codex exec --full-auto" in command
    assert "disk-full-read-access" in command
    assert "shell_environment_policy.inherit=all" in command
    assert "--skip-git-repo-check" in command


def test_codex_command_uses_legacy_exec_when_version_is_old(monkeypatch) -> None:
    from scripts import orchestrate

    monkeypatch.setattr(orchestrate, "codex_version_tuple", lambda: (0, 119, 9))
    command = orchestrate.codex_command("Implement sprint")
    assert command.startswith("codex -a never exec --skip-git-repo-check ")


def test_codex_command_uses_legacy_exec_when_version_is_unknown(monkeypatch) -> None:
    from scripts import orchestrate

    monkeypatch.setattr(orchestrate, "codex_version_tuple", lambda: None)
    command = orchestrate.codex_command("Implement sprint")
    assert command.startswith("codex -a never exec --skip-git-repo-check ")


def test_codex_command_quotes_prompt(monkeypatch) -> None:
    from scripts import orchestrate

    monkeypatch.setattr(orchestrate, "codex_version_tuple", lambda: (0, 120, 0))
    command = orchestrate.codex_command("Implement 'sprint' && rm -rf /")
    assert "Implement 'sprint' && rm -rf /" not in command
    assert "codex exec --full-auto" in command
    assert "--skip-git-repo-check" in command


# --- compress_progress tests ---

def test_compress_not_triggered_when_file_is_small(tmp_path: Path) -> None:
    from scripts.orchestrate import compress_progress

    progress = tmp_path / "claude-progress.txt"
    content = "Project: test\n\n## Sprint 1 — 2026-01-01\nStatus: committed\n"
    progress.write_text(content, encoding="utf-8")
    compress_progress(progress)
    assert progress.read_text(encoding="utf-8") == content


def test_compress_triggered_when_too_many_sprints(tmp_path: Path) -> None:
    from scripts.orchestrate import compress_progress

    progress = tmp_path / "claude-progress.txt"
    lines = ["Project summary\n"]
    for i in range(1, 6):
        lines.append(f"## Sprint {i} — 2026-01-0{i}\nStatus: done\nKey: file{i}.py\n\n")
    progress.write_text("".join(lines), encoding="utf-8")
    compress_progress(progress)
    result = progress.read_text(encoding="utf-8")
    # Only the last 3 sprint headers should remain
    assert result.count("## Sprint ") <= 3


def test_compress_triggered_when_over_60_lines(tmp_path: Path) -> None:
    from scripts.orchestrate import compress_progress

    progress = tmp_path / "claude-progress.txt"
    lines = ["Project summary\n"] + [f"line {i}\n" for i in range(65)]
    progress.write_text("".join(lines), encoding="utf-8")
    compress_progress(progress)
    result = progress.read_text(encoding="utf-8")
    assert len(result.splitlines()) < 65


def test_compress_triggered_by_traceback(tmp_path: Path) -> None:
    from scripts.orchestrate import compress_progress

    progress = tmp_path / "claude-progress.txt"
    progress.write_text(
        "Project summary\n\n## Sprint 1 — 2026-01-01\nTraceback (most recent call last):\n  File foo.py\n",
        encoding="utf-8",
    )
    original_len = len(progress.read_text(encoding="utf-8").splitlines())
    compress_progress(progress)
    assert len(progress.read_text(encoding="utf-8").splitlines()) <= original_len


def test_compress_summary_does_not_include_sprint_header(tmp_path: Path) -> None:
    from scripts.orchestrate import compress_progress

    progress = tmp_path / "claude-progress.txt"
    lines = ["Project: my app\nStack: Next.js\n\n"]
    for i in range(1, 6):
        lines.append(f"## Sprint {i} — 2026-01-0{i}\nStatus: done\n\n")
    progress.write_text("".join(lines), encoding="utf-8")
    compress_progress(progress)
    result_lines = progress.read_text(encoding="utf-8").splitlines()
    # Summary section (before first blank line after header) must not start with a sprint header
    assert not result_lines[0].startswith("## Sprint")


# --- sprint gate / boundary enforcement tests ---

def test_clears_contract_and_fence_after_sprint_pass(tmp_path: Path) -> None:
    """After SPRINT PASS the Orchestrator must delete sprint-contract.md and
    sprint-fence.json so the next sprint cannot bypass contract negotiation."""
    write_spec(tmp_path / "planner-spec.json")
    (tmp_path / "sprint-contract.md").write_text(
        "## Sprint 1\nCONTRACT APPROVED\n", encoding="utf-8"
    )
    (tmp_path / "sprint-fence.json").write_text(
        '{"sprint": 1, "base_commit": "abc123", "started_at": "2026-01-01T00:00:00+00:00"}',
        encoding="utf-8",
    )
    (tmp_path / "eval-trigger.txt").write_text("sprint=1", encoding="utf-8")
    (tmp_path / "eval-result-1.md").write_text("## Verdict: SPRINT PASS\n", encoding="utf-8")

    result = run_orchestrator(tmp_path, "--json")
    payload = json.loads(result.stdout)
    assert payload["rule"] == "eval_trigger_has_pass"
    assert not (tmp_path / "sprint-contract.md").exists(), (
        "sprint-contract.md must be deleted after SPRINT PASS"
    )
    assert not (tmp_path / "sprint-fence.json").exists(), (
        "sprint-fence.json must be deleted after SPRINT PASS"
    )


def test_next_sprint_requires_new_contract_after_pass(tmp_path: Path) -> None:
    """After cleanup the next orchestrator call must route to contract proposal,
    not directly to implementation — verifying the gate is not bypassed."""
    write_spec(tmp_path / "planner-spec.json")
    # Sprint 1 already passed; no contract or fence present (simulating post-cleanup state)
    (tmp_path / "eval-result-1.md").write_text("## Verdict: SPRINT PASS\n", encoding="utf-8")
    # planner-spec has only sprint 1, so add sprint 2 so there is work left
    spec = json.loads((tmp_path / "planner-spec.json").read_text(encoding="utf-8"))
    spec["sprints"].append({"id": 2, "title": "Sprint Two", "features": ["F2"]})
    (tmp_path / "planner-spec.json").write_text(
        json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    result = run_orchestrator(tmp_path, "--json")
    payload = json.loads(result.stdout)
    # Must ask Codex to propose a new contract, NOT jump straight to implementation
    assert payload["action"] == "invoke_codex_for_contract", (
        f"Expected invoke_codex_for_contract, got {payload['action']}"
    )


def test_pauses_on_sprint_boundary_violation(tmp_path: Path) -> None:
    """If eval-trigger.txt names a different sprint than sprint-fence.json the
    Orchestrator must pause immediately instead of routing to the Evaluator."""
    write_spec(tmp_path / "planner-spec.json")
    (tmp_path / "sprint-contract.md").write_text(
        "## Sprint 1\nCONTRACT APPROVED\n", encoding="utf-8"
    )
    # Fence says sprint 1 was the authorised sprint ...
    (tmp_path / "sprint-fence.json").write_text(
        '{"sprint": 1, "base_commit": "abc123", "started_at": "2026-01-01T00:00:00+00:00"}',
        encoding="utf-8",
    )
    # ... but Codex wrote sprint=2, revealing it implemented two sprints at once
    (tmp_path / "eval-trigger.txt").write_text("sprint=2", encoding="utf-8")

    result = run_orchestrator(tmp_path, "--json")
    assert result.returncode == 2, "Orchestrator must exit 2 (needs_human) on boundary violation"
    payload = json.loads(result.stdout)
    assert payload["rule"] == "sprint_boundary_violation"
    assert payload["action"] == "pause_for_human"
    assert payload["needs_human"] is True


def test_writes_sprint_fence_before_implementation(tmp_path: Path) -> None:
    """Orchestrator must write sprint-fence.json when routing to implementation."""
    write_spec(tmp_path / "planner-spec.json")
    (tmp_path / "sprint-contract.md").write_text(
        "## Sprint 1\nCONTRACT APPROVED\n", encoding="utf-8"
    )

    run_orchestrator(tmp_path, "--json")

    fence_path = tmp_path / "sprint-fence.json"
    assert fence_path.exists(), "sprint-fence.json must be written before Codex is invoked"
    fence = json.loads(fence_path.read_text(encoding="utf-8"))
    assert fence["sprint"] == 1
    assert "base_commit" in fence
    assert "started_at" in fence


def test_implementation_prompt_includes_stop_instruction(tmp_path: Path) -> None:
    """The Codex prompt must explicitly tell it to stop after eval-trigger.txt."""
    write_spec(tmp_path / "planner-spec.json")
    (tmp_path / "sprint-contract.md").write_text(
        "## Sprint 1\nCONTRACT APPROVED\n", encoding="utf-8"
    )

    result = run_orchestrator(tmp_path, "--json")
    payload = json.loads(result.stdout)
    assert payload["action"] == "invoke_codex_for_implementation"
    command = payload["command"] or ""
    assert "STOP" in command, "Implementation prompt must include explicit STOP instruction"
    assert "ONLY" in command, "Implementation prompt must say 'Sprint N ONLY'"


def test_compress_triggered_by_multi_paragraph_narrative(tmp_path: Path) -> None:
    from scripts.orchestrate import compress_progress, _has_multi_paragraph_narrative

    # Build a file with 7 paragraphs (well above threshold of 6) but under 60 lines
    paras = [f"This is paragraph {i} with some content here.\n" for i in range(7)]
    lines = "\n".join(paras).splitlines()
    assert _has_multi_paragraph_narrative(lines)

    progress = tmp_path / "claude-progress.txt"
    progress.write_text("\n\n".join(paras), encoding="utf-8")
    compress_progress(progress)
    # File should have been compressed (rewritten)
    result = progress.read_text(encoding="utf-8")
    assert len(result.splitlines()) < len(lines)

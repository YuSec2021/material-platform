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
    assert command.startswith("codex exec --full-auto --skip-git-repo-check ")


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
    assert "codex exec --full-auto --skip-git-repo-check " in command

import os
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_plain_postgresql_url_uses_psycopg_driver():
    environment = os.environ.copy()
    environment["DATABASE_URL"] = (
        "postgresql://material:password@127.0.0.1:15432/material_retrieval"
    )

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from backend.app.database import engine; "
                "assert engine.url.drivername == 'postgresql+psycopg'"
            ),
        ],
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_startup_reuses_aios_infra_postgresql_without_managing_it():
    startup_script = (PROJECT_ROOT / "init.sh").read_text(encoding="utf-8")

    assert "Using the existing PostgreSQL instance managed by aios-infra" in startup_script
    assert "up -d postgres" not in startup_script
    assert "docker exec" not in startup_script


def test_compose_does_not_define_a_project_postgresql_service():
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "\n  postgres:\n" not in compose
    assert "postgres_data" not in compose
    assert "DATABASE_URL: ${DATABASE_URL:?DATABASE_URL must point to aios-infra PostgreSQL}" in compose

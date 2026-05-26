"""
Seed script to create 414+ mock ModelConfig records for migration threshold check.

Run with: python -m backend.app.migrations.seed_414
"""
from __future__ import annotations

import sys
import os

# Ensure we use the backend .venv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend"))
os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

import json
import uuid
from datetime import datetime, timezone

from backend.database import SessionLocal
from backend.app.models import ModelConfig


PROVIDERS = ["dashscope", "openai", "azure", "vllm", "ollama", "deepseek", "moonshot", "custom", "mock"]
MODEL_PREFIXES = [
    "qwen", "gpt", "claude", "llama", "mistral", "baichuan",
    "yi", "glm", "wizard", "orca", "phi", "mixtral", "codellama",
]
CAPABILITIES = [
    "material_add", "material_match", "category_recognition",
    "attr_recommend", "material_governance",
]


def utcnow():
    return datetime.now(timezone.utc)


def compact_space(value: str | None) -> str:
    return " ".join(str(value or "").strip().split())


def generate_seed_configs(db, count: int = 414) -> list[ModelConfig]:
    """Generate `count` mock ModelConfig records and commit them to the DB."""
    created = []
    for i in range(count):
        provider = PROVIDERS[i % len(PROVIDERS)]
        prefix = MODEL_PREFIXES[i % len(MODEL_PREFIXES)]
        model_name = f"{prefix}-seed-{i+1:04d}"
        display_name = f"Seed {provider.title()} {model_name} ({i+1})"
        # Use local:// for mock/test to avoid real API calls
        base_url = f"local://seed-{provider}-{i+1:04d}" if provider in ("mock", "custom") else f"https://{provider}.example.com/v1"
        cfg = ModelConfig(
            display_name=display_name,
            provider=provider,
            model_name=model_name,
            base_url=base_url,
            encrypted_api_key=f"sk-seed-{uuid.uuid4().hex[:16]}",
            timeout_seconds=10,
            fallback_model_id=None,
            enabled=(i % 3 != 0),  # ~67% enabled
            connection_status="untested",
            last_test_message="",
            last_test_at=None,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(cfg)
        created.append(cfg)
        if (i + 1) % 50 == 0:
            db.flush()
            print(f"  Flushed {i+1}/{count} records...")
    db.commit()
    return created


def main() -> None:
    session = SessionLocal()
    try:
        existing = session.query(ModelConfig).count()
        print(f"Existing ModelConfig records in DB: {existing}")
        target = 414
        needed = max(0, target - existing)
        if needed > 0:
            print(f"Creating {needed} new mock ModelConfig records...")
            configs = generate_seed_configs(session, needed)
            print(f"Done. Created {len(configs)} records.")
            total = session.query(ModelConfig).count()
            print(f"Total ModelConfig records after seeding: {total}")
        else:
            print(f"Already have {existing} >= {target} records, no seeding needed.")
    finally:
        session.close()


if __name__ == "__main__":
    main()
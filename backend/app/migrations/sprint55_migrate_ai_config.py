from __future__ import annotations

import json
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any

from sqlalchemy.orm import Session

from ..database import Base, SessionLocal, engine
from ..models import AIAgentConfig, CapabilityAgentMapping, CapabilityMapping, CapabilityModelMapping, Model, ModelConfig, SystemConfig

SPRINT55_MIGRATION_VERSION = "sprint55"
MIGRATION_STATE_KEY = "model_gateway_migration_data_version"
DEFAULT_CAPABILITIES = {
    "material_add",
    "category_recognition",
    "material_match",
    "attr_recommend",
    "material_governance",
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def compact_space(value: str | None) -> str:
    return " ".join(str(value or "").strip().split())


def gateway_connection_status(status: str | None) -> str:
    normalized = (status or "").strip().lower()
    if normalized in {"ok", "connected", "configured"}:
        return "ok"
    if normalized in {"error", "failed", "failure"}:
        return "error"
    return "untested"


def is_test_model(provider: str | None, model_name: str | None, base_url: str | None) -> bool:
    text = " ".join([provider or "", model_name or "", base_url or ""]).lower()
    return (provider or "").strip().lower() == "mock" or "mock" in text or "test" in text or (base_url or "").startswith("local://")


def set_if_changed(target: Any, field: str, value: Any) -> bool:
    if getattr(target, field) == value:
        return False
    setattr(target, field, value)
    return True


def state_payload(config: SystemConfig | None) -> dict[str, Any]:
    if not config or not config.value:
        return {}
    try:
        loaded = json.loads(config.value)
    except json.JSONDecodeError:
        return {"legacy_value": config.value}
    return loaded if isinstance(loaded, dict) else {"legacy_value": config.value}


def model_by_provider_name(db: Session, provider: str, model_name: str) -> Model | None:
    return (
        db.query(Model)
        .filter(Model.provider == compact_space(provider).lower(), Model.model_name == compact_space(model_name))
        .first()
    )


def upsert_model_from_provider(db: Session, provider: ModelConfig) -> tuple[Model, bool, bool]:
    normalized_provider = compact_space(provider.provider).lower()
    normalized_model_name = compact_space(provider.model_name)
    model = model_by_provider_name(db, normalized_provider, normalized_model_name)
    created = model is None
    changed = False
    if model is None:
        model = Model(provider=normalized_provider, model_name=normalized_model_name)
        db.add(model)
    changed |= set_if_changed(model, "display_name", compact_space(provider.display_name) or f"{normalized_provider}-{normalized_model_name}")
    changed |= set_if_changed(model, "base_url", provider.base_url or "")
    changed |= set_if_changed(model, "api_key_encrypted", provider.encrypted_api_key or "")
    changed |= set_if_changed(model, "timeout", int(provider.timeout_seconds or 30))
    changed |= set_if_changed(model, "temperature", None)
    changed |= set_if_changed(model, "max_tokens", None)
    changed |= set_if_changed(model, "enabled", bool(provider.enabled))
    changed |= set_if_changed(model, "connection_status", gateway_connection_status(provider.connection_status))
    changed |= set_if_changed(model, "last_tested_at", provider.last_test_at)
    changed |= set_if_changed(
        model,
        "migration_data_version",
        f"{SPRINT55_MIGRATION_VERSION}:test" if is_test_model(normalized_provider, normalized_model_name, provider.base_url) else f"{SPRINT55_MIGRATION_VERSION}:model",
    )
    if created:
        model.created_at = provider.created_at
    if created or changed:
        model.updated_at = utcnow()
    db.flush()
    return model, created, changed and not created


def upsert_model_from_agent(db: Session, agent: AIAgentConfig) -> tuple[Model, bool, bool]:
    normalized_provider = compact_space(agent.provider).lower()
    normalized_model_name = compact_space(agent.model_name)
    model = model_by_provider_name(db, normalized_provider, normalized_model_name)
    created = model is None
    changed = False
    if model is None:
        model = Model(provider=normalized_provider, model_name=normalized_model_name)
        db.add(model)
    changed |= set_if_changed(model, "display_name", compact_space(agent.config_key) or f"{normalized_provider}-{normalized_model_name}")
    changed |= set_if_changed(model, "base_url", agent.base_url or "")
    changed |= set_if_changed(model, "api_key_encrypted", agent.encrypted_api_key or "")
    changed |= set_if_changed(model, "timeout", int(agent.timeout or 30))
    changed |= set_if_changed(model, "temperature", float(agent.temperature))
    changed |= set_if_changed(model, "max_tokens", int(agent.max_tokens))
    changed |= set_if_changed(model, "enabled", bool(agent.enabled))
    changed |= set_if_changed(model, "connection_status", gateway_connection_status(agent.connection_status))
    changed |= set_if_changed(model, "last_tested_at", agent.last_test_at)
    changed |= set_if_changed(
        model,
        "migration_data_version",
        f"{SPRINT55_MIGRATION_VERSION}:test" if is_test_model(normalized_provider, normalized_model_name, agent.base_url) else f"{SPRINT55_MIGRATION_VERSION}:agent",
    )
    if created:
        model.created_at = agent.created_at
    if created or changed:
        model.updated_at = utcnow()
    db.flush()
    return model, created, changed and not created


def upsert_capability_mapping(
    db: Session,
    capability: str,
    primary_model_id: int | None,
    fallback_model_id: int | None,
    enabled: bool,
    source: str,
) -> tuple[CapabilityMapping, bool, bool]:
    mapping = db.query(CapabilityMapping).filter(CapabilityMapping.capability == capability).first()
    created = mapping is None
    changed = False
    if mapping is None:
        mapping = CapabilityMapping(capability=capability)
        db.add(mapping)
    if primary_model_id is not None and fallback_model_id is not None and primary_model_id == fallback_model_id:
        fallback_model_id = None
    changed |= set_if_changed(mapping, "primary_model_id", primary_model_id)
    changed |= set_if_changed(mapping, "fallback_model_id", fallback_model_id)
    changed |= set_if_changed(mapping, "enabled", bool(enabled))
    changed |= set_if_changed(mapping, "migration_data_version", f"{SPRINT55_MIGRATION_VERSION}:{source}")
    if created or changed:
        mapping.updated_at = utcnow()
    db.flush()
    return mapping, created, changed and not created


def migration_checksum(db: Session) -> str:
    models = [
        {
            "provider": model.provider,
            "model_name": model.model_name,
            "display_name": model.display_name,
            "base_url": model.base_url,
            "timeout": model.timeout,
            "temperature": model.temperature,
            "max_tokens": model.max_tokens,
            "enabled": model.enabled,
            "connection_status": model.connection_status,
            "migration_data_version": model.migration_data_version,
        }
        for model in db.query(Model).order_by(Model.provider, Model.model_name).all()
    ]
    mappings = [
        {
            "capability": mapping.capability,
            "primary_model_id": mapping.primary_model_id,
            "fallback_model_id": mapping.fallback_model_id,
            "enabled": mapping.enabled,
            "migration_data_version": mapping.migration_data_version,
        }
        for mapping in db.query(CapabilityMapping).order_by(CapabilityMapping.capability).all()
    ]
    payload = json.dumps({"models": models, "mappings": mappings}, sort_keys=True, ensure_ascii=False, default=str)
    return sha256(payload.encode("utf-8")).hexdigest()


def run_sprint55_migration(db: Session) -> dict[str, Any]:
    Base.metadata.create_all(bind=engine)
    warnings: list[str] = []
    agent_preferred_conflicts: list[str] = []
    stats = {
        "models_created": 0,
        "models_updated": 0,
        "mappings_created": 0,
        "mappings_updated": 0,
    }

    legacy_models = db.query(ModelConfig).order_by(ModelConfig.id).all()
    legacy_agents = db.query(AIAgentConfig).order_by(AIAgentConfig.id).all()
    provider_models: dict[int, Model] = {}
    agent_models: dict[int, Model] = {}
    agent_keys = {(compact_space(agent.provider).lower(), compact_space(agent.model_name)) for agent in legacy_agents}
    provider_keys_seen: set[tuple[str, str]] = set()
    agent_keys_seen: set[tuple[str, str]] = set()

    for provider in legacy_models:
        key = (compact_space(provider.provider).lower(), compact_space(provider.model_name))
        if key in agent_keys:
            existing = model_by_provider_name(db, provider.provider, provider.model_name)
            if existing:
                provider_models[provider.id] = existing
            continue
        if key in provider_keys_seen:
            existing = model_by_provider_name(db, provider.provider, provider.model_name)
            if existing:
                provider_models[provider.id] = existing
            continue
        model, created, updated = upsert_model_from_provider(db, provider)
        provider_models[provider.id] = model
        provider_keys_seen.add(key)
        stats["models_created"] += int(created)
        stats["models_updated"] += int(updated)

    for agent in legacy_agents:
        key = (compact_space(agent.provider).lower(), compact_space(agent.model_name))
        if key in agent_keys_seen:
            existing = model_by_provider_name(db, agent.provider, agent.model_name)
            if existing:
                agent_models[agent.id] = existing
            continue
        model, created, updated = upsert_model_from_agent(db, agent)
        agent_models[agent.id] = model
        agent_keys_seen.add(key)
        stats["models_created"] += int(created)
        stats["models_updated"] += int(updated)

    for provider in legacy_models:
        if provider.id not in provider_models:
            model = model_by_provider_name(db, provider.provider, provider.model_name)
            if model:
                provider_models[provider.id] = model

    model_mappings = db.query(CapabilityModelMapping).order_by(CapabilityModelMapping.id).all()
    agent_mappings = db.query(CapabilityAgentMapping).order_by(CapabilityAgentMapping.id).all()
    model_mapping_capabilities = {mapping.capability for mapping in model_mappings}
    agent_mapping_capabilities = {mapping.capability for mapping in agent_mappings}

    for mapping in model_mappings:
        primary = provider_models.get(mapping.primary_model_id)
        fallback = provider_models.get(mapping.fallback_model_id) if mapping.fallback_model_id else None
        if mapping.primary_model_id and not primary:
            warnings.append(f"{mapping.capability}: missing primary legacy model_config id {mapping.primary_model_id}")
        if mapping.fallback_model_id and not fallback:
            warnings.append(f"{mapping.capability}: missing fallback legacy model_config id {mapping.fallback_model_id}")
        _, created, updated = upsert_capability_mapping(
            db,
            mapping.capability,
            primary.id if primary else None,
            fallback.id if fallback else None,
            mapping.enabled,
            "model",
        )
        stats["mappings_created"] += int(created)
        stats["mappings_updated"] += int(updated)

    for mapping in agent_mappings:
        if mapping.capability in model_mapping_capabilities:
            agent_preferred_conflicts.append(mapping.capability)
        primary = agent_models.get(mapping.agent_config_id)
        fallback = agent_models.get(mapping.fallback_agent_config_id) if mapping.fallback_agent_config_id else None
        if mapping.agent_config_id and not primary:
            warnings.append(f"{mapping.capability}: missing primary ai_agent_config id {mapping.agent_config_id}")
        if mapping.fallback_agent_config_id and not fallback:
            warnings.append(f"{mapping.capability}: missing fallback ai_agent_config id {mapping.fallback_agent_config_id}")
        _, created, updated = upsert_capability_mapping(
            db,
            mapping.capability,
            primary.id if primary else None,
            fallback.id if fallback else None,
            mapping.enabled,
            "agent",
        )
        stats["mappings_created"] += int(created)
        stats["mappings_updated"] += int(updated)

    for capability in sorted(DEFAULT_CAPABILITIES):
        mapping = db.query(CapabilityMapping).filter(CapabilityMapping.capability == capability).first()
        if mapping:
            continue
        db.add(
            CapabilityMapping(
                capability=capability,
                primary_model_id=None,
                fallback_model_id=None,
                enabled=True,
                migration_data_version=f"{SPRINT55_MIGRATION_VERSION}:default",
            )
        )
        stats["mappings_created"] += 1

    db.flush()
    checksum = migration_checksum(db)
    migration_state = db.query(SystemConfig).filter(SystemConfig.key == MIGRATION_STATE_KEY).first()
    previous = state_payload(migration_state)
    state = {
        "version": SPRINT55_MIGRATION_VERSION,
        "checksum": checksum,
        "completed_at": utcnow().isoformat(),
    }
    if migration_state is None:
        migration_state = SystemConfig(key=MIGRATION_STATE_KEY, value=json.dumps(state, ensure_ascii=False), updated_by="system")
        db.add(migration_state)
    else:
        migration_state.value = json.dumps(state, ensure_ascii=False)
        migration_state.updated_by = "system"
        migration_state.updated_at = utcnow()
    db.commit()

    changed = any(stats[key] for key in ["models_created", "models_updated", "mappings_created", "mappings_updated"])
    status = "already_migrated" if previous.get("version") == SPRINT55_MIGRATION_VERSION and previous.get("checksum") == checksum and not changed else "migrated"
    return {
        "status": status,
        "migration_data_version": SPRINT55_MIGRATION_VERSION,
        "legacy_models_seen": len(legacy_models),
        "legacy_agents_seen": len(legacy_agents),
        "legacy_model_mappings_seen": len(model_mappings),
        "legacy_agent_mappings_seen": len(agent_mappings),
        **stats,
        "model_rows_after": db.query(Model).count(),
        "mapping_rows_after": db.query(CapabilityMapping).count(),
        "migration_checksum": checksum,
        "warnings": warnings,
        "agent_preferred_conflicts": sorted(set(agent_preferred_conflicts)),
        "agent_mapping_capabilities_seen": sorted(agent_mapping_capabilities),
    }


if __name__ == "__main__":
    session = SessionLocal()
    try:
        print(json.dumps(run_sprint55_migration(session), ensure_ascii=False, indent=2))
    finally:
        session.close()

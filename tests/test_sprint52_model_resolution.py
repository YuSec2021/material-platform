import os
import time
import unittest
from unittest.mock import patch

os.environ.setdefault("AI_DEBUG", "true")
os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class Sprint52ModelResolutionTest(unittest.TestCase):
    def unique_name(self, prefix: str) -> str:
        return f"{prefix}-{time.time_ns()}"

    def create_model(self, model_name: str | None = None, **overrides):
        payload = {
            "display_name": self.unique_name("Sprint52 Model"),
            "provider": "custom",
            "model_name": model_name or self.unique_name("sprint52-model"),
            "base_url": "local://sprint52",
            "api_key": "secret-sprint52",
            "timeout": 2,
            "temperature": 0.2,
            "max_tokens": 512,
            "enabled": True,
        }
        payload.update(overrides)
        response = client.post("/api/v1/models", headers=SUPER_ADMIN, json=payload)
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def upsert_mapping(self, capability: str, primary_model_id: int | None, fallback_model_id: int | None = None, enabled: bool = True):
        mappings = client.get("/api/v1/capability-mappings", headers=SUPER_ADMIN)
        self.assertEqual(mappings.status_code, 200, mappings.text)
        existing = next((item for item in mappings.json() if item["capability"] == capability), None)
        payload = {
            "primary_model_id": primary_model_id,
            "fallback_model_id": fallback_model_id,
            "enabled": enabled,
        }
        if existing:
            response = client.put(f"/api/v1/capability-mappings/{existing['id']}", headers=SUPER_ADMIN, json=payload)
        else:
            response = client.post(
                "/api/v1/capability-mappings",
                headers=SUPER_ADMIN,
                json={"capability": capability, **payload},
            )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def test_primary_fallback_disabled_and_missing_resolution(self):
        capability = self.unique_name("sprint52_capability")
        primary = self.create_model(self.unique_name("sprint52-primary"))
        fallback = self.create_model(self.unique_name("sprint52-fallback"))
        self.upsert_mapping(capability, primary["id"], fallback["id"])

        resolved = client.get(f"/api/v1/ai/resolve-model?capability={capability}", headers=SUPER_ADMIN)
        self.assertEqual(resolved.status_code, 200, resolved.text)
        self.assertEqual(resolved.json()["source"], "primary")
        self.assertEqual(resolved.json()["model"]["model_name"], primary["model_name"])
        self.assertNotIn("api_key", resolved.text)
        self.assertNotIn("api_key_encrypted", resolved.text)

        explicit = client.get(f"/api/v1/ai/resolve-model?capability={capability}&prefer_fallback=true", headers=SUPER_ADMIN)
        self.assertEqual(explicit.status_code, 200, explicit.text)
        self.assertEqual(explicit.json()["source"], "fallback")
        self.assertEqual(explicit.json()["model"]["model_name"], fallback["model_name"])

        client.patch(f"/api/v1/models/{primary['id']}/toggle", headers=SUPER_ADMIN)
        client.patch(f"/api/v1/models/{fallback['id']}/toggle", headers=SUPER_ADMIN)
        missing = client.get(f"/api/v1/ai/resolve-model?capability={capability}", headers=SUPER_ADMIN)
        self.assertEqual(missing.status_code, 409, missing.text)
        self.assertEqual(missing.json()["detail"]["capability"], capability)
        self.assertIn("Model Gateway", missing.json()["detail"]["suggestion"])

    def test_connection_check_fallback_and_hot_switch(self):
        capability = self.unique_name("sprint52_hot_switch")
        bad = self.create_model(self.unique_name("sprint52-bad-primary"), base_url="http://127.0.0.1:1/v1")
        fallback = self.create_model(self.unique_name("sprint52-good-fallback"))
        replacement = self.create_model(self.unique_name("sprint52-replacement"))
        mapping = self.upsert_mapping(capability, bad["id"], fallback["id"])

        resolved = client.get(f"/api/v1/ai/resolve-model?capability={capability}", headers=SUPER_ADMIN)
        self.assertEqual(resolved.status_code, 200, resolved.text)
        body = resolved.json()
        self.assertEqual(body["source"], "fallback")
        self.assertEqual(body["model"]["model_name"], fallback["model_name"])
        self.assertTrue(body["primary_connection_error"] or body["warning"])

        refreshed = client.get(f"/api/v1/models/{bad['id']}", headers=SUPER_ADMIN)
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(refreshed.json()["connection_status"], "error")
        self.assertIsNotNone(refreshed.json()["last_tested_at"])

        updated = client.put(
            f"/api/v1/capability-mappings/{mapping['id']}",
            headers=SUPER_ADMIN,
            json={"primary_model_id": replacement["id"], "fallback_model_id": fallback["id"], "enabled": True},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        switched = client.get(f"/api/v1/ai/resolve-model?capability={capability}", headers=SUPER_ADMIN)
        self.assertEqual(switched.status_code, 200, switched.text)
        self.assertEqual(switched.json()["model"]["model_name"], replacement["model_name"])

    def test_rule_evaluation_trace_contains_resolved_model_metadata(self):
        model = self.create_model(self.unique_name("sprint52-governance-model"))
        self.upsert_mapping("material_governance", model["id"], None)
        response = client.post(
            "/api/v1/rules/evaluate",
            headers=SUPER_ADMIN,
            json={"name": " Apple  A4 printer ", "brand": "APPLE", "unit": "KG", "attributes": {}},
        )
        self.assertEqual(response.status_code, 200, response.text)
        trace_id = response.json()["trace_id"]
        self.assertTrue(trace_id.startswith("trace-"))

        trace = client.get(f"/api/v1/debug/trace/{trace_id}", headers=SUPER_ADMIN)
        self.assertEqual(trace.status_code, 200, trace.text)
        spans = trace.json()["spans"]
        self.assertTrue(
            any(
                span["metadata"].get("model_id") == model["id"]
                and span["metadata"].get("model_name") == model["model_name"]
                and span["metadata"].get("provider") == "custom"
                and span["metadata"].get("resolution_source") == "primary"
                for span in spans
            )
        )

    def test_legacy_resolution_when_unified_mapping_disabled(self):
        token = self.unique_name("legacy")
        provider = client.post(
            "/api/v1/ai/providers",
            headers=SUPER_ADMIN,
            json={
                "display_name": token,
                "provider": "mock",
                "model_name": f"sprint52-legacy-category-{token}",
                "base_url": "local://legacy-category",
                "api_key": "legacy-secret",
                "capabilities": ["category_recognition"],
                "enabled": True,
            },
        )
        self.assertEqual(provider.status_code, 200, provider.text)
        legacy_mapping = client.put(
            "/api/v1/ai/capability-mappings/category_recognition",
            headers=SUPER_ADMIN,
            json={"primary_model_id": provider.json()["id"], "enabled": True},
        )
        self.assertEqual(legacy_mapping.status_code, 200, legacy_mapping.text)

        mappings = client.get("/api/v1/capability-mappings", headers=SUPER_ADMIN)
        category_mapping = next(item for item in mappings.json() if item["capability"] == "category_recognition")
        try:
            disabled = client.put(
                f"/api/v1/capability-mappings/{category_mapping['id']}",
                headers=SUPER_ADMIN,
                json={"primary_model_id": category_mapping["primary_model_id"], "fallback_model_id": category_mapping["fallback_model_id"], "enabled": False},
            )
            self.assertEqual(disabled.status_code, 200, disabled.text)

            resolved = client.get("/api/v1/ai/resolve-model?capability=category_recognition", headers=SUPER_ADMIN)
            self.assertEqual(resolved.status_code, 200, resolved.text)
            self.assertEqual(resolved.json()["source"], "legacy")
            self.assertEqual(resolved.json()["model"]["model_name"], provider.json()["model_name"])
            self.assertIn("deprecated", resolved.json()["warning"].lower())
        finally:
            client.put(
                f"/api/v1/capability-mappings/{category_mapping['id']}",
                headers=SUPER_ADMIN,
                json={
                    "primary_model_id": category_mapping["primary_model_id"],
                    "fallback_model_id": category_mapping["fallback_model_id"],
                    "enabled": category_mapping["enabled"],
                },
            )


if __name__ == "__main__":
    unittest.main()

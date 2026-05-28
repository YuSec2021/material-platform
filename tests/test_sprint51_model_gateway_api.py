import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}
REGULAR_USER = {"X-User-Role": "user"}


class Sprint51ModelGatewayApiTest(unittest.TestCase):
    def unique_name(self, prefix: str) -> str:
        return f"{prefix}-{time.time_ns()}"

    def create_model(self, model_name: str | None = None, **overrides):
        payload = {
            "display_name": self.unique_name("Sprint51 Model"),
            "provider": "dashscope",
            "model_name": model_name or self.unique_name("qwen-sprint51"),
            "base_url": "http://127.0.0.1:1/v1",
            "api_key": "secret-sprint51",
            "timeout": 2,
            "temperature": 0.2,
            "max_tokens": 512,
            "enabled": True,
        }
        payload.update(overrides)
        response = client.post("/api/v1/models", headers=SUPER_ADMIN, json=payload)
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def test_model_crud_masks_secrets_and_enforces_validation(self):
        model_name = self.unique_name("qwen-sprint51")
        created = self.create_model(model_name=model_name)
        self.assertEqual(created["connection_status"], "untested")
        self.assertNotIn("api_key", created)
        self.assertNotIn("api_key_encrypted", created)

        listed = client.get("/api/v1/models?provider=dashscope&enabled=true&page=1&page_size=20", headers=SUPER_ADMIN)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertTrue(any(item["id"] == created["id"] for item in listed.json()))

        updated = client.put(
            f"/api/v1/models/{created['id']}",
            headers=SUPER_ADMIN,
            json={"display_name": "Sprint51 Updated", "timeout": 3, "temperature": 0.5, "max_tokens": 1024, "enabled": False},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["display_name"], "Sprint51 Updated")
        self.assertFalse(updated.json()["enabled"])

        toggled = client.patch(f"/api/v1/models/{created['id']}/toggle", headers=SUPER_ADMIN)
        self.assertEqual(toggled.status_code, 200, toggled.text)
        self.assertTrue(toggled.json()["enabled"])

        duplicate = client.post(
            "/api/v1/models",
            headers=SUPER_ADMIN,
            json={
                "display_name": self.unique_name("Duplicate"),
                "provider": "dashscope",
                "model_name": model_name,
                "base_url": "http://127.0.0.1:1/v1",
                "api_key": "secret",
                "timeout": 2,
                "enabled": True,
            },
        )
        self.assertIn(duplicate.status_code, {409, 422}, duplicate.text)

        invalid_provider = client.post(
            "/api/v1/models",
            headers=SUPER_ADMIN,
            json={
                "display_name": "Invalid Provider",
                "provider": "invalid_provider",
                "model_name": self.unique_name("invalid"),
                "base_url": "http://127.0.0.1:1/v1",
                "api_key": "secret",
                "timeout": 2,
                "enabled": True,
            },
        )
        self.assertEqual(invalid_provider.status_code, 422, invalid_provider.text)
        self.assertIn("provider", invalid_provider.text)

        forbidden = client.post(
            "/api/v1/models",
            headers=REGULAR_USER,
            json={
                "display_name": self.unique_name("Forbidden"),
                "provider": "custom",
                "model_name": self.unique_name("forbidden"),
                "base_url": "http://127.0.0.1:1/v1",
                "api_key": "secret",
                "timeout": 2,
                "enabled": True,
            },
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        audit = client.get("/api/v1/audit-logs?resource=model&page=1&page_size=20", headers=SUPER_ADMIN)
        self.assertEqual(audit.status_code, 200, audit.text)
        self.assertGreaterEqual(len(audit.json()["items"]), 1)

        deleted = client.delete(f"/api/v1/models/{created['id']}", headers=SUPER_ADMIN)
        self.assertIn(deleted.status_code, {200, 204}, deleted.text)
        missing = client.get(f"/api/v1/models/{created['id']}", headers=SUPER_ADMIN)
        self.assertEqual(missing.status_code, 404, missing.text)

    def test_connection_test_and_capability_mapping_constraints(self):
        first = self.create_model(provider="custom", model_name=self.unique_name("connection-test"))
        second = self.create_model(model_name=self.unique_name("fallback-test"))

        tested = client.get(f"/api/v1/models/{first['id']}/test", headers=SUPER_ADMIN)
        self.assertEqual(tested.status_code, 200, tested.text)
        body = tested.json()
        self.assertFalse(body["ok"])
        self.assertEqual(body["status"], "error")
        self.assertIn("latency_ms", body)

        refreshed = client.get(f"/api/v1/models/{first['id']}", headers=SUPER_ADMIN)
        self.assertEqual(refreshed.json()["connection_status"], "error")
        self.assertIsNotNone(refreshed.json()["last_tested_at"])

        defaults = client.get("/api/v1/capability-mappings", headers=SUPER_ADMIN)
        self.assertEqual(defaults.status_code, 200, defaults.text)
        capabilities = {item["capability"] for item in defaults.json()}
        self.assertTrue({"material_add", "category_recognition", "material_match", "attr_recommend", "material_governance"} <= capabilities)

        mapping = client.post(
            "/api/v1/capability-mappings",
            headers=SUPER_ADMIN,
            json={
                "capability": self.unique_name("sprint51_custom_capability"),
                "primary_model_id": first["id"],
                "fallback_model_id": second["id"],
                "enabled": True,
            },
        )
        self.assertIn(mapping.status_code, {200, 201}, mapping.text)
        mapping_body = mapping.json()
        self.assertEqual(mapping_body["primary_model_id"], first["id"])

        blocked_delete = client.delete(f"/api/v1/models/{first['id']}", headers=SUPER_ADMIN)
        self.assertEqual(blocked_delete.status_code, 409, blocked_delete.text)

        same_model = client.post(
            "/api/v1/capability-mappings",
            headers=SUPER_ADMIN,
            json={
                "capability": self.unique_name("sprint51_same_model"),
                "primary_model_id": first["id"],
                "fallback_model_id": first["id"],
                "enabled": True,
            },
        )
        self.assertIn(same_model.status_code, {400, 422}, same_model.text)

        forbidden = client.put(
            f"/api/v1/capability-mappings/{mapping_body['id']}",
            headers=REGULAR_USER,
            json={"enabled": False},
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        audit = client.get("/api/v1/audit-logs?resource=capability_mapping&page=1&page_size=20", headers=SUPER_ADMIN)
        self.assertEqual(audit.status_code, 200, audit.text)
        self.assertGreaterEqual(len(audit.json()["items"]), 1)

        deleted = client.delete(f"/api/v1/capability-mappings/{mapping_body['id']}", headers=SUPER_ADMIN)
        self.assertIn(deleted.status_code, {200, 204}, deleted.text)
        missing = client.get(f"/api/v1/capability-mappings/{mapping_body['id']}", headers=SUPER_ADMIN)
        self.assertEqual(missing.status_code, 404, missing.text)


if __name__ == "__main__":
    unittest.main()

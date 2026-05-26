import json
import os
import time
import unittest
from unittest.mock import patch

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}
REGULAR_USER = {"X-Username": "regular_user"}


class FakeProviderResponse:
    status_code = 200

    def json(self):
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "categories": [
                                    {
                                        "level1": "办公设备",
                                        "level2": "打印机",
                                        "level3": "激光打印机",
                                        "confidence": 0.91,
                                    }
                                ],
                                "suggestions": ["ok"],
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ]
        }


class Sprint38AIAgentConfigTest(unittest.TestCase):
    def unique_key(self) -> str:
        return f"sprint38-{time.time_ns()}"

    def create_agent(self, key: str, **overrides):
        payload = {
            "config_key": key,
            "provider": "deepseek",
            "model_name": "deepseek-chat",
            "base_url": "http://127.0.0.1:19040/v1",
            "api_key": "sprint38-secret-key",
            "temperature": 0.2,
            "max_tokens": 1234,
            "timeout": 9,
            "enabled": True,
        }
        payload.update(overrides)
        response = client.post("/api/v1/ai/agent-configs", headers=SUPER_ADMIN, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_agent_config_crud_masks_secrets_and_enforces_read_only(self):
        key = self.unique_key()
        created = self.create_agent(key, provider="qwen", model_name="qwen-plus", temperature=0.4)
        self.assertEqual(created["config_key"], key)
        self.assertTrue(created["has_api_key"])
        self.assertIn("*", created["api_key_masked"])
        self.assertNotIn("sprint38-secret-key", json.dumps(created))
        self.assertNotIn("encrypted_api_key", json.dumps(created))

        listed = client.get("/api/v1/ai/agent-configs", headers=REGULAR_USER)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertTrue(any(item["id"] == created["id"] for item in listed.json()))
        self.assertNotIn("sprint38-secret-key", listed.text)

        forbidden_payload = {
            "config_key": f"{key}-blocked",
            "provider": "moonshot",
            "model_name": "moonshot-v1-8k",
            "base_url": "http://127.0.0.1:19041/v1",
            "api_key": "readonly-secret",
            "temperature": 0.5,
            "max_tokens": 2048,
            "timeout": 20,
            "enabled": True,
        }
        self.assertEqual(client.post("/api/v1/ai/agent-configs", headers=REGULAR_USER, json=forbidden_payload).status_code, 403)
        self.assertEqual(client.patch(f"/api/v1/ai/agent-configs/{created['id']}/toggle", headers=REGULAR_USER).status_code, 403)
        self.assertEqual(client.get(f"/api/v1/ai/agent-configs/{created['id']}/test", headers=REGULAR_USER).status_code, 403)
        self.assertEqual(client.delete(f"/api/v1/ai/agent-configs/{created['id']}", headers=REGULAR_USER).status_code, 403)

        updated_payload = {
            "config_key": key,
            "provider": "qwen",
            "model_name": "qwen-max",
            "base_url": "http://127.0.0.1:19040/v1",
            "api_key": "**unchanged**",
            "temperature": 0.7,
            "max_tokens": 4096,
            "timeout": 30,
            "enabled": True,
        }
        updated = client.put(f"/api/v1/ai/agent-configs/{created['id']}", headers=SUPER_ADMIN, json=updated_payload)
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["model_name"], "qwen-max")
        self.assertEqual(updated.json()["max_tokens"], 4096)

        toggled = client.patch(f"/api/v1/ai/agent-configs/{created['id']}/toggle", headers=SUPER_ADMIN)
        self.assertEqual(toggled.status_code, 200, toggled.text)
        self.assertFalse(toggled.json()["enabled"])

        deleted = client.delete(f"/api/v1/ai/agent-configs/{created['id']}", headers=SUPER_ADMIN)
        self.assertEqual(deleted.status_code, 200, deleted.text)

    def test_category_recognition_uses_mapped_agent_settings(self):
        key = self.unique_key()
        agent = self.create_agent(key, api_key="capability-secret")
        mapping = client.put(
            "/api/v1/ai/capability-mappings/category_recognition",
            headers=SUPER_ADMIN,
            json={"agent_config_id": agent["id"], "fallback_agent_config_id": None, "enabled": True},
        )
        self.assertEqual(mapping.status_code, 200, mapping.text)
        self.assertEqual(mapping.json()["agent_config_id"], agent["id"])

        library = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={"name": key, "code": key[-24:].replace("-", "").upper(), "description": "Sprint 38"},
        )
        self.assertEqual(library.status_code, 200, library.text)
        imported = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library.json()['id']}",
            headers=SUPER_ADMIN,
            json={"rows": [{"一级类目": "办公设备", "二级类目": "打印机", "三级类目": "激光打印机"}]},
        )
        self.assertEqual(imported.status_code, 200, imported.text)

        observed = {}

        def fake_post(url, json=None, headers=None, timeout=None):
            observed["url"] = url
            observed["json"] = json
            observed["headers"] = headers or {}
            observed["timeout"] = timeout
            return FakeProviderResponse()

        with patch("backend.app.main.httpx.post", side_effect=fake_post):
            recognized = client.post(
                "/api/v1/ai/category-recognition/recognize",
                headers=SUPER_ADMIN,
                json={"text": "办公室激光打印机", "category_library_id": library.json()["id"]},
            )

        self.assertEqual(recognized.status_code, 200, recognized.text)
        result = recognized.json()["categories"][0]
        self.assertEqual(result["level1"], "办公设备")
        self.assertEqual(result["level2"], "打印机")
        self.assertEqual(result["level3"], "激光打印机")
        self.assertEqual(observed["json"]["model"], "deepseek-chat")
        self.assertEqual(observed["json"]["temperature"], 0.2)
        self.assertEqual(observed["json"]["max_tokens"], 1234)
        self.assertEqual(observed["timeout"], 9)
        self.assertEqual(observed["headers"]["Authorization"], "Bearer capability-secret")

        deleted = client.delete(f"/api/v1/ai/agent-configs/{agent['id']}", headers=SUPER_ADMIN)
        self.assertEqual(deleted.status_code, 200, deleted.text)


if __name__ == "__main__":
    unittest.main()

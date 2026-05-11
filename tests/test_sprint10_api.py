import os
import time
import unittest

os.environ.setdefault("AI_DEBUG", "true")
os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


class Sprint10ApiTest(unittest.TestCase):
    def test_model_config_masks_key_mapping_hot_switch_and_tracing(self):
        unique = time.time_ns()
        secret = f"sprint10-secret-{unique}"
        created = client.post(
            "/api/v1/ai/providers",
            json={
                "display_name": f"Sprint 10 Primary {unique}",
                "provider": "mock",
                "base_url": "local://primary",
                "model_name": f"primary-model-{unique}",
                "api_key": secret,
                "capabilities": ["category_match"],
                "enabled": True,
                "timeout_seconds": 2,
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        primary = created.json()
        self.assertEqual(primary["connection_status"], "connected")
        self.assertNotIn(secret, created.text)
        self.assertTrue(primary["api_key_masked"])

        listed = client.get("/api/v1/ai/providers")
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertNotIn(secret, listed.text)

        secondary = client.post(
            "/api/v1/ai/providers",
            json={
                "display_name": f"Sprint 10 Secondary {unique}",
                "provider": "mock",
                "base_url": "local://secondary",
                "model_name": f"secondary-model-{unique}",
                "capabilities": [],
                "enabled": True,
                "timeout_seconds": 2,
            },
        ).json()
        mapping = client.put(
            "/api/v1/ai/capability-mappings/category_match",
            json={
                "capability": "category_match",
                "primary_model_id": primary["id"],
                "fallback_model_id": None,
                "enabled": True,
            },
        )
        self.assertEqual(mapping.status_code, 200, mapping.text)

        first = client.post(
            "/api/v1/ai/capabilities/category_match/invoke",
            json={"prompt": "hot switch primary"},
        )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["model"], primary["model_name"])

        remapped = client.put(
            "/api/v1/ai/capability-mappings/category_match",
            json={
                "capability": "category_match",
                "primary_model_id": secondary["id"],
                "fallback_model_id": None,
                "enabled": True,
            },
        )
        self.assertEqual(remapped.status_code, 200, remapped.text)
        second = client.post(
            "/api/v1/ai/capabilities/category_match/invoke",
            json={"prompt": "hot switch secondary"},
        )
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(second.json()["model"], secondary["model_name"])

        traces = client.get("/api/v1/debug/trace?capability=category_match")
        self.assertEqual(traces.status_code, 200, traces.text)
        self.assertTrue(any(item["trace_id"] == second.json()["trace_id"] for item in traces.json()))
        detail = client.get(f"/api/v1/debug/trace/{second.json()['trace_id']}")
        self.assertEqual(detail.status_code, 200, detail.text)
        span_types = {span["span_type"] for span in detail.json()["spans"]}
        self.assertIn("chain", span_types)
        self.assertIn("llm", span_types)
        self.assertEqual(detail.json()["storage_table"], "tracer.spans")

    def test_gateway_falls_back_after_primary_failure(self):
        unique = time.time_ns()
        primary = client.post(
            "/api/v1/ai/providers",
            json={
                "display_name": f"Sprint 10 Failing Primary {unique}",
                "provider": "vLLM",
                "base_url": "http://127.0.0.1:1",
                "model_name": f"primary-fails-{unique}",
                "capabilities": [],
                "enabled": True,
                "timeout_seconds": 1,
            },
        ).json()
        fallback = client.post(
            "/api/v1/ai/providers",
            json={
                "display_name": f"Sprint 10 Fallback {unique}",
                "provider": "mock",
                "base_url": "local://fallback",
                "model_name": f"fallback-model-{unique}",
                "capabilities": [],
                "enabled": True,
                "timeout_seconds": 1,
            },
        ).json()
        mapping = client.put(
            "/api/v1/ai/capability-mappings/material_analysis",
            json={
                "capability": "material_analysis",
                "primary_model_id": primary["id"],
                "fallback_model_id": fallback["id"],
                "enabled": True,
            },
        )
        self.assertEqual(mapping.status_code, 200, mapping.text)
        result = client.post(
            "/api/v1/ai/capabilities/material_analysis/invoke",
            json={"prompt": "fallback required"},
        )
        self.assertEqual(result.status_code, 200, result.text)
        data = result.json()
        self.assertTrue(data["fallback_used"])
        self.assertEqual(data["model"], fallback["model_name"])
        self.assertEqual(data["attempted_models"][0]["status"], "error")
        self.assertEqual(data["attempted_models"][1]["status"], "ok")


if __name__ == "__main__":
    unittest.main()

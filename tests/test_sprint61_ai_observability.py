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


class FakeOpenAIResponse:
    status_code = 200

    def json(self):
        return {
            "id": "chatcmpl-sprint61",
            "object": "chat.completion",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": "observed"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 123, "completion_tokens": 45, "total_tokens": 168},
        }


class Sprint61AiObservabilityTest(unittest.TestCase):
    def unique_name(self, prefix: str) -> str:
        return f"{prefix}-{time.time_ns()}"

    def create_openai_model(self):
        response = client.post(
            "/api/v1/models",
            headers=SUPER_ADMIN,
            json={
                "display_name": self.unique_name("Sprint61 Usage Model"),
                "provider": "openai",
                "model_name": self.unique_name("sprint61-usage-model"),
                "base_url": "http://127.0.0.1:18061/v1",
                "api_key": "test-key",
                "timeout": 5,
                "temperature": 0,
                "max_tokens": 128,
                "enabled": True,
            },
        )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def upsert_category_match_mapping(self, model_id: int):
        mappings = client.get("/api/v1/capability-mappings", headers=SUPER_ADMIN)
        self.assertEqual(mappings.status_code, 200, mappings.text)
        existing = next((item for item in mappings.json() if item["capability"] == "category_match"), None)
        payload = {"primary_model_id": model_id, "fallback_model_id": None, "enabled": True}
        if existing:
            response = client.put(f"/api/v1/capability-mappings/{existing['id']}", headers=SUPER_ADMIN, json=payload)
        else:
            response = client.post(
                "/api/v1/capability-mappings",
                headers=SUPER_ADMIN,
                json={"capability": "category_match", **payload},
            )
        self.assertIn(response.status_code, {200, 201}, response.text)

    def test_price_api_usage_cost_and_prompt_template_trace_metadata(self):
        price = client.put(
            "/api/v1/ai/capability-prices/category_match",
            headers=SUPER_ADMIN,
            json={
                "prompt_price_per_1k_cny": 0.01,
                "completion_price_per_1k_cny": 0.02,
                "currency": "CNY",
                "enabled": True,
            },
        )
        self.assertIn(price.status_code, {200, 201}, price.text)
        self.assertEqual(price.json()["capability"], "category_match")
        self.assertEqual(price.json()["prompt_price_per_1k_cny"], 0.01)

        fetched_price = client.get("/api/v1/ai/capability-prices/category_match", headers=SUPER_ADMIN)
        self.assertEqual(fetched_price.status_code, 200, fetched_price.text)
        self.assertEqual(fetched_price.json()["completion_price_per_1k_cny"], 0.02)
        self.assertTrue(fetched_price.json()["id"])

        template = client.post(
            "/api/v1/ai/prompt-templates",
            headers=SUPER_ADMIN,
            json={
                "template_key": "sprint61-category-match",
                "capability": "category_match",
                "prompt_version": "v2026.06.04-contract",
                "content": "Classify material: {{material_name}}",
                "enabled": True,
            },
        )
        self.assertIn(template.status_code, {200, 201}, template.text)
        self.assertEqual(template.json()["prompt_version"], "v2026.06.04-contract")

        fetched_template = client.get("/api/v1/ai/prompt-templates/sprint61-category-match", headers=SUPER_ADMIN)
        self.assertEqual(fetched_template.status_code, 200, fetched_template.text)
        self.assertEqual(fetched_template.json()["content"], "Classify material: {{material_name}}")

        model = self.create_openai_model()
        self.upsert_category_match_mapping(model["id"])

        with patch("backend.app.main.httpx.post", return_value=FakeOpenAIResponse()):
            invoked = client.post(
                "/api/v1/ai/capabilities/category_match/invoke",
                headers=SUPER_ADMIN,
                json={
                    "template_key": "sprint61-category-match",
                    "template_variables": {"material_name": "高压电缆"},
                },
            )
        self.assertEqual(invoked.status_code, 200, invoked.text)
        self.assertEqual(invoked.json()["prompt"], "Classify material: 高压电缆")

        detail = client.get(f"/api/v1/debug/trace/{invoked.json()['trace_id']}", headers=SUPER_ADMIN)
        self.assertEqual(detail.status_code, 200, detail.text)
        spans = detail.json()["spans"]
        llm_span = next(span for span in spans if span["operation_name"] == "llm.provider.chat")
        self.assertEqual(llm_span["prompt_tokens"], 123)
        self.assertEqual(llm_span["completion_tokens"], 45)
        self.assertEqual(llm_span["total_tokens"], 168)
        self.assertEqual(llm_span["cost_cny"], 0.00213)
        self.assertEqual(llm_span["price_capability"], "category_match")
        self.assertTrue(any(span.get("template_key") == "sprint61-category-match" for span in spans))
        self.assertTrue(any(span.get("prompt_version") == "v2026.06.04-contract" for span in spans))


if __name__ == "__main__":
    unittest.main()

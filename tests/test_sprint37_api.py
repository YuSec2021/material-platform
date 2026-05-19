import json
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


class FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class FakeChatPost:
    def __init__(self, responses):
        self.responses = responses
        self.requests: list[dict] = []

    def __call__(self, url, *, json, headers, timeout):
        self.requests.append(json)
        status, payload = self.responses[len(self.requests) - 1]
        return FakeResponse(status, payload)


def chat_payload(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


class Sprint37CategoryRecognitionApiTest(unittest.TestCase):
    def tearDown(self):
        token = self.unique_token()
        response = client.post(
            "/api/v1/ai/providers",
            headers=SUPER_ADMIN,
            json={
                "display_name": f"Sprint 37 Local Reset {token}",
                "provider": "mock",
                "model": f"mock-category-recognition-{token}",
                "base_url": "local://category-recognition",
                "enabled": True,
                "capability": "category_recognition",
            },
        )
        if response.status_code == 200:
            client.put(
                "/api/v1/ai/capability-mappings/category_recognition",
                headers=SUPER_ADMIN,
                json={"primary_model_id": response.json()["id"], "enabled": True},
            )

    def unique_token(self) -> str:
        return str(time.time_ns())

    def configure_provider(self, token: str) -> dict:
        response = client.post(
            "/api/v1/ai/providers",
            headers=SUPER_ADMIN,
            json={
                "display_name": f"Sprint 37 Provider {token}",
                "provider": "openai-compatible",
                "model": "category-default-model",
                "base_url": "http://fake-category-provider.local/v1",
                "api_key": "test-key",
                "enabled": True,
                "timeout": 5,
                "capability": "category_recognition",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        provider = response.json()
        mapped = client.put(
            "/api/v1/ai/capability-mappings/category_recognition",
            headers=SUPER_ADMIN,
            json={"primary_model_id": provider["id"], "enabled": True},
        )
        self.assertEqual(mapped.status_code, 200, mapped.text)
        return provider

    def create_library(self, token: str, paths: list[tuple[str, str, str]]) -> dict:
        library_response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={"name": f"Sprint 37 Library {token}", "code": f"S37{token[-8:]}"},
        )
        self.assertEqual(library_response.status_code, 200, library_response.text)
        library = library_response.json()
        rows = [{"一级类目": a, "二级类目": b, "三级类目": c} for a, b, c in paths]
        imported = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=SUPER_ADMIN,
            json={"rows": rows},
        )
        self.assertEqual(imported.status_code, 200, imported.text)
        return library

    def test_sync_uses_provider_override_prompt_context_and_parses_json(self):
        token = self.unique_token()
        content = json.dumps(
            {
                "categories": [{"level1": "办公设备", "level2": "打印机", "level3": "激光打印机", "confidence": 0.93}],
                "suggestions": ["建议复核品牌和型号"],
            },
            ensure_ascii=False,
        )
        fake = FakeChatPost([(200, chat_payload(content))])
        with patch("backend.app.main.httpx.post", fake):
            self.configure_provider(token)
            library = self.create_library(
                token,
                [("办公设备", "打印机", "激光打印机"), ("办公设备", "扫描仪", "平板扫描仪")],
            )
            response = client.post(
                "/api/v1/ai/category-recognition/recognize",
                headers=SUPER_ADMIN,
                json={
                    "text": "HP LaserJet 彩色激光打印机，适合办公室批量打印",
                    "category_library_id": library["id"],
                    "model_override": "category-override-model",
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["categories"][0]["level1"], "办公设备")
        self.assertEqual(payload["categories"][0]["level2"], "打印机")
        self.assertEqual(payload["categories"][0]["level3"], "激光打印机")
        self.assertEqual(payload["categories"][0]["confidence"], 0.93)
        self.assertEqual(len(fake.requests), 1)
        request = fake.requests[0]
        self.assertEqual(request["model"], "category-override-model")
        prompt_text = json.dumps(request["messages"], ensure_ascii=False)
        self.assertIn("structured JSON output", prompt_text)
        self.assertIn("激光打印机", prompt_text)
        self.assertIn("平板扫描仪", prompt_text)

    def test_async_batch_fenced_json_retry_trace_and_openapi(self):
        token = self.unique_token()
        responses = [
            (500, {"error": "temporary"}),
            (
                200,
                chat_payload(
                    '```json\n{"categories":[{"level1":"办公设备","level2":"打印机","level3":"激光打印机","confidence":0.64},'
                    '{"level1":"办公设备","level2":"扫描仪","level3":"平板扫描仪","confidence":0.52}],'
                    '"suggestions":["建议人工复核"]}\n```'
                ),
            ),
            (200, chat_payload('{"categories":[{"level1":"安全用品","level2":"防护用品","level3":"防护手套","confidence":0.88}],"suggestions":[]}')),
            (200, chat_payload('{"categories":[{"level1":"电气材料","level2":"线缆","level3":"电源线","confidence":0.9}],"suggestions":[]}')),
        ]
        fake = FakeChatPost(responses)
        with patch("backend.app.main.httpx.post", fake):
            self.configure_provider(token)
            library = self.create_library(
                token,
                [
                    ("办公设备", "打印机", "激光打印机"),
                    ("办公设备", "扫描仪", "平板扫描仪"),
                    ("安全用品", "防护用品", "防护手套"),
                    ("电气材料", "线缆", "电源线"),
                ],
            )
            first = client.post(
                "/api/v1/ai/category-recognition/recognize",
                headers=SUPER_ADMIN,
                json={"text": "办公室多功能成像设备，可打印也可扫描", "category_library_id": library["id"]},
            )
            async_response = client.post(
                "/api/v1/ai/category-recognition/recognize-async",
                headers=SUPER_ADMIN,
                json={"text": "耐磨防割安全防护手套", "category_library_id": library["id"]},
            )
            batch = client.post(
                "/api/v1/ai/category-recognition/batch",
                headers=SUPER_ADMIN,
                json={"category_library_id": library["id"], "items": ["三芯电源线"]},
            )

        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual([item["confidence"] for item in first.json()["categories"]], [0.64, 0.52])
        self.assertEqual(len(fake.requests), 4)

        self.assertEqual(async_response.status_code, 200, async_response.text)
        job = async_response.json()
        self.assertEqual(job["status"], "succeeded")
        polled = client.get(f"/api/v1/ai/category-recognition/jobs/{job['job_id']}", headers=SUPER_ADMIN)
        self.assertEqual(polled.status_code, 200, polled.text)
        self.assertEqual(polled.json()["result"]["categories"][0]["level3"], "防护手套")

        self.assertEqual(batch.status_code, 200, batch.text)
        self.assertEqual(batch.json()["results"][0]["text"], "三芯电源线")
        self.assertEqual(batch.json()["results"][0]["categories"][0]["level3"], "电源线")

        oversized = client.post(
            "/api/v1/ai/category-recognition/batch",
            headers=SUPER_ADMIN,
            json={"items": ["x"] * 101},
        )
        self.assertEqual(oversized.status_code, 422, oversized.text)
        self.assertEqual(len(fake.requests), 4)

        traces = client.get("/api/v1/debug/trace?capability=category_recognition", headers=SUPER_ADMIN)
        self.assertEqual(traces.status_code, 200, traces.text)
        self.assertTrue(any(item["model"] == "category-default-model" for item in traces.json()))

        openapi = client.get("/openapi.json").json()
        self.assertIn("/api/v1/ai/category-recognition/recognize", openapi["paths"])
        self.assertIn("/api/v1/ai/category-recognition/recognize-async", openapi["paths"])
        self.assertIn("/api/v1/ai/category-recognition/jobs/{job_id}", openapi["paths"])
        self.assertIn("/api/v1/ai/category-recognition/batch", openapi["paths"])
        schemas = openapi["components"]["schemas"]
        for name in [
            "CategoryRecognitionRequest",
            "CategoryRecognitionResponse",
            "CategoryRecognitionBatchRequest",
            "CategoryRecognitionJob",
            "CategoryRecognitionJobResult",
        ]:
            self.assertIn(name, schemas)
        self.assertEqual(schemas["CategoryRecognitionBatchRequest"]["properties"]["items"]["maxItems"], 100)


if __name__ == "__main__":
    unittest.main()

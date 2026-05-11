import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


class Sprint5ApiTest(unittest.TestCase):
    def context(self) -> tuple[dict, dict]:
        library = client.get("/api/v1/material-libraries").json()[0]
        category = client.get("/api/v1/categories").json()[0]
        return library, category

    def test_ai_add_preview_confirm_and_openapi(self):
        library, _ = self.context()
        unique = time.time_ns()
        preview = client.post(
            "/api/v1/materials/ai-add/preview",
            json={
                "material_library_id": library["id"],
                "input_text": f"申请新增 华为 24口千兆交换机 S1730S-L24T-A1-{unique}，单位台，品牌华为，端口数24，速率1000Mbps，适用于办公网络接入",
            },
        )
        self.assertEqual(preview.status_code, 200, preview.text)
        data = preview.json()
        self.assertEqual(data["capability"], "material_add")
        self.assertTrue(data["provider"])
        self.assertTrue(data["model"])
        self.assertTrue(data["trace_id"].startswith("trace-"))
        self.assertIn("24", str(data["attributes"]["端口数"]))
        self.assertEqual(data["attributes"]["速率"], "1000Mbps")
        self.assertEqual(data["duplicate_check"]["capability"], "material_match")

        confirmed = client.post("/api/v1/materials/ai-add/confirm", json={"preview": data, "allow_duplicate": True})
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        material = confirmed.json()["material"]
        self.assertTrue(material["code"].startswith("MAT-"))
        self.assertEqual(material["status"], "normal")

        openapi = client.get("/openapi.json").text
        self.assertIn("/api/v1/materials/ai-add/preview", openapi)
        self.assertIn("/api/v1/materials/match", openapi)
        self.assertIn("material_add", openapi)
        self.assertIn("material_match", openapi)

    def test_match_scores_and_provider_hot_switch(self):
        library, category = self.context()
        provider = client.post(
            "/api/v1/ai/providers",
            json={
                "provider": "mock",
                "model": f"mock-hot-switch-{time.time_ns()}",
                "endpoint": "local://mock",
                "capabilities": ["material_add", "material_match"],
                "active": True,
            },
        )
        self.assertEqual(provider.status_code, 200, provider.text)
        selected_model = provider.json()["model"]
        test_result = client.post(
            "/api/v1/ai/providers/test",
            json={
                "provider": "mock",
                "model": selected_model,
                "endpoint": "local://mock",
                "capabilities": ["material_add", "material_match"],
                "active": True,
            },
        ).json()
        self.assertTrue(test_result["ok"])

        preview = client.post(
            "/api/v1/materials/ai-add/preview",
            json={
                "material_library_id": library["id"],
                "input_text": "申请新增 华为 24口千兆交换机 热切换测试，单位台，品牌华为，端口数24，速率1000Mbps",
            },
        ).json()
        self.assertEqual(preview["model"], selected_model)
        self.assertEqual(preview["duplicate_check"]["model"], selected_model)

        baseline = client.post(
            "/api/v1/materials",
            json={
                "name": f"华为 S1730S 24端口千兆交换机 {time.time_ns()}",
                "product_name_id": preview["product_name_id"],
                "material_library_id": library["id"],
                "category_id": category["id"],
                "unit": "台",
                "brand_id": preview["brand_id"],
                "description": "办公网络接入用 gigabit switch",
                "attributes": {"端口数": "24", "速率": "1000Mbps", "型号": "S1730S-L24T-A1"},
            },
        )
        self.assertIn(baseline.status_code, {200, 409}, baseline.text)

        match = client.post(
            "/api/v1/materials/match",
            json={
                "material_library_id": library["id"],
                "query": "Huawei office access 24 port gigabit switch S1730S",
                "brand": "华为",
                "attributes": {"端口数": "24", "速率": "1000Mbps", "型号": "S1730S-L24T-A1"},
            },
        )
        self.assertEqual(match.status_code, 200, match.text)
        result = match.json()
        self.assertEqual(result["capability"], "material_match")
        self.assertLessEqual(len(result["matches"]), 3)
        self.assertGreaterEqual(result["matches"][0]["total_score"], 0.75)
        self.assertIn(result["matches"][0]["classification"], {"highly_duplicate", "suspicious"})
        self.assertIn("semantic_score", result["matches"][0])
        self.assertIn("text_score", result["matches"][0])
        self.assertIn("brand_score", result["matches"][0])


if __name__ == "__main__":
    unittest.main()

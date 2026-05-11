import os
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


class Sprint3ApiTest(unittest.TestCase):
    def test_attribute_crud_recommendation_and_changes(self):
        product = client.get("/api/v1/product-names").json()[0]
        created = client.post(
            "/api/v1/attributes",
            json={
                "product_name_id": product["id"],
                "name": "测试打印速度",
                "data_type": "number",
                "unit": "页/分钟",
                "required": True,
                "default_value": "25",
            },
            headers={"X-User-Role": "super_admin"},
        )
        self.assertEqual(created.status_code, 200)
        attribute = created.json()
        self.assertTrue(attribute["code"].startswith("ATTR-"))
        updated = client.put(
            f"/api/v1/attributes/{attribute['id']}",
            json={"unit": "ppm", "default_value": "35", "description": "每分钟输出页数"},
            headers={"X-User-Role": "super_admin"},
        ).json()
        self.assertEqual(updated["version"], 2)
        changes = client.get(f"/api/v1/attributes/{attribute['id']}/changes").json()
        self.assertEqual(changes[0]["version"], 2)
        self.assertIn("default_value", changes[0]["changed_fields"])
        recommendation = client.post(
            "/api/v1/ai/attribute-recommend",
            json={"product_name_id": product["id"]},
            headers={"X-User-Role": "super_admin"},
        ).json()
        self.assertEqual(recommendation["capability"], "attr_recommend")
        self.assertGreaterEqual(len(recommendation["recommendations"]), 3)

    def test_governance_preview_import_and_brand_contracts(self):
        product = client.get("/api/v1/product-names").json()[0]
        preview = client.post(
            "/api/v1/attributes/governance/preview",
            json={
                "product_name_id": product["id"],
                "rows": "速度/每分钟页数/数值\n打印颜色/黑白彩色/枚举\n纸张尺寸/A4 A5/枚举",
            },
        ).json()
        self.assertEqual(preview["count"], 3)
        self.assertEqual(preview["items"][0]["name"], "打印速度")
        imported = client.post(
            "/api/v1/attributes/governance/import",
            json={"product_name_id": product["id"], "items": preview["items"]},
        ).json()
        self.assertEqual(len(imported), 3)
        brand = client.post(
            "/api/v1/brands",
            json={
                "name": "测试品牌",
                "description": "办公设备品牌",
                "logo": {"filename": "logo.png", "content_type": "image/png", "data_url": "data:image/png;base64,AA=="},
                "enabled": True,
            },
        )
        self.assertIn(brand.status_code, {200, 409})
        brands = client.get("/api/v1/brands", params={"search": "测试品牌"}).json()
        self.assertTrue(any(item["code"].startswith("BRAND-") for item in brands))


if __name__ == "__main__":
    unittest.main()

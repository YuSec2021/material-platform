import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


class Sprint4ApiTest(unittest.TestCase):
    def material_payload(self, name: str) -> dict:
        product = client.get("/api/v1/product-names").json()[0]
        library = client.get("/api/v1/material-libraries").json()[0]
        category = client.get("/api/v1/categories").json()[0]
        return {
            "name": name,
            "product_name_id": product["id"],
            "material_library_id": library["id"],
            "category_id": category["id"],
            "unit": product["unit"],
            "description": "Sprint 4 material test",
            "attributes": {"打印速度": "30页/分钟", "颜色模式": "彩色"},
        }

    def test_material_crud_search_filter_and_status_machine(self):
        name = f"Sprint 4 API 物料 {time.time_ns()}"
        created = client.post("/api/v1/materials", json=self.material_payload(name))
        self.assertEqual(created.status_code, 200, created.text)
        material = created.json()
        self.assertTrue(material["code"].startswith("MAT-"))
        self.assertEqual(material["status"], "normal")

        searched = client.get("/api/v1/materials", params={"search": name}).json()
        self.assertEqual(len([item for item in searched if item["name"] == name]), 1)
        filtered = client.get("/api/v1/materials", params={"status": "normal", "search": name}).json()
        self.assertEqual(filtered[0]["status"], "normal")

        updated = client.put(
            f"/api/v1/materials/{material['id']}",
            json={"description": "Updated material description", "attributes": {"打印速度": "35页/分钟"}},
        ).json()
        self.assertEqual(updated["description"], "Updated material description")
        self.assertEqual(updated["attributes"]["打印速度"], "35页/分钟")

        invalid = client.post(
            f"/api/v1/materials/{material['id']}/transition",
            json={"target_status": "stop_use", "reason": "skip attempt"},
        )
        self.assertEqual(invalid.status_code, 400)
        stopped_purchase = client.post(
            f"/api/v1/materials/{material['id']}/transition",
            json={"target_status": "stop_purchase", "reason": "approved stop purchase"},
        ).json()
        self.assertEqual(stopped_purchase["status"], "stop_purchase")
        stopped_use = client.post(
            f"/api/v1/materials/{material['id']}/transition",
            json={"target_status": "stop_use", "reason": "approved stop use"},
        ).json()
        self.assertEqual(stopped_use["status"], "stop_use")
        reverse = client.put(
            f"/api/v1/materials/{material['id']}",
            json={"status": "normal", "transition_reason": "rollback"},
        )
        self.assertEqual(reverse.status_code, 400)

        deleted = client.delete(f"/api/v1/materials/{material['id']}").json()
        self.assertTrue(deleted["deleted"])

    def test_material_governance_preview_import_and_openapi(self):
        product = client.get("/api/v1/product-names").json()[0]
        library = client.get("/api/v1/material-libraries").json()[0]
        category = client.get("/api/v1/categories").json()[0]
        unique_name = f"Sprint 4 治理导入 {time.time_ns()}"
        csv_rows = (
            "name,unit,brand,description,打印速度,颜色模式\n"
            f"{unique_name},台,治理测试品牌,有效治理行,30页/分钟,彩色\n"
            ",台,治理测试品牌,缺少名称,20页/分钟,黑白\n"
        )
        preview = client.post(
            "/api/v1/materials/governance/preview",
            json={
                "product_name_id": product["id"],
                "material_library_id": library["id"],
                "category_id": category["id"],
                "rows": csv_rows,
            },
        ).json()
        self.assertEqual(preview["capability"], "material_governance")
        self.assertEqual(preview["count"], 2)
        valid_items = [item for item in preview["items"] if item["selectable"]]
        invalid_items = [item for item in preview["items"] if not item["selectable"]]
        self.assertEqual(len(valid_items), 1)
        self.assertEqual(len(invalid_items), 1)
        self.assertIn("打印速度", valid_items[0]["attributes"])

        imported = client.post(
            "/api/v1/materials/governance/import",
            json={
                "product_name_id": product["id"],
                "material_library_id": library["id"],
                "category_id": category["id"],
                "items": valid_items,
            },
        ).json()
        self.assertEqual(len(imported), 1)
        self.assertEqual(imported[0]["name"], unique_name)
        self.assertEqual(imported[0]["status"], "normal")

        openapi = client.get("/openapi.json").text
        self.assertIn("/api/v1/materials", openapi)
        self.assertIn("/api/v1/materials/governance/preview", openapi)
        self.assertIn("material_governance", openapi)


if __name__ == "__main__":
    unittest.main()

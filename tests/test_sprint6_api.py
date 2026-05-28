import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def context() -> tuple[dict, dict, dict]:
    library = client.get("/api/v1/material-libraries").json()[0]
    category = client.get("/api/v1/categories").json()[0]
    product = client.get("/api/v1/product-names").json()[0]
    return library, category, product


def image_payload(index: int) -> dict[str, str]:
    return {
        "filename": f"reference-{index}.png",
        "content_type": "image/png",
        "data_url": "data:image/png;base64,iVBORw0KGgo=",
    }


class Sprint6ApiTest(unittest.TestCase):
    def setUp(self):
        client.put("/api/v1/system/config", json={"approval_mode": "multi_node"})

    def test_new_category_multi_node_approval_creates_category(self):
        library, _, _ = context()
        unique = time.time_ns()
        created = client.post(
            "/api/v1/workflows/applications",
            json={
                "type": "new_category",
                "applicant": "material_manager",
                "material_library_id": library["id"],
                "proposed_category_name": f"测试新增类目-{unique}",
                "description": "Sprint 6 category workflow",
                "business_reason": "业务新增标准类目",
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        application = created.json()
        self.assertTrue(application["application_no"].startswith("APP-"))
        self.assertEqual(application["status"], "pending_department_head")
        self.assertEqual(application["current_node"], "department_head")
        self.assertEqual(application["approval_history"][0]["action"], "submit")

        wrong = client.post(
            f"/api/v1/workflows/applications/{application['id']}/approve",
            json={"actor": "asset_management", "node": "asset_management"},
        )
        self.assertEqual(wrong.status_code, 409)

        first = client.post(
            f"/api/v1/workflows/applications/{application['id']}/approve",
            json={"actor": "department_head", "node": "department_head", "comment": "部门通过"},
        )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["status"], "pending_asset_management")

        final = client.post(
            f"/api/v1/workflows/applications/{application['id']}/approve",
            json={"actor": "asset_management", "node": "asset_management", "comment": "资产通过"},
        )
        self.assertEqual(final.status_code, 200, final.text)
        approved = final.json()
        self.assertEqual(approved["status"], "approved")
        self.assertEqual(len(approved["approval_history"]), 3)
        categories = client.get("/api/v1/categories").json()
        self.assertTrue(any(item["name"] == f"测试新增类目-{unique}" for item in categories))

    def test_rejection_requires_reason_and_does_not_create_category(self):
        library, _, _ = context()
        unique = time.time_ns()
        created = client.post(
            "/api/v1/workflows/applications",
            json={
                "type": "new_category",
                "material_library_id": library["id"],
                "proposed_category_name": f"测试驳回类目-{unique}",
                "business_reason": "待驳回",
            },
        ).json()
        rejected_without_reason = client.post(
            f"/api/v1/workflows/applications/{created['id']}/reject",
            json={"actor": "department_head", "node": "department_head", "comment": ""},
        )
        self.assertEqual(rejected_without_reason.status_code, 422)
        rejected = client.post(
            f"/api/v1/workflows/applications/{created['id']}/reject",
            json={"actor": "department_head", "node": "department_head", "comment": "类目名称不符合标准命名规则"},
        )
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(rejected.json()["status"], "rejected")
        categories = client.get("/api/v1/categories").json()
        self.assertFalse(any(item["name"] == f"测试驳回类目-{unique}" for item in categories))

    def test_material_code_validation_approval_and_simple_mode(self):
        library, category, product = context()
        few_images = client.post(
            "/api/v1/workflows/applications",
            json={
                "type": "new_material_code",
                "material_library_id": library["id"],
                "category_id": category["id"],
                "product_name_id": product["id"],
                "material_name": f"少图物料-{time.time_ns()}",
                "unit": "台",
                "attributes": {"型号": "T1", "规格": "标准"},
                "reference_mall_link": "https://example.com/material-code-test",
                "reference_images": [image_payload(1), image_payload(2)],
                "business_reason": "校验图片数量",
            },
        )
        self.assertEqual(few_images.status_code, 422)

        client.put("/api/v1/system/config", json={"approval_mode": "simple"})
        unique_name = f"测试编码物料-{time.time_ns()}"
        created = client.post(
            "/api/v1/workflows/applications",
            json={
                "type": "new_material_code",
                "material_library_id": library["id"],
                "category_id": category["id"],
                "product_name_id": product["id"],
                "material_name": unique_name,
                "unit": "台",
                "attributes": {"型号": "T2", "规格": "标准"},
                "reference_mall_link": "https://example.com/material-code-test",
                "reference_images": [image_payload(1), image_payload(2), image_payload(3)],
                "business_reason": "新增编码",
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["status"], "pending_approval")

        approved = client.post(
            f"/api/v1/workflows/applications/{created.json()['id']}/approve",
            json={"actor": "approver", "node": "approver", "comment": "通过"},
        )
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["status"], "approved")
        materials = client.get(f"/api/v1/materials?search={unique_name}").json()
        self.assertEqual(len(materials), 1)
        self.assertTrue(materials[0]["code"].startswith("MAT-"))
        self.assertEqual(materials[0]["status"], "normal")
        self.assertEqual(materials[0]["attributes"]["_reference_mall_link"], "https://example.com/material-code-test")

    def test_openapi_documents_workflow_paths(self):
        openapi = client.get("/openapi.json").text
        self.assertIn("/api/v1/workflows/applications", openapi)
        self.assertIn("/api/v1/workflows/tasks", openapi)
        self.assertIn("/api/v1/system/config", openapi)
        self.assertIn("/approve", openapi)
        self.assertIn("/reject", openapi)


if __name__ == "__main__":
    unittest.main()

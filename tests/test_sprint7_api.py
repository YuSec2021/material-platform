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


def create_material(name: str) -> dict:
    library, category, product = context()
    response = client.post(
        "/api/v1/materials",
        json={
            "name": name,
            "product_name_id": product["id"],
            "material_library_id": library["id"],
            "category_id": category["id"],
            "unit": product["unit"],
            "description": "Sprint 7 lifecycle material",
            "attributes": {"型号": "S7", "规格": "标准"},
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def approve_to_terminal(application: dict) -> dict:
    first = client.post(
        f"/api/v1/workflows/applications/{application['id']}/approve",
        json={"actor": "department_head", "node": "department_head", "comment": "部门通过"},
    )
    assert first.status_code == 200, first.text
    second = client.post(
        f"/api/v1/workflows/applications/{application['id']}/approve",
        json={"actor": "asset_management", "node": "asset_management", "comment": "资产通过"},
    )
    assert second.status_code == 200, second.text
    return second.json()


class Sprint7ApiTest(unittest.TestCase):
    def setUp(self):
        client.put("/api/v1/system/config", json={"approval_mode": "multi_node"})

    def test_stop_purchase_workflow_approval_updates_material(self):
        material = create_material(f"测试停采物料-{time.time_ns()}")
        created = client.post(
            "/api/v1/workflows/applications",
            json={
                "type": "stop_purchase",
                "material_id": material["id"],
                "reason_code": "供应商停产",
                "reason": "供应商停产",
                "business_reason": "供应商正式通知停产",
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        application = created.json()
        self.assertEqual(application["type"], "stop_purchase")
        self.assertEqual(application["data"]["material_id"], material["id"])
        self.assertEqual(application["data"]["reason"], "供应商停产")
        self.assertEqual(application["approval_history"][0]["action"], "submit")

        approved = approve_to_terminal(application)
        self.assertEqual(approved["status"], "approved")
        updated = client.get(f"/api/v1/materials/{material['id']}").json()
        self.assertEqual(updated["status"], "stop_purchase")
        self.assertEqual(updated["lifecycle_history"][-1]["source"], "workflow")
        self.assertEqual(updated["lifecycle_history"][-1]["application_no"], application["application_no"])

    def test_stop_purchase_rejection_preserves_normal_status(self):
        material = create_material(f"测试停采驳回物料-{time.time_ns()}")
        application = client.post(
            "/api/v1/workflows/applications",
            json={
                "type": "stop_purchase",
                "material_id": material["id"],
                "reason_code": "质量风险停采",
                "reason": "质量风险停采",
                "business_reason": "待核实的质量风险",
            },
        ).json()
        missing_reason = client.post(
            f"/api/v1/workflows/applications/{application['id']}/reject",
            json={"actor": "department_head", "node": "department_head", "comment": ""},
        )
        self.assertEqual(missing_reason.status_code, 422)
        rejected = client.post(
            f"/api/v1/workflows/applications/{application['id']}/reject",
            json={"actor": "department_head", "node": "department_head", "comment": "停采依据不足"},
        )
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(rejected.json()["status"], "rejected")
        updated = client.get(f"/api/v1/materials/{material['id']}").json()
        self.assertEqual(updated["status"], "normal")

    def test_admin_manual_stop_purchase_requires_exemption_reason(self):
        material = create_material(f"测试管理员停采物料-{time.time_ns()}")
        missing_reason = client.patch(f"/api/v1/materials/{material['id']}/stop-purchase", json={"reason": ""})
        self.assertEqual(missing_reason.status_code, 422)

        stopped = client.patch(
            f"/api/v1/materials/{material['id']}/stop-purchase",
            json={"reason": "紧急质量风险停采", "actor": "super_admin"},
        )
        self.assertEqual(stopped.status_code, 200, stopped.text)
        body = stopped.json()
        self.assertEqual(body["status"], "stop_purchase")
        self.assertEqual(body["lifecycle_history"][-1]["source"], "admin_manual")

        tasks = client.get("/api/v1/workflows/tasks").json()
        self.assertFalse(any(item["data"].get("material_id") == material["id"] for item in tasks))

    def test_stop_use_precondition_and_terminal_state(self):
        normal = create_material(f"测试停用前置拦截-{time.time_ns()}")
        blocked = client.post(
            "/api/v1/workflows/applications",
            json={
                "type": "stop_use",
                "material_id": normal["id"],
                "reason_code": "长期无库存且无业务需求",
                "reason": "长期无库存且无业务需求",
                "acknowledge_terminal": True,
                "business_reason": "直接停用应被拦截",
            },
        )
        self.assertEqual(blocked.status_code, 409)
        self.assertIn("stop_purchase", blocked.text)

        eligible = create_material(f"测试停用物料-{time.time_ns()}")
        client.patch(
            f"/api/v1/materials/{eligible['id']}/stop-purchase",
            json={"reason": "前置停采", "actor": "super_admin"},
        )
        application = client.post(
            "/api/v1/workflows/applications",
            json={
                "type": "stop_use",
                "material_id": eligible["id"],
                "reason_code": "长期无库存且无业务需求",
                "reason": "长期无库存且无业务需求",
                "acknowledge_terminal": True,
                "business_reason": "长期无库存且无业务需求",
            },
        )
        self.assertEqual(application.status_code, 200, application.text)
        approved = approve_to_terminal(application.json())
        self.assertEqual(approved["status"], "approved")
        stopped = client.get(f"/api/v1/materials/{eligible['id']}").json()
        self.assertEqual(stopped["status"], "stop_use")

        revert = client.put(
            f"/api/v1/materials/{eligible['id']}",
            json={"status": "normal", "transition_reason": "rollback"},
        )
        self.assertEqual(revert.status_code, 400)

    def test_openapi_documents_stop_workflow_paths(self):
        openapi = client.get("/openapi.json").text
        self.assertIn("/api/v1/workflows/applications", openapi)
        self.assertIn("/api/v1/workflows/applications/stop-purchase", openapi)
        self.assertIn("/api/v1/workflows/applications/stop-use", openapi)
        self.assertIn("/api/v1/materials/{material_id}/stop-purchase", openapi)
        self.assertIn("/api/v1/materials/{material_id}", openapi)


if __name__ == "__main__":
    unittest.main()

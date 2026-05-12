import os
import time
import unittest
from io import BytesIO
from zipfile import ZipFile

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


class Sprint11ApiTest(unittest.TestCase):
    def test_system_config_persists_identity_reasons_and_audits_diff(self):
        unique = time.time_ns()
        before_name = f"Sprint 11 Before {unique}"
        after_name = f"Sprint 11 After {unique}"
        first = client.put(
            "/api/v1/system/config",
            json={
                "system_name": before_name,
                "icon": {"filename": "before.png", "content_type": "image/png", "data_url": "data:image/png;base64,AAA="},
                "approval_mode": "simple",
                "stop_purchase_reasons": [{"name": f"Sprint 11 Stop Purchase {unique}", "enabled": True}],
                "stop_use_reasons": [{"name": f"Sprint 11 Stop Use {unique}", "enabled": True}],
            },
        )
        self.assertEqual(first.status_code, 200, first.text)
        loaded = client.get("/api/v1/system/config")
        self.assertEqual(loaded.status_code, 200, loaded.text)
        self.assertEqual(loaded.json()["system_name"], before_name)
        self.assertEqual(loaded.json()["approval_mode"], "simple")
        self.assertEqual(loaded.json()["stop_purchase_reasons"][0]["enabled"], True)

        second = client.put("/api/v1/system/config", json={"system_name": after_name, "approval_mode": "multi_node"})
        self.assertEqual(second.status_code, 200, second.text)
        logs = client.get(f"/api/v1/audit-logs?resource=system_config&user=super_admin&page_size=100")
        self.assertEqual(logs.status_code, 200, logs.text)
        matching = [
            item
            for item in logs.json()["items"]
            if item["action"] == "update" and item["after_value"].get("system_name") == after_name
        ]
        self.assertTrue(matching)
        detail = client.get(f"/api/v1/audit-logs/{matching[0]['id']}")
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["before_value"]["system_name"], before_name)
        self.assertEqual(detail.json()["after_value"]["system_name"], after_name)

    def test_audit_filters_pagination_export_and_rbac(self):
        unique = time.time_ns()
        for index in range(12):
            response = client.put(
                "/api/v1/system/config",
                json={"system_name": f"Sprint 11 Export {unique}-{index}", "approval_mode": "simple" if index % 2 else "multi_node"},
            )
            self.assertEqual(response.status_code, 200, response.text)

        page_one = client.get(f"/api/v1/audit-logs?resource=system_config&user=super_admin&page=1&page_size=5")
        self.assertEqual(page_one.status_code, 200, page_one.text)
        self.assertGreaterEqual(page_one.json()["total"], 12)
        self.assertEqual(len(page_one.json()["items"]), 5)
        page_two = client.get(f"/api/v1/audit-logs?resource=system_config&user=super_admin&page=2&page_size=5")
        self.assertEqual(page_two.status_code, 200, page_two.text)
        self.assertNotEqual(
            {item["id"] for item in page_one.json()["items"]},
            {item["id"] for item in page_two.json()["items"]},
        )

        exported = client.get("/api/v1/audit-logs/export?resource=system_config&user=super_admin")
        self.assertEqual(exported.status_code, 200, exported.text)
        with ZipFile(BytesIO(exported.content)) as workbook:
            sheet = workbook.read("xl/worksheets/sheet1.xml").decode("utf-8")
        for header in ["timestamp", "user", "resource", "action", "source", "before value", "after value"]:
            self.assertIn(header, sheet)
        self.assertIn(f"Sprint 11 Export {unique}", sheet)

        user = client.post(
            "/api/v1/users",
            json={
                "username": f"s11_no_audit_{unique}",
                "display_name": "Sprint 11 No Audit User",
                "status": "active",
            },
        )
        self.assertEqual(user.status_code, 200, user.text)
        blocked = client.get("/api/v1/audit-logs", headers={"X-User-Id": str(user.json()["id"])})
        self.assertEqual(blocked.status_code, 403)


if __name__ == "__main__":
    unittest.main()

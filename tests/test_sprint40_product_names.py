import os
import re
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}
PM_CODE_PATTERN = re.compile(r"^PM(\d{8,})$")


class Sprint40ProductNameApiTest(unittest.TestCase):
    def unique(self, prefix: str) -> str:
        return f"{prefix}-{time.time_ns()}"

    def highest_pm_code(self) -> int:
        response = client.get("/api/v1/product-names", headers=SUPER_ADMIN)
        self.assertEqual(response.status_code, 200, response.text)
        highest = 0
        for product in response.json():
            match = PM_CODE_PATTERN.match(product["product_name_code"])
            if match:
                highest = max(highest, int(match.group(1)))
        return highest

    def create_product(self, name: str | None = None) -> dict:
        response = client.post(
            "/api/v1/product-names",
            headers=SUPER_ADMIN,
            json={
                "name": name or self.unique("sprint40-product"),
                "unit": "件",
                "category": "办公设备 / 打印机",
                "product_name_code": "PM99999999",
                "code": "PM99999999",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_pm_codes_are_generated_sequentially_and_ignore_spoofed_values(self):
        max_before = self.highest_pm_code()
        first = self.create_product(self.unique("sprint40-api-a"))
        self.assertEqual(first["product_name_code"], f"PM{max_before + 1:08d}")
        self.assertEqual(first["status"], "active")
        self.assertNotEqual(first["product_name_code"], "PM99999999")

        second = self.create_product(self.unique("sprint40-api-b"))
        self.assertEqual(second["product_name_code"], f"PM{max_before + 2:08d}")

    def test_pm_code_is_immutable_on_update(self):
        product = self.create_product(self.unique("sprint40-immutable"))
        response = client.put(
            f"/api/v1/product-names/{product['id']}",
            headers=SUPER_ADMIN,
            json={
                "name": product["name"],
                "unit": "箱",
                "category": product["category"],
                "product_name_code": "PM99999999",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["product_name_code"], product["product_name_code"])
        self.assertEqual(response.json()["unit"], "箱")

        detail = client.get(f"/api/v1/product-names/{product['id']}", headers=SUPER_ADMIN)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["product_name_code"], product["product_name_code"])

    def test_status_toggle_soft_delete_and_audit_log(self):
        product = self.create_product(self.unique("sprint40-status"))

        inactive = client.patch(
            f"/api/v1/product-names/{product['id']}/status",
            headers=SUPER_ADMIN,
            json={"status": "inactive"},
        )
        self.assertEqual(inactive.status_code, 200, inactive.text)
        self.assertEqual(inactive.json()["status"], "inactive")

        active = client.patch(
            f"/api/v1/product-names/{product['id']}/status",
            headers=SUPER_ADMIN,
            json={"status": "active"},
        )
        self.assertEqual(active.status_code, 200, active.text)
        self.assertEqual(active.json()["status"], "active")

        deleted = client.delete(f"/api/v1/product-names/{product['id']}", headers=SUPER_ADMIN)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertTrue(deleted.json()["soft_deleted"])

        detail = client.get(f"/api/v1/product-names/{product['id']}", headers=SUPER_ADMIN)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["product_name_code"], product["product_name_code"])
        self.assertEqual(detail.json()["status"], "inactive")

        inactive_list = client.get("/api/v1/product-names?status=inactive", headers=SUPER_ADMIN)
        self.assertEqual(inactive_list.status_code, 200, inactive_list.text)
        self.assertTrue(any(item["id"] == product["id"] for item in inactive_list.json()))

        after_delete = self.create_product(self.unique("sprint40-after-delete"))
        deleted_suffix = int(PM_CODE_PATTERN.match(product["product_name_code"]).group(1))
        after_suffix = int(PM_CODE_PATTERN.match(after_delete["product_name_code"]).group(1))
        self.assertGreater(after_suffix, deleted_suffix)

        logs = client.get("/api/v1/audit-logs?resource=product_name&page=1&page_size=50", headers=SUPER_ADMIN)
        self.assertEqual(logs.status_code, 200, logs.text)
        self.assertTrue(
            any(
                item["after_value"].get("id") == product["id"]
                and item["after_value"].get("status") == "inactive"
                for item in logs.json()["items"]
            )
        )


if __name__ == "__main__":
    unittest.main()

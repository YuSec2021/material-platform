import os
import re
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}
ROLE_CODE_PATTERN = re.compile(r"^ROLE_(\d{3,})$")


class Sprint39ApiTest(unittest.TestCase):
    def unique(self, prefix: str) -> str:
        return f"{prefix}-{time.time_ns()}"

    def highest_role_code(self) -> int:
        response = client.get("/api/v1/roles", headers=SUPER_ADMIN)
        self.assertEqual(response.status_code, 200, response.text)
        highest = 0
        for role in response.json():
            match = ROLE_CODE_PATTERN.match(role["code"])
            if match:
                highest = max(highest, int(match.group(1)))
        return highest

    def create_role(self, name: str | None = None) -> dict:
        response = client.post(
            "/api/v1/roles",
            headers=SUPER_ADMIN,
            json={
                "name": name or self.unique("sprint39-role"),
                "code": "MANUAL_999",
                "role_code": "MANUAL_999",
                "description": "Sprint 39 role",
                "enabled": True,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_category_library(self, name: str | None = None) -> dict:
        response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={"name": name or self.unique("sprint39-category-library"), "description": "Sprint 39 category library"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_role_codes_are_generated_sequential_read_only_and_not_reused(self):
        max_before = self.highest_role_code()
        first = self.create_role(self.unique("sprint39-role-a"))
        self.assertEqual(first["code"], f"ROLE_{max_before + 1:03d}")
        self.assertNotEqual(first["code"], "MANUAL_999")

        second = self.create_role(self.unique("sprint39-role-b"))
        self.assertEqual(second["code"], f"ROLE_{max_before + 2:03d}")

        update = client.put(
            f"/api/v1/roles/{first['id']}",
            headers=SUPER_ADMIN,
            json={"name": self.unique("sprint39-role-a-renamed"), "code": "ROLE_999", "description": "changed"},
        )
        self.assertEqual(update.status_code, 200, update.text)
        self.assertEqual(update.json()["code"], first["code"])

        delete_probe = self.create_role(self.unique("sprint39-role-delete-probe"))
        self.assertEqual(delete_probe["code"], f"ROLE_{max_before + 3:03d}")
        deleted = client.delete(f"/api/v1/roles/{delete_probe['id']}", headers=SUPER_ADMIN)
        self.assertEqual(deleted.status_code, 200, deleted.text)

        after_delete = self.create_role(self.unique("sprint39-role-after-delete"))
        self.assertEqual(after_delete["code"], f"ROLE_{max_before + 4:03d}")

        roles = client.get("/api/v1/roles", headers=SUPER_ADMIN).json()
        generated_codes = [role["code"] for role in roles if ROLE_CODE_PATTERN.match(role["code"])]
        self.assertEqual(len(generated_codes), len(set(generated_codes)))

    def test_material_library_associations_validate_persist_clear_and_audit(self):
        role_a = self.create_role(self.unique("sprint39-lib-admin-a"))
        role_b = self.create_role(self.unique("sprint39-lib-admin-b"))
        category_a = self.create_category_library(self.unique("sprint39-category-lib-a"))
        category_b = self.create_category_library(self.unique("sprint39-category-lib-b"))

        created = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("sprint39-material-library"),
                "description": "association create",
                "enabled": True,
                "material_library_admin_id": role_a["id"],
                "category_library_id": category_a["id"],
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        library = created.json()
        self.assertEqual(library["material_library_admin_id"], role_a["id"])
        self.assertEqual(library["material_library_admin_name"], role_a["name"])
        self.assertEqual(library["material_library_admin_code"], role_a["code"])
        self.assertEqual(library["category_library_id"], category_a["id"])
        self.assertEqual(library["category_library_name"], category_a["name"])
        self.assertEqual(library["category_library_code"], category_a["code"])

        listed = client.get("/api/v1/material-libraries", headers=SUPER_ADMIN).json()
        listed_library = next(item for item in listed if item["id"] == library["id"])
        self.assertEqual(listed_library["material_library_admin_code"], role_a["code"])
        detail = client.get(f"/api/v1/material-libraries/{library['id']}", headers=SUPER_ADMIN)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["category_library_code"], category_a["code"])

        invalid_admin_shape = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("sprint39-invalid-admin-shape"),
                "material_library_admin_id": [1, 2],
                "category_library_id": category_a["id"],
            },
        )
        self.assertEqual(invalid_admin_shape.status_code, 422)

        invalid_category_shape = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("sprint39-invalid-category-shape"),
                "material_library_admin_id": role_a["id"],
                "category_library_id": [1, 2],
            },
        )
        self.assertEqual(invalid_category_shape.status_code, 422)

        invalid_admin = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("sprint39-invalid-admin"),
                "material_library_admin_id": 999999999,
                "category_library_id": category_a["id"],
            },
        )
        self.assertEqual(invalid_admin.status_code, 404)

        updated = client.put(
            f"/api/v1/material-libraries/{library['id']}",
            headers=SUPER_ADMIN,
            json={
                "description": "association update",
                "material_library_admin_id": role_b["id"],
                "category_library_id": category_b["id"],
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["material_library_admin_id"], role_b["id"])
        self.assertEqual(updated.json()["material_library_admin_code"], role_b["code"])
        self.assertEqual(updated.json()["category_library_id"], category_b["id"])
        self.assertEqual(updated.json()["category_library_code"], category_b["code"])

        logs = client.get("/api/v1/audit-logs?resource=material_library&page=1&page_size=50", headers=SUPER_ADMIN)
        self.assertEqual(logs.status_code, 200, logs.text)
        matching_logs = [
            item
            for item in logs.json()["items"]
            if item["after_value"].get("id") == library["id"]
            and item["after_value"].get("material_library_admin_id") == role_b["id"]
            and item["after_value"].get("category_library_id") == category_b["id"]
        ]
        self.assertTrue(matching_logs)
        self.assertEqual(matching_logs[0]["before_value"]["material_library_admin_id"], role_a["id"])
        self.assertEqual(matching_logs[0]["before_value"]["category_library_id"], category_a["id"])

        cleared = client.put(
            f"/api/v1/material-libraries/{library['id']}",
            headers=SUPER_ADMIN,
            json={"material_library_admin_id": None, "category_library_id": None},
        )
        self.assertEqual(cleared.status_code, 200, cleared.text)
        cleared_body = cleared.json()
        self.assertIsNone(cleared_body["material_library_admin_id"])
        self.assertIsNone(cleared_body["material_library_admin_name"])
        self.assertIsNone(cleared_body["material_library_admin_code"])
        self.assertIsNone(cleared_body["category_library_id"])
        self.assertIsNone(cleared_body["category_library_name"])
        self.assertIsNone(cleared_body["category_library_code"])

    def test_role_creation_audit_includes_generated_code(self):
        role = self.create_role(self.unique("sprint39-audit-role"))
        logs = client.get("/api/v1/audit-logs?resource=role&page=1&page_size=50", headers=SUPER_ADMIN)
        self.assertEqual(logs.status_code, 200, logs.text)
        self.assertTrue(
            any(
                item["after_value"].get("id") == role["id"]
                and item["after_value"].get("code") == role["code"]
                for item in logs.json()["items"]
            )
        )


if __name__ == "__main__":
    unittest.main()

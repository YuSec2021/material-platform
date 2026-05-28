import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class Sprint43MaterialLibraryMultiSelectTest(unittest.TestCase):
    def unique(self, prefix: str) -> str:
        return f"{prefix}-{time.time_ns()}"

    def create_role(self, name: str) -> dict:
        response = client.post(
            "/api/v1/roles",
            headers=SUPER_ADMIN,
            json={"name": name, "description": "Sprint 43 role", "enabled": True},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_user(self, username: str) -> dict:
        response = client.post(
            "/api/v1/users",
            headers=SUPER_ADMIN,
            json={
                "username": username,
                "display_name": username,
                "unit": "Sprint 43",
                "department": "QA",
                "team": "Multi Select",
                "email": f"{username}@example.test",
                "status": "active",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def bind_user(self, role_id: int, user_id: int) -> None:
        response = client.post(f"/api/v1/roles/{role_id}/users", headers=SUPER_ADMIN, json={"user_id": user_id})
        self.assertEqual(response.status_code, 200, response.text)

    def create_category_library(self, name: str, qdrant_enabled: bool = False) -> dict:
        response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={"name": name, "description": "Sprint 43 category library", "qdrant_enabled": qdrant_enabled},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_array_associations_permission_scope_audit_and_qdrant_flag(self):
        token = str(time.time_ns())
        role_a = self.create_role(f"sprint43-role-a-{token}")
        role_b = self.create_role(f"sprint43-role-b-{token}")
        role_shared = self.create_role(f"sprint43-role-shared-{token}")
        user_a = self.create_user(f"sprint43-user-a-{token}")
        self.bind_user(role_a["id"], user_a["id"])

        category_a = self.create_category_library(f"sprint43-category-a-{token}", qdrant_enabled=True)
        category_b = self.create_category_library(f"sprint43-category-b-{token}")
        category_c = self.create_category_library(f"sprint43-category-c-{token}")
        self.assertTrue(category_a["qdrant_enabled"])

        empty_arrays = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("sprint43-empty-arrays"),
                "material_library_admin_ids": [],
                "category_library_ids": [],
            },
        )
        self.assertEqual(empty_arrays.status_code, 422)

        created = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("sprint43-library-a"),
                "description": "Sprint 43 multi-select create",
                "enabled": True,
                "material_library_admin_ids": [role_a["id"], role_shared["id"]],
                "category_library_ids": [category_a["id"], category_b["id"]],
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        library = created.json()
        self.assertEqual(library["material_library_admin_ids"], [role_a["id"], role_shared["id"]])
        self.assertEqual(library["category_library_ids"], [category_a["id"], category_b["id"]])
        self.assertIn(role_a["name"], library["material_library_admin_names"])
        self.assertIn(category_a["name"], library["category_library_names"])

        denied = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("sprint43-library-b"),
                "description": "Sprint 43 denied library",
                "enabled": True,
                "material_library_admin_ids": [role_b["id"]],
                "category_library_ids": [category_b["id"]],
            },
        )
        self.assertEqual(denied.status_code, 200, denied.text)

        scoped_headers = {"X-Username": user_a["username"]}
        login = client.post("/api/v1/auth/login", headers=scoped_headers, json={"username": user_a["username"]})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()["material_library_scope_ids"], [library["id"]])

        scoped_libraries = client.get("/api/v1/material-libraries", headers=scoped_headers)
        self.assertEqual(scoped_libraries.status_code, 200, scoped_libraries.text)
        scoped_ids = {item["id"] for item in scoped_libraries.json()}
        self.assertIn(library["id"], scoped_ids)
        self.assertNotIn(denied.json()["id"], scoped_ids)

        updated = client.put(
            f"/api/v1/material-libraries/{library['id']}",
            headers=SUPER_ADMIN,
            json={
                "material_library_admin_ids": [role_a["id"], role_b["id"]],
                "category_library_ids": [category_b["id"], category_c["id"]],
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["material_library_admin_ids"], [role_a["id"], role_b["id"]])
        self.assertEqual(updated.json()["category_library_ids"], [category_b["id"], category_c["id"]])

        logs = client.get("/api/v1/audit-logs?resource=material_library&page=1&page_size=50", headers=SUPER_ADMIN)
        self.assertEqual(logs.status_code, 200, logs.text)
        matching_logs = [
            item
            for item in logs.json()["items"]
            if item["after_value"].get("id") == library["id"]
            and item["after_value"].get("material_library_admin_ids") == [role_a["id"], role_b["id"]]
            and item["after_value"].get("category_library_ids") == [category_b["id"], category_c["id"]]
        ]
        self.assertTrue(matching_logs)
        self.assertEqual(matching_logs[0]["before_value"]["material_library_admin_ids"], [role_a["id"], role_shared["id"]])
        self.assertEqual(matching_logs[0]["before_value"]["category_library_ids"], [category_a["id"], category_b["id"]])

        qdrant_off = client.put(
            f"/api/v1/category-libraries/{category_a['id']}",
            headers=SUPER_ADMIN,
            json={"qdrant_enabled": False},
        )
        self.assertEqual(qdrant_off.status_code, 200, qdrant_off.text)
        self.assertFalse(qdrant_off.json()["qdrant_enabled"])


if __name__ == "__main__":
    unittest.main()

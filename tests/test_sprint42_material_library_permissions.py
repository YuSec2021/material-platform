import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class Sprint42MaterialLibraryPermissionTest(unittest.TestCase):
    def unique(self, prefix: str) -> str:
        return f"{prefix}-{time.time_ns()}"

    def create_role(self, name: str) -> dict:
        response = client.post(
            "/api/v1/roles",
            headers=SUPER_ADMIN,
            json={"name": name, "description": "Sprint 42 scope role", "enabled": True},
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
                "unit": "Sprint 42",
                "department": "QA",
                "team": "Isolation",
                "email": f"{username}@example.test",
                "status": "active",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def bind_user(self, role_id: int, user_id: int) -> None:
        response = client.post(
            f"/api/v1/roles/{role_id}/users",
            headers=SUPER_ADMIN,
            json={"user_id": user_id},
        )
        self.assertEqual(response.status_code, 200, response.text)

    def create_library(self, name: str, role_id: int) -> dict:
        response = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": name,
                "description": "Sprint 42 scoped library",
                "enabled": True,
                "material_library_admin_id": role_id,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def material_payload(self, library_id: int, name: str) -> dict:
        product = client.get("/api/v1/product-names", headers=SUPER_ADMIN).json()[0]
        category = client.get("/api/v1/categories", headers=SUPER_ADMIN).json()[0]
        return {
            "name": name,
            "product_name_id": product["id"],
            "material_library_id": library_id,
            "category_id": category["id"],
            "unit": product["unit"],
            "description": "Sprint 42 scoped material",
            "attributes": {"color": "red"},
        }

    def create_material(self, library_id: int, name: str) -> dict:
        response = client.post("/api/v1/materials", headers=SUPER_ADMIN, json=self.material_payload(library_id, name))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_non_super_user_scope_is_derived_from_material_library_admin_role(self):
        token = str(time.time_ns())
        allowed_role = self.create_role(f"sprint42-role-allowed-{token}")
        denied_role = self.create_role(f"sprint42-role-denied-{token}")
        scoped_user = self.create_user(f"sprint42-user-{token}")
        self.bind_user(allowed_role["id"], scoped_user["id"])

        allowed_library = self.create_library(f"sprint42-allowed-lib-{token}", allowed_role["id"])
        denied_library = self.create_library(f"sprint42-denied-lib-{token}", denied_role["id"])
        allowed_material = self.create_material(allowed_library["id"], f"sprint42-allowed-material-{token}")
        denied_material = self.create_material(denied_library["id"], f"sprint42-denied-material-{token}")

        super_libraries = client.get("/api/v1/material-libraries", headers=SUPER_ADMIN)
        self.assertEqual(super_libraries.status_code, 200, super_libraries.text)
        super_ids = {item["id"] for item in super_libraries.json()}
        self.assertIn(allowed_library["id"], super_ids)
        self.assertIn(denied_library["id"], super_ids)

        scoped_headers = {"X-Username": scoped_user["username"]}
        login = client.post("/api/v1/auth/login", json={"username": scoped_user["username"]}, headers=scoped_headers)
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()["material_library_scope_ids"], [allowed_library["id"]])

        scoped_libraries = client.get("/api/v1/material-libraries", headers=scoped_headers)
        self.assertEqual(scoped_libraries.status_code, 200, scoped_libraries.text)
        scoped_ids = {item["id"] for item in scoped_libraries.json()}
        self.assertEqual(scoped_ids & {allowed_library["id"], denied_library["id"]}, {allowed_library["id"]})
        self.assertEqual(scoped_libraries.json()[0]["access_role"], "admin")

        scoped_materials = client.get("/api/v1/materials", headers=scoped_headers, params={"search": token})
        self.assertEqual(scoped_materials.status_code, 200, scoped_materials.text)
        scoped_material_ids = {item["id"] for item in scoped_materials.json()}
        self.assertIn(allowed_material["id"], scoped_material_ids)
        self.assertNotIn(denied_material["id"], scoped_material_ids)

        denied_detail = client.get(f"/api/v1/materials/{denied_material['id']}", headers=scoped_headers)
        self.assertEqual(denied_detail.status_code, 403)
        denied_create = client.post(
            "/api/v1/materials",
            headers=scoped_headers,
            json=self.material_payload(denied_library["id"], f"sprint42-forbidden-material-{token}"),
        )
        self.assertEqual(denied_create.status_code, 403)
        denied_update = client.put(
            f"/api/v1/material-libraries/{denied_library['id']}",
            headers=scoped_headers,
            json={"description": "forbidden"},
        )
        self.assertEqual(denied_update.status_code, 403)

        no_scope_libraries = client.get("/api/v1/material-libraries", headers={"X-Username": "regular_user"})
        self.assertEqual(no_scope_libraries.status_code, 200, no_scope_libraries.text)
        self.assertEqual(no_scope_libraries.json(), [])


if __name__ == "__main__":
    unittest.main()

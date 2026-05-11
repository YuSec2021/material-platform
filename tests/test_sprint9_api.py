import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


class Sprint9PermissionApiTest(unittest.TestCase):
    def unique(self, prefix: str) -> str:
        return f"{prefix}_{time.time_ns()}"

    def create_user_role(self) -> tuple[dict, dict]:
        suffix = time.time_ns()
        user = client.post(
            "/api/v1/users",
            json={
                "username": f"s9_user_{suffix}",
                "display_name": "Sprint 9 Scoped User",
                "email": f"s9_user_{suffix}@example.com",
                "status": "active",
            },
        ).json()
        role = client.post(
            "/api/v1/roles",
            json={
                "name": f"Sprint 9 Role {suffix}",
                "code": f"S9_ROLE_{suffix}",
                "description": "Sprint 9 RBAC verification",
                "enabled": True,
            },
        ).json()
        bind = client.post(f"/api/v1/roles/{role['id']}/users", json={"user_id": user["id"]})
        self.assertEqual(bind.status_code, 200, bind.text)
        return user, role

    def set_permissions(self, role_id: int, keys: list[str]) -> None:
        response = client.put(f"/api/v1/roles/{role_id}/permissions", json={"permission_keys": keys})
        self.assertEqual(response.status_code, 200, response.text)

    def auth_headers(self, user: dict) -> dict[str, str]:
        return {"X-User-Id": str(user["id"])}

    def test_api_permissions_are_enforced_and_change_immediately(self):
        user, role = self.create_user_role()
        headers = self.auth_headers(user)

        self.assertEqual(client.get("/api/v1/users", headers=headers).status_code, 403)
        self.assertEqual(client.get("/api/v1/material-libraries", headers=headers).status_code, 403)
        self.assertEqual(client.get("/api/v1/materials", headers=headers).status_code, 403)
        self.assertEqual(client.get("/api/v1/attributes", headers=headers).status_code, 403)
        self.assertEqual(client.get("/api/v1/permissions/catalog", headers=headers).status_code, 403)

        self.set_permissions(role["id"], ["api.GET./api/v1/materials"])
        self.assertEqual(client.get("/api/v1/materials", headers=headers).status_code, 200)
        self.assertEqual(client.get("/api/v1/users", headers=headers).status_code, 403)

        client.patch(f"/api/v1/roles/{role['id']}/disable")
        self.assertEqual(client.get("/api/v1/materials", headers=headers).status_code, 403)

    def test_button_permission_and_library_scope_gate_material_writes(self):
        first = client.get("/api/v1/material-libraries").json()[0]
        second_name = self.unique("Sprint 9 Scope B")
        second = client.post("/api/v1/material-libraries", json={"name": second_name, "description": "scope B"}).json()
        product = client.get("/api/v1/product-names").json()[0]
        category = client.get("/api/v1/categories").json()[0]
        user, role = self.create_user_role()
        headers = self.auth_headers(user)

        base_permissions = [
            "api.GET./api/v1/material-libraries",
            "api.GET./api/v1/materials",
            "api.POST./api/v1/materials",
            "button.material_archives.create",
            f"scope.material_library.{first['id']}",
        ]
        self.set_permissions(role["id"], base_permissions)

        libraries = client.get("/api/v1/material-libraries", headers=headers)
        self.assertEqual(libraries.status_code, 200, libraries.text)
        self.assertEqual([item["id"] for item in libraries.json()], [first["id"]])

        in_scope = client.post(
            "/api/v1/materials",
            headers=headers,
            json={
                "name": self.unique("Sprint 9 In Scope Material"),
                "product_name_id": product["id"],
                "material_library_id": first["id"],
                "category_id": category["id"],
                "unit": product["unit"],
            },
        )
        self.assertEqual(in_scope.status_code, 200, in_scope.text)

        out_of_scope = client.post(
            "/api/v1/materials",
            headers=headers,
            json={
                "name": self.unique("Sprint 9 Out Scope Material"),
                "product_name_id": product["id"],
                "material_library_id": second["id"],
                "category_id": category["id"],
                "unit": product["unit"],
            },
        )
        self.assertEqual(out_of_scope.status_code, 403)

        self.set_permissions(role["id"], [*base_permissions, f"scope.material_library.{second['id']}"])
        retry = client.post(
            "/api/v1/materials",
            headers=headers,
            json={
                "name": self.unique("Sprint 9 Now In Scope Material"),
                "product_name_id": product["id"],
                "material_library_id": second["id"],
                "category_id": category["id"],
                "unit": product["unit"],
            },
        )
        self.assertEqual(retry.status_code, 200, retry.text)

    def test_material_library_create_requires_action_and_api_permissions(self):
        user, role = self.create_user_role()
        headers = self.auth_headers(user)
        read_and_api_create = [
            "directory.material_library",
            "api.GET./api/v1/material-libraries",
            "api.POST./api/v1/material-libraries",
        ]
        self.set_permissions(role["id"], read_and_api_create)
        blocked = client.post(
            "/api/v1/material-libraries",
            headers=headers,
            json={"name": self.unique("Sprint 9 Button Blocked")},
        )
        self.assertEqual(blocked.status_code, 403)

        self.set_permissions(role["id"], [*read_and_api_create, "button.material_library.create"])
        created = client.post(
            "/api/v1/material-libraries",
            headers=headers,
            json={"name": self.unique("Sprint 9 Button Allowed")},
        )
        self.assertEqual(created.status_code, 200, created.text)


if __name__ == "__main__":
    unittest.main()

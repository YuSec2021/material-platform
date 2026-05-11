import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


class Sprint8ApiTest(unittest.TestCase):
    def unique(self, prefix: str) -> str:
        return f"{prefix}_{time.time_ns()}"

    def create_local_user(self) -> dict:
        username = self.unique("s8_local_user")
        response = client.post(
            "/api/v1/users",
            json={
                "username": username,
                "display_name": "Sprint 8 Local User",
                "unit": "测试单位A",
                "department": "测试部门A",
                "team": "测试班组A",
                "email": f"{username}@example.com",
                "status": "active",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_role(self) -> dict:
        suffix = time.time_ns()
        response = client.post(
            "/api/v1/roles",
            json={
                "name": f"Sprint 8 Role {suffix}",
                "code": f"S8_ROLE_{suffix}",
                "description": "Sprint 8 role management verification",
                "enabled": True,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_hcm_users_are_listed_and_read_only(self):
        users = client.get("/api/v1/users").json()
        hcm_user = next(user for user in users if user["account_ownership"] == "HCM")
        self.assertTrue(hcm_user["hcm_id"])
        self.assertTrue(hcm_user["unit"])
        self.assertTrue(hcm_user["department"])
        self.assertTrue(hcm_user["team"])

        by_unit = client.get("/api/v1/users", params={"unit": hcm_user["unit"]}).json()
        self.assertTrue(by_unit)
        self.assertTrue(all(user["unit"] == hcm_user["unit"] for user in by_unit))

        by_department = client.get("/api/v1/users", params={"department": hcm_user["department"]}).json()
        self.assertTrue(by_department)
        self.assertTrue(all(user["department"] == hcm_user["department"] for user in by_department))

        edit = client.put(f"/api/v1/users/{hcm_user['id']}", json={"display_name": "mutated"})
        self.assertEqual(edit.status_code, 409)
        self.assertIn("HCM-managed", edit.text)
        reset = client.post(f"/api/v1/users/{hcm_user['id']}/password-reset")
        self.assertEqual(reset.status_code, 409)
        delete = client.delete(f"/api/v1/users/{hcm_user['id']}")
        self.assertEqual(delete.status_code, 409)

    def test_local_user_create_edit_reset_delete(self):
        user = self.create_local_user()
        self.assertEqual(user["account_ownership"], "local")

        updated = client.put(
            f"/api/v1/users/{user['id']}",
            json={"display_name": "Sprint 8 Local User Edited", "department": "测试部门B", "team": "测试班组B"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["department"], "测试部门B")

        reset = client.post(f"/api/v1/users/{user['id']}/password-reset")
        self.assertEqual(reset.status_code, 200, reset.text)
        self.assertIn("temporary_password", reset.json())
        self.assertIn("reset_token", reset.json())

        deleted = client.delete(f"/api/v1/users/{user['id']}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        search = client.get("/api/v1/users", params={"search": user["username"]}).json()
        self.assertFalse(any(item["id"] == user["id"] for item in search))

    def test_role_crud_uniqueness_enable_disable_and_binding(self):
        user = self.create_local_user()
        role = self.create_role()

        duplicate = client.post(
            "/api/v1/roles",
            json={"name": role["name"], "code": role["code"], "description": "duplicate", "enabled": True},
        )
        self.assertEqual(duplicate.status_code, 409)

        updated = client.put(f"/api/v1/roles/{role['id']}", json={"description": "Sprint 8 edited role"})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["description"], "Sprint 8 edited role")

        disabled = client.patch(f"/api/v1/roles/{role['id']}/disable")
        self.assertEqual(disabled.status_code, 200, disabled.text)
        self.assertFalse(disabled.json()["enabled"])
        blocked = client.post(f"/api/v1/roles/{role['id']}/users", json={"user_id": user["id"]})
        self.assertEqual(blocked.status_code, 409)

        enabled = client.patch(f"/api/v1/roles/{role['id']}/enable")
        self.assertTrue(enabled.json()["enabled"])
        bound = client.post(f"/api/v1/roles/{role['id']}/users", json={"user_id": user["id"]})
        self.assertEqual(bound.status_code, 200, bound.text)
        self.assertEqual(bound.json()["user_count"], 1)

        user_detail = client.get(f"/api/v1/users/{user['id']}").json()
        self.assertTrue(any(item["id"] == role["id"] for item in user_detail["roles"]))

        removed = client.delete(f"/api/v1/roles/{role['id']}/users/{user['id']}")
        self.assertEqual(removed.status_code, 200, removed.text)
        self.assertEqual(removed.json()["user_count"], 0)

        missing = client.post(f"/api/v1/roles/{role['id']}/users", json={"user_id": 99999999})
        self.assertEqual(missing.status_code, 404)

    def test_role_permissions_persist_and_validate_catalog(self):
        role = self.create_role()
        permission_keys = [
            "directory.material_archives",
            "button.material_archives.create",
            "api.GET./api/v1/materials",
        ]
        saved = client.put(f"/api/v1/roles/{role['id']}/permissions", json={"permission_keys": permission_keys})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual({item["permission_key"] for item in saved.json()["permissions"]}, set(permission_keys))

        reloaded = client.get(f"/api/v1/roles/{role['id']}/permissions")
        self.assertEqual(reloaded.status_code, 200, reloaded.text)
        self.assertEqual({item["permission_key"] for item in reloaded.json()["permissions"]}, set(permission_keys))

        reduced = client.put(
            f"/api/v1/roles/{role['id']}/permissions",
            json={"permission_keys": permission_keys[1:]},
        )
        self.assertEqual(reduced.status_code, 200, reduced.text)
        self.assertNotIn("directory.material_archives", {item["permission_key"] for item in reduced.json()["permissions"]})

        invalid = client.put(f"/api/v1/roles/{role['id']}/permissions", json={"permission_keys": ["unknown.permission"]})
        self.assertEqual(invalid.status_code, 422)

    def test_openapi_documents_user_role_permission_paths(self):
        openapi = client.get("/openapi.json").text
        for path in [
            "/api/v1/users",
            "/api/v1/users/{user_id}/password-reset",
            "/api/v1/roles",
            "/api/v1/roles/{role_id}/users",
            "/api/v1/roles/{role_id}/permissions",
            "/api/v1/permissions/catalog",
        ]:
            self.assertIn(path, openapi)


if __name__ == "__main__":
    unittest.main()

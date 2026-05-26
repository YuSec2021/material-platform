import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class Sprint35CategoryCrudApiTest(unittest.TestCase):
    def unique_token(self) -> str:
        return str(time.time_ns())

    def create_category_library(self, token: str) -> dict:
        response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": f"Sprint 35 Category Library {token}",
                "code": f"S35CL{token[-8:]}",
                "description": "Sprint 35 category library CRUD",
            },
        )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def test_category_library_crud_and_permission_catalog(self):
        token = self.unique_token()
        created = self.create_category_library(token)
        library_id = created["id"]

        listed = client.get("/api/v1/category-libraries", headers=SUPER_ADMIN)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertTrue(any(item["id"] == library_id for item in listed.json()))

        updated = client.put(
            f"/api/v1/category-libraries/{library_id}",
            headers=SUPER_ADMIN,
            json={"name": f"Sprint 35 Category Library Updated {token}"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["name"], f"Sprint 35 Category Library Updated {token}")

        detail = client.get(f"/api/v1/category-libraries/{library_id}", headers=SUPER_ADMIN)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["name"], f"Sprint 35 Category Library Updated {token}")

        catalog = client.get("/api/v1/permissions/catalog", headers=SUPER_ADMIN)
        self.assertEqual(catalog.status_code, 200, catalog.text)
        permission_keys = {entry["permission_key"] for entry in catalog.json()}
        for key in [
            "api.GET./api/v1/category-libraries",
            "api.POST./api/v1/category-libraries",
            "api.PUT./api/v1/category-libraries/{library_id}",
            "api.DELETE./api/v1/category-libraries/{library_id}",
        ]:
            self.assertIn(key, permission_keys)

        deleted = client.delete(f"/api/v1/category-libraries/{library_id}", headers=SUPER_ADMIN)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        relisted = client.get("/api/v1/category-libraries", headers=SUPER_ADMIN)
        self.assertFalse(any(item["id"] == library_id for item in relisted.json()))

    def test_category_create_update_delete_preserves_list_reads(self):
        token = self.unique_token()
        library = self.create_category_library(token)

        created = client.post(
            "/api/v1/categories",
            headers=SUPER_ADMIN,
            json={
                "name": f"Sprint 35 Category {token}",
                "code": f"S35CAT{token[-8:]}",
                "category_library_id": library["id"],
                "description": "Sprint 35 category CRUD",
            },
        )
        self.assertIn(created.status_code, {200, 201}, created.text)
        category = created.json()
        self.assertEqual(category["category_library_id"], library["id"])

        listed = client.get("/api/v1/categories", headers=SUPER_ADMIN)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertTrue(any(item["id"] == category["id"] and item["category_library_id"] == library["id"] for item in listed.json()))

        updated = client.put(
            f"/api/v1/categories/{category['id']}",
            headers=SUPER_ADMIN,
            json={"name": f"Sprint 35 Category Updated {token}"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["name"], f"Sprint 35 Category Updated {token}")

        relisted = client.get("/api/v1/categories", headers=SUPER_ADMIN)
        self.assertTrue(any(item["id"] == category["id"] and item["name"] == f"Sprint 35 Category Updated {token}" for item in relisted.json()))

        deleted = client.delete(f"/api/v1/categories/{category['id']}", headers=SUPER_ADMIN)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        final_categories = client.get("/api/v1/categories", headers=SUPER_ADMIN)
        self.assertFalse(any(item["id"] == category["id"] for item in final_categories.json()))

        deleted_library = client.delete(f"/api/v1/category-libraries/{library['id']}", headers=SUPER_ADMIN)
        self.assertEqual(deleted_library.status_code, 200, deleted_library.text)


if __name__ == "__main__":
    unittest.main()

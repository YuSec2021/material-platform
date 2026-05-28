import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class Sprint49CategoryFilterApiTest(unittest.TestCase):
    def unique_token(self) -> str:
        return str(time.time_ns())[-10:]

    def create_library(self, token: str, suffix: str = "") -> dict:
        response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": f"Sprint 49 Library {token}{suffix}",
                "code": f"S49L{token[-8:]}{suffix}",
                "description": "Sprint 49 category filter verification",
            },
        )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def create_category(self, token: str, library_id: int, name: str, parent_id: int | None = None) -> dict:
        response = client.post(
            "/api/v1/categories",
            headers=SUPER_ADMIN,
            json={
                "name": f"{name} {token}",
                "code": f"S49{token[-6:]}{time.time_ns() % 100000:05d}",
                "category_library_id": library_id,
                "parent_category_id": parent_id,
                "description": "Sprint 49 category filter verification",
            },
        )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def delete_category(self, category_id: int) -> None:
        response = client.delete(f"/api/v1/categories/{category_id}", headers=SUPER_ADMIN)
        self.assertEqual(response.status_code, 200, response.text)

    def delete_library(self, library_id: int) -> None:
        response = client.delete(f"/api/v1/category-libraries/{library_id}", headers=SUPER_ADMIN)
        self.assertEqual(response.status_code, 200, response.text)

    def test_parent_id_returns_only_immediate_children(self):
        token = self.unique_token()
        library = self.create_library(token)
        level1 = self.create_category(token, library["id"], "Level01")
        level2 = self.create_category(token, library["id"], "Level02", level1["id"])
        sibling_level2 = self.create_category(token, library["id"], "Sibling02", level1["id"])
        level3 = self.create_category(token, library["id"], "Level03", level2["id"])

        level2_children = client.get(f"/api/v1/categories?parent_id={level2['id']}", headers=SUPER_ADMIN)
        self.assertEqual(level2_children.status_code, 200, level2_children.text)
        self.assertEqual([item["id"] for item in level2_children.json()], [level3["id"]])

        level1_children = client.get(f"/api/v1/categories?parent_id={level1['id']}", headers=SUPER_ADMIN)
        self.assertEqual(level1_children.status_code, 200, level1_children.text)
        self.assertEqual({item["id"] for item in level1_children.json()}, {level2["id"], sibling_level2["id"]})
        self.assertNotIn(level3["id"], {item["id"] for item in level1_children.json()})

        for category in [level3, sibling_level2, level2, level1]:
            self.delete_category(category["id"])
        self.delete_library(library["id"])

    def test_library_level_one_filter_and_response_shape(self):
        token = self.unique_token()
        library = self.create_library(token)
        other_library = self.create_library(token, "B")
        level1 = self.create_category(token, library["id"], "Root01")
        level2 = self.create_category(token, library["id"], "Child02", level1["id"])
        other_level1 = self.create_category(token, other_library["id"], "Other01")

        response = client.get(f"/api/v1/categories?category_library_id={library['id']}&level=1", headers=SUPER_ADMIN)
        self.assertEqual(response.status_code, 200, response.text)
        rows = response.json()
        self.assertEqual([item["id"] for item in rows], [level1["id"]])
        self.assertNotIn(level2["id"], {item["id"] for item in rows})
        self.assertNotIn(other_level1["id"], {item["id"] for item in rows})
        self.assertTrue(all("level" not in item and "层级" not in item for item in rows))

        for category in [level2, level1, other_level1]:
            self.delete_category(category["id"])
        self.delete_library(library["id"])
        self.delete_library(other_library["id"])


if __name__ == "__main__":
    unittest.main()

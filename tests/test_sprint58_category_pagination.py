import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class Sprint58CategoryPaginationApiTest(unittest.TestCase):
    def unique_token(self) -> str:
        return str(time.time_ns())[-10:]

    def create_library(self, token: str) -> dict:
        response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": f"Sprint 58 Library {token}",
                "code": f"S58L{token[-8:]}",
                "description": "Sprint 58 pagination verification",
            },
        )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def create_category(self, token: str, library_id: int, index: int, parent_id: int | None = None) -> dict:
        response = client.post(
            "/api/v1/categories",
            headers=SUPER_ADMIN,
            json={
                "name": f"Sprint 58 Category {index:02d} {token}",
                "code": f"S58{token[-6:]}{index:02d}",
                "category_library_id": library_id,
                "parent_category_id": parent_id,
                "description": "Sprint 58 pagination verification",
            },
        )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def test_categories_are_bare_array_paginated_with_stable_shape(self):
        token = self.unique_token()
        library = self.create_library(token)
        categories = [self.create_category(token, library["id"], index) for index in range(1, 8)]

        default_response = client.get("/api/v1/categories", headers=SUPER_ADMIN)
        self.assertEqual(default_response.status_code, 200, default_response.text)
        default_rows = default_response.json()
        self.assertIsInstance(default_rows, list)
        self.assertLessEqual(len(default_rows), 200)

        first_page = client.get(
            f"/api/v1/categories?category_library_id={library['id']}&limit=3&offset=0",
            headers=SUPER_ADMIN,
        )
        second_page = client.get(
            f"/api/v1/categories?category_library_id={library['id']}&limit=3&offset=3",
            headers=SUPER_ADMIN,
        )
        self.assertEqual(first_page.status_code, 200, first_page.text)
        self.assertEqual(second_page.status_code, 200, second_page.text)
        first_rows = first_page.json()
        second_rows = second_page.json()
        self.assertIsInstance(first_rows, list)
        self.assertIsInstance(second_rows, list)
        self.assertLessEqual(len(first_rows), 3)
        self.assertLessEqual(len(second_rows), 3)
        self.assertTrue({item["id"] for item in first_rows}.isdisjoint({item["id"] for item in second_rows}))

        expected_fields = {"id", "name", "code", "parent_category_id", "category_library_id"}
        self.assertTrue(expected_fields.issubset(first_rows[0].keys()))
        self.assertEqual([item["id"] for item in first_rows], [category["id"] for category in categories[:3]])
        self.assertEqual([item["id"] for item in second_rows], [category["id"] for category in categories[3:6]])

    def test_level_one_default_matches_explicit_first_batch(self):
        token = self.unique_token()
        library = self.create_library(token)
        root = self.create_category(token, library["id"], 1)
        child = self.create_category(token, library["id"], 2, root["id"])

        default_roots = client.get(f"/api/v1/categories?category_library_id={library['id']}&level=1", headers=SUPER_ADMIN)
        explicit_roots = client.get(
            f"/api/v1/categories?category_library_id={library['id']}&level=1&limit=200&offset=0",
            headers=SUPER_ADMIN,
        )
        self.assertEqual(default_roots.status_code, 200, default_roots.text)
        self.assertEqual(explicit_roots.status_code, 200, explicit_roots.text)
        default_ids = {item["id"] for item in default_roots.json()}
        explicit_ids = {item["id"] for item in explicit_roots.json()}
        self.assertEqual(default_ids, explicit_ids)
        self.assertIn(root["id"], default_ids)
        self.assertNotIn(child["id"], default_ids)


if __name__ == "__main__":
    unittest.main()

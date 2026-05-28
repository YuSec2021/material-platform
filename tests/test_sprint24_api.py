import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}
EXPECTED_CATEGORY_SLUGS = [
    "unit_normalization",
    "brand_alias",
    "title_cleaning",
    "enum_validation",
    "required_field_check",
    "blackwhite_list",
]


class Sprint24RuleEngineApiTest(unittest.TestCase):
    def test_seeded_categories_crud_toggle_auth_and_openapi(self):
        categories_response = client.get("/api/v1/rules/categories", headers=SUPER_ADMIN)
        self.assertEqual(categories_response.status_code, 200, categories_response.text)
        categories = categories_response.json()
        self.assertEqual([category["slug"] for category in categories], EXPECTED_CATEGORY_SLUGS)
        self.assertTrue(all(category["rule_count"] >= 2 for category in categories))

        rules_response = client.get("/api/v1/rules?page=1&page_size=100", headers=SUPER_ADMIN)
        self.assertEqual(rules_response.status_code, 200, rules_response.text)
        self.assertGreaterEqual(rules_response.json()["total"], 12)

        unique = time.time_ns()
        category_id = categories[0]["id"]
        create_response = client.post(
            "/api/v1/rules",
            headers=SUPER_ADMIN,
            json={
                "category_id": category_id,
                "name": f"Sprint 24 Unit Rule {unique}",
                "description": "Created by sprint 24 regression test",
                "pattern": "LB",
                "value": "lb",
                "options": {"match": "exact_ignore_case"},
                "priority": 1,
                "enabled": True,
            },
        )
        self.assertEqual(create_response.status_code, 200, create_response.text)
        rule_id = create_response.json()["id"]

        listed = client.get(
            f"/api/v1/rules?category_id={category_id}&search={unique}&enabled=true&page=1&page_size=5",
            headers=SUPER_ADMIN,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertTrue(any(item["id"] == rule_id for item in listed.json()["items"]))
        self.assertIn("pages", listed.json())

        detail = client.get(f"/api/v1/rules/{rule_id}", headers=SUPER_ADMIN)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["category"]["slug"], "unit_normalization")

        toggled = client.patch(f"/api/v1/rules/{rule_id}/toggle", headers=SUPER_ADMIN, json={"enabled": False})
        self.assertEqual(toggled.status_code, 200, toggled.text)
        self.assertFalse(toggled.json()["enabled"])

        updated = client.put(
            f"/api/v1/rules/{rule_id}",
            headers=SUPER_ADMIN,
            json={"description": "Updated by sprint 24 test", "value": "pound", "priority": 2, "enabled": True},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["value"], "pound")
        self.assertEqual(updated.json()["priority"], 2)

        user = client.post(
            "/api/v1/users",
            headers=SUPER_ADMIN,
            json={"username": f"sprint24_regular_{unique}", "display_name": "Sprint 24 Regular User"},
        )
        self.assertEqual(user.status_code, 200, user.text)
        regular_headers = {"X-User-Id": str(user.json()["id"])}
        self.assertEqual(client.post("/api/v1/rules", headers=regular_headers, json=create_response.json()).status_code, 403)
        self.assertEqual(client.put(f"/api/v1/rules/{rule_id}", headers=regular_headers, json={"description": "blocked"}).status_code, 403)
        self.assertEqual(client.patch(f"/api/v1/rules/{rule_id}/toggle", headers=regular_headers, json={"enabled": False}).status_code, 403)
        self.assertEqual(client.delete(f"/api/v1/rules/{rule_id}", headers=regular_headers).status_code, 403)

        deleted = client.delete(f"/api/v1/rules/{rule_id}", headers=SUPER_ADMIN)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        missing = client.get(f"/api/v1/rules/{rule_id}", headers=SUPER_ADMIN)
        self.assertEqual(missing.status_code, 404)

        openapi = client.get("/openapi.json")
        self.assertEqual(openapi.status_code, 200, openapi.text)
        paths = openapi.json()["paths"]
        for path in [
            "/api/v1/rules/categories",
            "/api/v1/rules",
            "/api/v1/rules/{rule_id}",
            "/api/v1/rules/{rule_id}/toggle",
            "/api/v1/rules/evaluate",
        ]:
            self.assertIn(path, paths)

    def test_evaluate_returns_structured_results_for_all_rule_categories(self):
        response = client.post(
            "/api/v1/rules/evaluate",
            headers=SUPER_ADMIN,
            json={"name": "  FORBIDDEN   material  ", "brand": "苹果", "unit": "KG", "attributes": {"color": "green"}},
        )
        self.assertEqual(response.status_code, 200, response.text)
        results = response.json()["results"]
        self.assertTrue(results)
        result_slugs = {item["category_slug"] for item in results}
        self.assertTrue(set(EXPECTED_CATEGORY_SLUGS).issubset(result_slugs))
        for slug in EXPECTED_CATEGORY_SLUGS:
            failures = [item for item in results if item["category_slug"] == slug and item["passed"] is False]
            self.assertTrue(failures, slug)
            self.assertTrue(all(item["message"] and item["suggestion"] for item in failures))


if __name__ == "__main__":
    unittest.main()

import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class Sprint46CategoryPropertiesTest(unittest.TestCase):
    def unique(self, prefix: str) -> str:
        return f"{prefix}-{time.time_ns()}"

    def create_role(self) -> dict:
        response = client.post(
            "/api/v1/roles",
            headers=SUPER_ADMIN,
            json={"name": self.unique("sprint46-role"), "description": "Sprint 46 role", "enabled": True},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_category_library(self) -> dict:
        response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={"name": self.unique("sprint46-category-library"), "description": "Sprint 46 category library"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_category(self, library_id: int, name: str, parent_id: int | None = None) -> dict:
        payload = {"name": name, "category_library_id": library_id, "description": "Sprint 46 category"}
        if parent_id is not None:
            payload["parent_category_id"] = parent_id
        response = client.post("/api/v1/categories", headers=SUPER_ADMIN, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_product(self) -> dict:
        response = client.post(
            "/api/v1/product-names",
            headers=SUPER_ADMIN,
            json={"name": self.unique("sprint46-product"), "unit": "件", "category": "Sprint 46"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_material_library(self, category_library_id: int) -> dict:
        role = self.create_role()
        response = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("sprint46-material-library"),
                "description": "Sprint 46 material library",
                "enabled": True,
                "material_library_admin_ids": [role["id"]],
                "category_library_ids": [category_library_id],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_attribute(self, category_id: int, name: str, **overrides) -> dict:
        payload = {
            "name": name,
            "attr_type": overrides.pop("attr_type", "string"),
            "display_name_zh": overrides.pop("display_name_zh", name),
            "display_name_en": overrides.pop("display_name_en", name),
            "required": overrides.pop("required", False),
            "allow_empty": overrides.pop("allow_empty", True),
            "default_value": overrides.pop("default_value", ""),
            **overrides,
        }
        response = client.post(f"/api/v1/categories/{category_id}/attributes", headers=SUPER_ADMIN, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_own_attribute_crud(self):
        library = self.create_category_library()
        category = self.create_category(library["id"], self.unique("办公用品"))

        created = self.create_attribute(
            category["id"],
            "specification",
            required=True,
            allow_empty=False,
            default_value="A4",
        )
        self.assertEqual(created["category_id"], category["id"])
        self.assertEqual(created["name"], "specification")
        self.assertEqual(created["attr_type"], "string")
        self.assertEqual(created["data_type"], "string")
        self.assertEqual(created["default_value"], "A4")
        self.assertTrue(created["required"])
        self.assertFalse(created["allow_empty"])
        self.assertFalse(created["is_inherited"])
        self.assertIsNone(created["inherited_from"])

        attributes = client.get(f"/api/v1/categories/{category['id']}/attributes", headers=SUPER_ADMIN)
        self.assertEqual(attributes.status_code, 200, attributes.text)
        self.assertEqual([item["id"] for item in attributes.json()].count(created["id"]), 1)

        updated = client.put(
            f"/api/v1/categories/{category['id']}/attributes/{created['id']}",
            headers=SUPER_ADMIN,
            json={"default_value": "A3", "required": False},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["default_value"], "A3")
        self.assertFalse(updated.json()["required"])

        deleted = client.delete(f"/api/v1/categories/{category['id']}/attributes/{created['id']}", headers=SUPER_ADMIN)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        after_delete = client.get(f"/api/v1/categories/{category['id']}/attributes", headers=SUPER_ADMIN)
        self.assertFalse(any(item["id"] == created["id"] for item in after_delete.json()))

    def test_inheritance_and_child_read_only_behavior(self):
        library = self.create_category_library()
        level1 = self.create_category(library["id"], self.unique("办公用品"))
        level2 = self.create_category(library["id"], self.unique("纸张"), level1["id"])
        level3 = self.create_category(library["id"], self.unique("复印纸"), level2["id"])
        other = self.create_category(library["id"], self.unique("其他"))

        parent_attr = self.create_attribute(level1["id"], "specification", required=True, allow_empty=False)
        child_attr = self.create_attribute(level2["id"], "paper_weight", attr_type="number")
        self.create_attribute(other["id"], "unrelated")

        properties = client.get(f"/api/v1/categories/{level3['id']}/properties", headers=SUPER_ADMIN)
        self.assertEqual(properties.status_code, 200, properties.text)
        names = {item["name"]: item for item in properties.json()["properties"]}
        self.assertIn("specification", names)
        self.assertIn("paper_weight", names)
        self.assertNotIn("unrelated", names)
        self.assertTrue(names["specification"]["is_inherited"])
        self.assertEqual(names["specification"]["source_category_id"], level1["id"])
        self.assertEqual(names["paper_weight"]["source_category_id"], level2["id"])
        self.assertEqual(len([item for item in properties.json()["properties"] if item["source_attribute_id"] == parent_attr["id"]]), 1)

        child_update = client.put(
            f"/api/v1/categories/{level2['id']}/attributes/{parent_attr['id']}",
            headers=SUPER_ADMIN,
            json={"default_value": "changed"},
        )
        self.assertEqual(child_update.status_code, 404)

        parent_update = client.put(
            f"/api/v1/categories/{level1['id']}/attributes/{parent_attr['id']}",
            headers=SUPER_ADMIN,
            json={"default_value": "A4"},
        )
        self.assertEqual(parent_update.status_code, 200, parent_update.text)
        inherited_after_update = client.get(f"/api/v1/categories/{level3['id']}/properties", headers=SUPER_ADMIN).json()
        self.assertEqual(
            next(item for item in inherited_after_update["properties"] if item["id"] == parent_attr["id"])["default_value"],
            "A4",
        )

        delete_parent = client.delete(
            f"/api/v1/categories/{level1['id']}/attributes/{parent_attr['id']}",
            headers=SUPER_ADMIN,
        )
        self.assertEqual(delete_parent.status_code, 200, delete_parent.text)
        inherited_after_delete = client.get(f"/api/v1/categories/{level3['id']}/properties", headers=SUPER_ADMIN).json()
        self.assertNotIn(parent_attr["id"], [item["id"] for item in inherited_after_delete["properties"]])
        self.assertIn(child_attr["id"], [item["id"] for item in inherited_after_delete["properties"]])

    def test_invalid_duplicate_and_missing_category_attribute_definitions(self):
        library = self.create_category_library()
        category = self.create_category(library["id"], self.unique("办公用品"))
        self.create_attribute(category["id"], "color")

        duplicate = client.post(
            f"/api/v1/categories/{category['id']}/attributes",
            headers=SUPER_ADMIN,
            json={"name": "color", "attr_type": "string"},
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertIn("already exists", duplicate.text)

        invalid_type = client.post(
            f"/api/v1/categories/{category['id']}/attributes",
            headers=SUPER_ADMIN,
            json={"name": "invalid_type", "attr_type": "unsupported"},
        )
        self.assertEqual(invalid_type.status_code, 422)
        self.assertIn("attr_type", invalid_type.text)

        missing_category = client.post(
            "/api/v1/categories/999999999/attributes",
            headers=SUPER_ADMIN,
            json={"name": "missing", "attr_type": "string"},
        )
        self.assertEqual(missing_category.status_code, 404)

    def test_material_creation_requires_effective_category_properties(self):
        category_library = self.create_category_library()
        parent = self.create_category(category_library["id"], self.unique("办公用品"))
        child = self.create_category(category_library["id"], self.unique("纸张"), parent["id"])
        self.create_attribute(parent["id"], "specification", required=True, allow_empty=False)
        self.create_attribute(child["id"], "paper_weight", attr_type="number", required=True, allow_empty=False)

        material_library = self.create_material_library(category_library["id"])
        product = self.create_product()
        base_payload = {
            "name": self.unique("sprint46-material"),
            "product_name_id": product["id"],
            "material_library_id": material_library["id"],
            "category_id": child["id"],
            "unit": product["unit"],
            "description": "Sprint 46 material",
        }
        missing = client.post(
            "/api/v1/materials",
            headers=SUPER_ADMIN,
            json={**base_payload, "attributes": {"specification": "A4"}},
        )
        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertIn("paper_weight", missing.text)

        created = client.post(
            "/api/v1/materials",
            headers=SUPER_ADMIN,
            json={**base_payload, "name": self.unique("sprint46-material-ok"), "attributes": {"specification": "A4", "paper_weight": "80"}},
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["attributes"]["specification"], "A4")
        self.assertEqual(created.json()["attributes"]["paper_weight"], "80")


if __name__ == "__main__":
    unittest.main()

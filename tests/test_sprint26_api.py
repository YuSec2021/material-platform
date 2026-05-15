import os
import time
import unittest
from datetime import datetime

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class Sprint26CodeRuleApiTest(unittest.TestCase):
    def unique(self, prefix: str) -> str:
        return f"{prefix} {time.time_ns()}"

    def rule(self, prefix: str = "AUTO") -> dict:
        return {
            "rule_name": f"{prefix} rule",
            "separator": "-",
            "segments": [
                {"type": "fixed", "value": prefix},
                {"type": "date", "format": "YYYYMMDD"},
                {"type": "serial", "length": 3, "start": 1, "step": 1, "scope": "global", "padding": "left_zero"},
            ],
        }

    def create_auto_library(self, prefix: str = "AUTO") -> dict:
        response = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique(f"Sprint 26 Library {prefix}"),
                "description": "Sprint 26 code rule library",
                "enabled": True,
                "auto_code_enabled": True,
                "recode_enabled": True,
                "code_rule": self.rule(prefix),
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
            "description": "Sprint 26 generated code material",
            "attributes": {"color": "red"},
        }

    def test_library_creation_current_rule_versions_and_basic_update(self):
        library = self.create_auto_library("MAT")
        self.assertTrue(library["auto_code_enabled"])
        self.assertTrue(library["recode_enabled"])
        self.assertIsNotNone(library["current_rule_version_id"])
        self.assertEqual(library["code_rule_summary"]["version"], 1)
        self.assertEqual(library["code_rule_summary"]["status"], "active")

        listed = client.get("/api/v1/material-libraries", headers=SUPER_ADMIN).json()
        self.assertTrue(any(item["id"] == library["id"] and item["code_rule_summary"]["status"] == "active" for item in listed))

        detail = client.get(f"/api/v1/material-libraries/{library['id']}", headers=SUPER_ADMIN)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["current_rule_version_id"], library["current_rule_version_id"])
        self.assertIn("material_count", detail.json())

        updated = client.put(
            f"/api/v1/material-libraries/{library['id']}",
            headers=SUPER_ADMIN,
            json={"description": "Updated without editing code rule"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["current_rule_version_id"], library["current_rule_version_id"])

    def test_versions_are_append_only_and_draft_does_not_replace_active_rule(self):
        library = self.create_auto_library("VER")
        current = client.get(f"/api/v1/material-libraries/{library['id']}/code-rules/current", headers=SUPER_ADMIN)
        self.assertEqual(current.status_code, 200, current.text)
        self.assertEqual(current.json()["status"], "active")
        self.assertEqual(current.json()["version_label"], "V1")
        self.assertEqual(current.json()["separator"], "-")
        self.assertTrue(current.json()["segments"])

        created = client.post(
            f"/api/v1/material-libraries/{library['id']}/code-rules/versions",
            headers=SUPER_ADMIN,
            json={
                "rule_name": "Draft V2",
                "rule_config": {"separator": "-", "segments": [{"type": "fixed", "value": "VNEW"}, {"type": "serial", "length": 3}]},
                "change_reason": "append-only verification",
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["version"], 2)
        self.assertEqual(created.json()["status"], "draft")
        self.assertEqual(created.json()["change_reason"], "append-only verification")

        versions = client.get(
            f"/api/v1/material-libraries/{library['id']}/code-rules/versions",
            headers=SUPER_ADMIN,
            params={"page": 1, "page_size": 10},
        )
        self.assertEqual(versions.status_code, 200, versions.text)
        self.assertEqual(versions.json()["total"], 2)

        still_current = client.get(f"/api/v1/material-libraries/{library['id']}/code-rules/current", headers=SUPER_ADMIN)
        self.assertEqual(still_current.json()["id"], library["current_rule_version_id"])

    def test_material_creation_generates_serialized_codes(self):
        code_prefix = f"A{time.time_ns() % 100000000}"
        library = self.create_auto_library(code_prefix)
        prefix = self.unique("Sprint 26 Material")
        first = client.post("/api/v1/materials", headers=SUPER_ADMIN, json=self.material_payload(library["id"], f"{prefix} A"))
        self.assertEqual(first.status_code, 200, first.text)
        second = client.post("/api/v1/materials", headers=SUPER_ADMIN, json=self.material_payload(library["id"], f"{prefix} B"))
        self.assertEqual(second.status_code, 200, second.text)

        today = datetime.now().strftime("%Y%m%d")
        self.assertEqual(first.json()["code"], f"{code_prefix}-{today}-001")
        self.assertEqual(second.json()["code"], f"{code_prefix}-{today}-002")
        self.assertEqual(first.json()["code_rule_version_id"], library["current_rule_version_id"])
        self.assertEqual(first.json()["code_status"], "active")
        self.assertEqual(first.json()["code_change_count"], 0)

    def test_validation_and_authorization(self):
        invalid_length = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("Sprint 26 Invalid Length"),
                "auto_code_enabled": True,
                "code_rule": {
                    "rule_name": "Invalid serial",
                    "segments": [{"type": "fixed", "value": "BAD"}, {"type": "serial", "length": 11}],
                },
            },
        )
        self.assertIn(invalid_length.status_code, {400, 422})
        self.assertIn("Serial length", invalid_length.text)

        invalid_format = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("Sprint 26 Invalid Format"),
                "auto_code_enabled": True,
                "code_rule": {
                    "rule_name": "Invalid format",
                    "segments": [{"type": "fixed", "value": "bad"}, {"type": "serial", "length": 3}],
                },
            },
        )
        self.assertIn(invalid_format.status_code, {400, 422})
        self.assertIn("Code format", invalid_format.text)

        no_unique = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("Sprint 26 No Unique"),
                "auto_code_enabled": True,
                "code_rule": {
                    "rule_name": "No unique",
                    "segments": [{"type": "fixed", "value": "FIX"}, {"type": "date", "format": "YYYYMMDD"}],
                },
            },
        )
        self.assertIn(no_unique.status_code, {400, 422})
        self.assertIn("uniqueness-producing", no_unique.text)

        library = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": self.unique("Sprint 26 Attribute Library"),
                "auto_code_enabled": True,
                "code_rule": {
                    "rule_name": "Attribute required",
                    "separator": "-",
                    "segments": [
                        {"type": "fixed", "value": "ATTR"},
                        {"type": "attribute_code", "attribute": "color", "value_to_code": {"red": "R"}},
                    ],
                },
            },
        ).json()
        failed_name = self.unique("Sprint 26 Missing Attribute")
        missing_attr = self.material_payload(library["id"], failed_name)
        missing_attr["attributes"] = {"size": "L"}
        failed = client.post("/api/v1/materials", headers=SUPER_ADMIN, json=missing_attr)
        self.assertIn(failed.status_code, {400, 422})
        self.assertIn("Missing attribute", failed.text)
        search = client.get("/api/v1/materials", headers=SUPER_ADMIN, params={"search": failed_name}).json()
        self.assertFalse(any(item["name"] == failed_name for item in search))

        forbidden = client.post(
            f"/api/v1/material-libraries/{library['id']}/code-rules/versions",
            headers={"X-Username": "hcm_zhangsan"},
            json={"rule_name": "Forbidden", "rule_config": {"segments": [{"type": "fixed", "value": "NO"}, {"type": "serial"}]}},
        )
        self.assertEqual(forbidden.status_code, 403)


if __name__ == "__main__":
    unittest.main()

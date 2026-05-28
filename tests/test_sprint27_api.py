import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}
NON_ADMIN = {"X-Username": "hcm_zhangsan"}


class Sprint27BatchRecodingApiTest(unittest.TestCase):
    def unique_token(self) -> str:
        return str(time.time_ns() % 1000000000)

    def fixed_serial_rule(self, fixed: str) -> dict:
        return {
            "rule_name": f"{fixed} rule",
            "separator": "-",
            "segments": [
                {"type": "fixed", "value": fixed},
                {"type": "serial", "length": 3, "start": 1, "step": 1, "scope": "global", "padding": "left_zero"},
            ],
        }

    def create_library(self, fixed: str) -> dict:
        response = client.post(
            "/api/v1/material-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": f"Sprint 27 Library {fixed} {self.unique_token()}",
                "description": "Sprint 27 batch recoding",
                "enabled": True,
                "auto_code_enabled": True,
                "recode_enabled": True,
                "code_rule": self.fixed_serial_rule(fixed),
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def material_payload(self, library_id: int, name: str, attributes: dict | None = None) -> dict:
        product = client.get("/api/v1/product-names", headers=SUPER_ADMIN).json()[0]
        category = client.get("/api/v1/categories", headers=SUPER_ADMIN).json()[0]
        return {
            "name": name,
            "product_name_id": product["id"],
            "material_library_id": library_id,
            "category_id": category["id"],
            "unit": product["unit"],
            "description": "Sprint 27 test material",
            "attributes": attributes or {"color": "red"},
        }

    def create_material(self, library_id: int, name: str, attributes: dict | None = None) -> dict:
        response = client.post("/api/v1/materials", headers=SUPER_ADMIN, json=self.material_payload(library_id, name, attributes))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_rule_version(self, library_id: int, rule_config: dict, name: str = "Sprint 27 V2") -> dict:
        response = client.post(
            f"/api/v1/material-libraries/{library_id}/code-rules/versions",
            headers=SUPER_ADMIN,
            json={"rule_name": name, "rule_config": rule_config, "change_reason": "Sprint 27 recoding"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "draft")
        return response.json()

    def test_preview_execute_mapping_export_and_rollback(self):
        token = self.unique_token()
        library = self.create_library(f"O{token}")
        prefix = f"Sprint 27 Recode {token}"
        materials = [self.create_material(library["id"], f"{prefix} {index}") for index in range(3)]
        old_codes = {item["id"]: item["code"] for item in materials}
        v2 = self.create_rule_version(library["id"], self.fixed_serial_rule(f"N{token}"))

        preview = client.post(
            f"/api/v1/material-libraries/{library['id']}/code-rules/versions/{v2['id']}/recode-preview",
            headers=SUPER_ADMIN,
            json={"scope": "all"},
        )
        self.assertIn(preview.status_code, {200, 201}, preview.text)
        preview_json = preview.json()
        self.assertEqual(preview_json["total_count"], 3)
        self.assertEqual(preview_json["success_count"], 3)
        self.assertEqual(preview_json["failed_count"], 0)
        self.assertEqual(len(preview_json["rows"]), 3)
        batch_id = preview_json["batch_id"]

        batch = client.get(f"/api/v1/material-code-change-batches/{batch_id}", headers=SUPER_ADMIN)
        self.assertEqual(batch.status_code, 200, batch.text)
        self.assertEqual(batch.json()["old_rule_version_id"], library["current_rule_version_id"])
        self.assertEqual(batch.json()["new_rule_version_id"], v2["id"])

        rows = client.get(
            f"/api/v1/material-code-change-batches/{batch_id}/preview",
            headers=SUPER_ADMIN,
            params={"page": 1, "page_size": 10},
        )
        self.assertEqual(rows.status_code, 200, rows.text)
        self.assertEqual(rows.json()["total"], 3)
        first_row = rows.json()["items"][0]
        self.assertTrue(first_row["material_name"].startswith(prefix))
        self.assertEqual(first_row["old_code"], old_codes[first_row["material_id"]])
        self.assertTrue(first_row["new_code"].startswith(f"N{token}-"))

        executed = client.post(
            f"/api/v1/material-code-change-batches/{batch_id}/execute",
            headers=SUPER_ADMIN,
            json={"confirm": True},
        )
        self.assertEqual(executed.status_code, 200, executed.text)
        self.assertEqual(executed.json()["status"], "executed")

        updated = client.get("/api/v1/materials", headers=SUPER_ADMIN, params={"search": prefix}).json()
        self.assertEqual(len(updated), 3)
        updated_by_id = {item["id"]: item for item in updated}
        for material_id, old_code in old_codes.items():
            self.assertTrue(updated_by_id[material_id]["code"].startswith(f"N{token}-"))
            self.assertEqual(updated_by_id[material_id]["previous_code"], old_code)
            self.assertEqual(updated_by_id[material_id]["original_code"], old_code)
            self.assertEqual(updated_by_id[material_id]["code_rule_version_id"], v2["id"])
            self.assertEqual(updated_by_id[material_id]["code_change_count"], 1)

        mappings = client.get(
            f"/api/v1/material-libraries/{library['id']}/code-mappings",
            headers=SUPER_ADMIN,
            params={"page": 1, "page_size": 2},
        )
        self.assertEqual(mappings.status_code, 200, mappings.text)
        self.assertEqual(len(mappings.json()["items"]), 2)
        self.assertGreaterEqual(mappings.json()["total"], 3)

        filtered = client.get(
            f"/api/v1/material-libraries/{library['id']}/code-mappings",
            headers=SUPER_ADMIN,
            params={"batch_id": batch_id, "old_code": first_row["old_code"], "page": 1, "page_size": 10},
        )
        self.assertEqual(filtered.status_code, 200, filtered.text)
        self.assertEqual(filtered.json()["items"][0]["old_code"], first_row["old_code"])

        csv_export = client.get(
            f"/api/v1/material-libraries/{library['id']}/code-mappings",
            headers=SUPER_ADMIN,
            params={"batch_id": batch_id, "export": "csv"},
        )
        self.assertEqual(csv_export.status_code, 200, csv_export.text)
        self.assertIn("text/csv", csv_export.headers["content-type"])
        self.assertIn("old_code,new_code", csv_export.text)
        self.assertIn(str(batch_id), csv_export.text)

        audit = client.get(
            "/api/v1/audit-logs",
            headers=SUPER_ADMIN,
            params={"resource": "material_code_change_batch", "action": "execute", "page": 1, "page_size": 20},
        )
        self.assertEqual(audit.status_code, 200, audit.text)
        self.assertTrue(any(item["after_value"].get("batch_id") == batch_id for item in audit.json()["items"]))

        rolled_back = client.post(
            f"/api/v1/material-code-change-batches/{batch_id}/rollback",
            headers=SUPER_ADMIN,
            json={"confirm": True, "reason": "Sprint 27 rollback test"},
        )
        self.assertEqual(rolled_back.status_code, 200, rolled_back.text)
        self.assertEqual(rolled_back.json()["status"], "rolled_back")

        restored = client.get("/api/v1/materials", headers=SUPER_ADMIN, params={"search": prefix}).json()
        for item in restored:
            self.assertEqual(item["code"], old_codes[item["id"]])
            self.assertEqual(item["code_rule_version_id"], library["current_rule_version_id"])
            self.assertEqual(item["code_change_count"], 0)

        rolled_mappings = client.get(
            f"/api/v1/material-libraries/{library['id']}/code-mappings",
            headers=SUPER_ADMIN,
            params={"batch_id": batch_id, "page": 1, "page_size": 10},
        )
        self.assertTrue(all(item["status"] == "rolled_back" for item in rolled_mappings.json()["items"]))
        second_rollback = client.post(
            f"/api/v1/material-code-change-batches/{batch_id}/rollback",
            headers=SUPER_ADMIN,
            json={"confirm": True, "reason": "again"},
        )
        self.assertIn(second_rollback.status_code, {400, 409})

    def test_selected_preview_failure_blocks_execute_without_changing_codes(self):
        token = self.unique_token()
        library = self.create_library(f"P{token}")
        prefix = f"Sprint 27 Selected {token}"
        with_color = self.create_material(library["id"], f"{prefix} red", {"color": "red"})
        without_color = self.create_material(library["id"], f"{prefix} missing", {"size": "L"})
        unselected = self.create_material(library["id"], f"{prefix} blue", {"color": "blue"})
        original_codes = {item["id"]: item["code"] for item in [with_color, without_color, unselected]}
        v2 = self.create_rule_version(
            library["id"],
            {
                "separator": "-",
                "segments": [
                    {"type": "fixed", "value": f"C{token}"},
                    {"type": "attribute_code", "attribute": "color", "value_to_code": {"red": "R", "blue": "B"}},
                    {"type": "serial", "length": 3, "start": 1, "step": 1, "scope": "global"},
                ],
            },
        )

        preview = client.post(
            f"/api/v1/material-libraries/{library['id']}/code-rules/versions/{v2['id']}/recode-preview",
            headers=SUPER_ADMIN,
            json={"scope": "selected", "material_ids": [with_color["id"], without_color["id"]]},
        )
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json()["total_count"], 2)
        self.assertEqual(preview.json()["success_count"], 1)
        self.assertEqual(preview.json()["failed_count"], 1)
        failed_rows = [row for row in preview.json()["rows"] if row["status"] == "failed"]
        self.assertIn("Missing attribute", failed_rows[0]["error_message"])
        batch_id = preview.json()["batch_id"]

        rows = client.get(f"/api/v1/material-code-change-batches/{batch_id}/preview", headers=SUPER_ADMIN)
        returned_ids = {item["material_id"] for item in rows.json()["items"]}
        self.assertEqual(returned_ids, {with_color["id"], without_color["id"]})
        self.assertNotIn(unselected["id"], returned_ids)

        blocked = client.post(
            f"/api/v1/material-code-change-batches/{batch_id}/execute",
            headers=SUPER_ADMIN,
            json={"confirm": True},
        )
        self.assertIn(blocked.status_code, {400, 409})
        self.assertIn("validation", blocked.text)

        after_preview = client.get("/api/v1/materials", headers=SUPER_ADMIN, params={"search": prefix}).json()
        self.assertEqual({item["id"]: item["code"] for item in after_preview}, original_codes)

    def test_batch_recoding_requires_super_admin_for_mutations(self):
        token = self.unique_token()
        library = self.create_library(f"A{token}")
        material = self.create_material(library["id"], f"Sprint 27 Auth {token}")
        v2 = self.create_rule_version(library["id"], self.fixed_serial_rule(f"B{token}"))

        forbidden_preview = client.post(
            f"/api/v1/material-libraries/{library['id']}/code-rules/versions/{v2['id']}/recode-preview",
            headers=NON_ADMIN,
            json={"scope": "all"},
        )
        self.assertEqual(forbidden_preview.status_code, 403)

        preview = client.post(
            f"/api/v1/material-libraries/{library['id']}/code-rules/versions/{v2['id']}/recode-preview",
            headers=SUPER_ADMIN,
            json={"scope": "all"},
        ).json()
        execute = client.post(
            f"/api/v1/material-code-change-batches/{preview['batch_id']}/execute",
            headers=NON_ADMIN,
            json={"confirm": True},
        )
        self.assertEqual(execute.status_code, 403)
        rollback = client.post(
            f"/api/v1/material-code-change-batches/{preview['batch_id']}/rollback",
            headers=NON_ADMIN,
            json={"confirm": True, "reason": "unauthorized"},
        )
        self.assertEqual(rollback.status_code, 403)
        unchanged = client.get("/api/v1/materials", headers=SUPER_ADMIN, params={"search": material["name"]}).json()[0]
        self.assertEqual(unchanged["code"], material["code"])


if __name__ == "__main__":
    unittest.main()

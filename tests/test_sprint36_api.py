import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}
REGULAR_USER = {"X-Username": "regular_user"}


class Sprint36CategoryBulkImportApiTest(unittest.TestCase):
    def unique_token(self) -> str:
        return str(time.time_ns())

    def create_library(self, token: str) -> dict:
        response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": f"Sprint 36 Category Library {token}",
                "code": f"S36CL{token[-8:]}",
                "description": "Sprint 36 bulk import",
            },
        )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def test_template_json_import_and_duplicate_skip(self):
        token = self.unique_token()
        library = self.create_library(token)

        template = client.get("/api/v1/categories/template", headers=SUPER_ADMIN)
        self.assertEqual(template.status_code, 200, template.text)
        lines = [line for line in template.text.strip().splitlines() if line]
        self.assertEqual(lines[0].strip(), "一级类目,二级类目,三级类目")
        self.assertGreaterEqual(len(lines), 4)

        rows = [
            {"一级类目": f"S36一级{token}", "二级类目": "", "三级类目": ""},
            {"一级类目": f"S36一级{token}", "二级类目": f"S36二级{token}", "三级类目": ""},
            {"一级类目": f"S36一级{token}", "二级类目": f"S36二级{token}", "三级类目": f"S36三级{token}"},
        ]
        imported = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=SUPER_ADMIN,
            json={"rows": rows},
        )
        self.assertIn(imported.status_code, {200, 201}, imported.text)
        payload = imported.json()
        self.assertEqual(payload["success_count"], 3)
        self.assertEqual(payload["skipped_count"], 0)
        self.assertEqual(payload["errors"], [])

        categories = client.get("/api/v1/categories", headers=SUPER_ADMIN).json()
        by_name = {item["name"]: item for item in categories if item["category_library_id"] == library["id"]}
        level1 = by_name[f"S36一级{token}"]
        level2 = by_name[f"S36二级{token}"]
        level3 = by_name[f"S36三级{token}"]
        self.assertIsNone(level1["parent_category_id"])
        self.assertEqual(level2["parent_category_id"], level1["id"])
        self.assertEqual(level3["parent_category_id"], level2["id"])

        duplicate = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=SUPER_ADMIN,
            json=rows,
        )
        self.assertEqual(duplicate.status_code, 200, duplicate.text)
        self.assertEqual(duplicate.json()["success_count"], 0)
        self.assertEqual(duplicate.json()["skipped_count"], 3)

    def test_csv_import_reports_row_errors_and_regular_user_is_read_only(self):
        token = self.unique_token()
        library = self.create_library(token)
        csv_text = (
            "一级类目,二级类目,三级类目\n"
            f"S36CSV一级{token},S36CSV二级{token},S36CSV三级{token}\n"
            f",S36缺一级{token},S36缺三级{token}\n"
        )

        imported = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=SUPER_ADMIN,
            files={"file": ("categories.csv", csv_text, "text/csv")},
        )
        self.assertEqual(imported.status_code, 200, imported.text)
        payload = imported.json()
        self.assertGreaterEqual(payload["success_count"], 3)
        self.assertEqual(payload["error_count"], 1)
        self.assertIn("一级类目 is required", payload["errors"][0]["errors"])

        categories = client.get("/api/v1/categories", headers=SUPER_ADMIN).json()
        self.assertFalse(any(item["name"] == "" for item in categories))
        self.assertTrue(any(item["name"] == f"S36CSV三级{token}" for item in categories))

        regular_list = client.get("/api/v1/categories", headers=REGULAR_USER)
        self.assertEqual(regular_list.status_code, 200, regular_list.text)
        regular_post = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=REGULAR_USER,
            json=[{"一级类目": f"S36Blocked{token}"}],
        )
        self.assertEqual(regular_post.status_code, 403, regular_post.text)

    def test_ai_category_recognition_endpoint_returns_editable_paths(self):
        token = self.unique_token()
        library = self.create_library(token)

        response = client.post(
            "/api/v1/ai/category-recognition/recognize",
            headers=SUPER_ADMIN,
            json={
                "text": f"办公设备 打印设备 激光打印机\n耗材/打印耗材/硒鼓{token}",
                "category_library_id": library["id"],
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["categories"][0]["level1"], "办公设备")
        self.assertEqual(payload["categories"][0]["level2"], "打印设备")
        self.assertEqual(payload["categories"][0]["level3"], "激光打印机")
        self.assertIn("confidence", payload["categories"][0])
        self.assertEqual(payload["categories"][1]["level1"], "耗材")
        self.assertEqual(payload["categories"][1]["level2"], "打印耗材")
        self.assertEqual(payload["categories"][1]["level3"], f"硒鼓{token}")
        self.assertTrue(payload["suggestions"])


if __name__ == "__main__":
    unittest.main()

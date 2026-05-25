import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class Sprint50CategoryLevelExpansionTest(unittest.TestCase):
    def unique_token(self) -> str:
        return str(time.time_ns())[-10:]

    def create_library(self, token: str) -> dict:
        response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": f"Sprint 50 Library {token}",
                "code": f"S50L{token[-8:]}",
                "description": "Sprint 50 five-level category verification",
            },
        )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def test_template_and_bulk_import_create_five_level_chain(self):
        token = self.unique_token()
        library = self.create_library(token)
        names = [f"S50L{level}{token}" for level in range(1, 6)]

        template = client.get("/api/v1/categories/template", headers=SUPER_ADMIN)
        self.assertEqual(template.status_code, 200, template.text)
        self.assertEqual(template.text.splitlines()[0], "一级类目,二级类目,三级类目,四级类目,五级类目")

        imported = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=SUPER_ADMIN,
            json={
                "rows": [
                    {
                        "一级类目": names[0],
                        "二级类目": names[1],
                        "三级类目": names[2],
                        "四级类目": names[3],
                        "五级类目": names[4],
                    }
                ]
            },
        )
        self.assertEqual(imported.status_code, 200, imported.text)
        self.assertEqual(imported.json()["success_count"], 5)

        categories = client.get(f"/api/v1/categories?category_library_id={library['id']}", headers=SUPER_ADMIN)
        self.assertEqual(categories.status_code, 200, categories.text)
        by_name = {item["name"]: item for item in categories.json()}
        self.assertEqual(set(names), set(by_name))
        self.assertIsNone(by_name[names[0]]["parent_category_id"])
        for index in range(1, 5):
            self.assertEqual(by_name[names[index]]["parent_category_id"], by_name[names[index - 1]]["id"])

    def test_recognition_returns_five_levels_and_three_level_compatibility(self):
        five_level = client.post(
            "/api/v1/ai/category-recognition/recognize",
            headers=SUPER_ADMIN,
            json={"text": "办公用品 > 纸张 > 复印纸 > A4纸 > 80g", "category_library_id": None},
        )
        self.assertEqual(five_level.status_code, 200, five_level.text)
        first = five_level.json()["categories"][0]
        self.assertEqual(
            [first[f"level{index}"] for index in range(1, 6)],
            ["办公用品", "纸张", "复印纸", "A4纸", "80g"],
        )
        self.assertIsInstance(first["confidence"], float)
        self.assertNotIn("level6", first)

        three_level = client.post(
            "/api/v1/ai/category-recognition/recognize",
            headers=SUPER_ADMIN,
            json={"text": "办公设备 / 打印设备 / 激光打印机", "category_library_id": None},
        )
        self.assertEqual(three_level.status_code, 200, three_level.text)
        row = three_level.json()["categories"][0]
        self.assertEqual([row["level1"], row["level2"], row["level3"]], ["办公设备", "打印设备", "激光打印机"])
        self.assertNotIn("level4", row)
        self.assertNotIn("level5", row)

    def test_legacy_three_column_csv_remains_compatible(self):
        token = self.unique_token()
        library = self.create_library(f"{token}B")
        csv_text = (
            "一级类目,二级类目,三级类目\n"
            f"S50Legacy1{token},,\n"
            f"S50Legacy2{token},S50Legacy2Child{token},\n"
            f"S50Legacy3{token},S50Legacy3Child{token},S50Legacy3Leaf{token}\n"
        )

        imported = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=SUPER_ADMIN,
            files={"file": ("legacy.csv", csv_text, "text/csv")},
        )
        self.assertEqual(imported.status_code, 200, imported.text)
        self.assertEqual(imported.json()["error_count"], 0)
        self.assertEqual(imported.json()["success_count"], 6)


if __name__ == "__main__":
    unittest.main()

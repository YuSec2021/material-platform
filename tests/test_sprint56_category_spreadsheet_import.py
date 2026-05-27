import os
import time
import unittest
import zipfile
from io import BytesIO
from xml.sax.saxutils import escape

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


def xlsx_workbook(rows: list[list[str]]) -> bytes:
    sheet_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(row):
            column = chr(ord("A") + column_index)
            cells.append(
                f'<c r="{column}{row_index}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
            )
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(sheet_rows)}</sheetData>'
        "</worksheet>"
    )
    output = BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>",
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        archive.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>'
            "</workbook>",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            "</Relationships>",
        )
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return output.getvalue()


def xml_xls_workbook(rows: list[list[str]]) -> bytes:
    sheet_rows = []
    for row in rows:
        cells = "".join(f"<Cell><Data>{escape(value)}</Data></Cell>" for value in row)
        sheet_rows.append(f"<Row>{cells}</Row>")
    workbook = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">'
        f'<Worksheet><Table>{"".join(sheet_rows)}</Table></Worksheet>'
        "</Workbook>"
    )
    return workbook.encode("utf-8")


class Sprint56CategorySpreadsheetImportTest(unittest.TestCase):
    def unique_token(self) -> str:
        return str(time.time_ns())[-10:]

    def create_library(self, token: str) -> dict:
        response = client.post(
            "/api/v1/category-libraries",
            headers=SUPER_ADMIN,
            json={
                "name": f"Sprint 56 Library {token}",
                "code": f"S56L{token[-8:]}",
                "description": "Sprint 56 spreadsheet import",
            },
        )
        self.assertIn(response.status_code, {200, 201}, response.text)
        return response.json()

    def assert_categories_created(self, library_id: int, expected_names: list[str]):
        categories = client.get(f"/api/v1/categories?category_library_id={library_id}", headers=SUPER_ADMIN)
        self.assertEqual(categories.status_code, 200, categories.text)
        names = {item["name"] for item in categories.json()}
        self.assertTrue(set(expected_names).issubset(names), names)

    def test_xlsx_import_creates_categories(self):
        token = self.unique_token()
        library = self.create_library(f"{token}A")
        names = [f"S56Xlsx1{token}", f"S56Xlsx2{token}", f"S56Xlsx3{token}"]
        content = xlsx_workbook([["一级类目", "二级类目", "三级类目"], names])

        response = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=SUPER_ADMIN,
            files={
                "file": (
                    "categories.xlsx",
                    content,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["success_count"], 3)
        self.assert_categories_created(library["id"], names)

    def test_xls_import_creates_categories(self):
        token = self.unique_token()
        library = self.create_library(f"{token}B")
        names = [f"S56Xls1{token}", f"S56Xls2{token}", f"S56Xls3{token}"]
        content = xml_xls_workbook([["一级类目", "二级类目", "三级类目"], names])

        response = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=SUPER_ADMIN,
            files={"file": ("categories.xls", content, "application/vnd.ms-excel")},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["success_count"], 3)
        self.assert_categories_created(library["id"], names)

    def test_malformed_spreadsheet_reports_clear_error_without_partial_rows(self):
        token = self.unique_token()
        library = self.create_library(f"{token}C")
        blocked_name = f"S56Blocked{token}"
        content = xlsx_workbook([["错误列", "二级类目"], [blocked_name, "ShouldNotImport"]])

        response = client.post(
            f"/api/v1/categories/bulk-import?category_library_id={library['id']}",
            headers=SUPER_ADMIN,
            files={
                "file": (
                    "bad-categories.xlsx",
                    content,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        self.assertEqual(response.status_code, 422, response.text)
        self.assertIn("Missing XLSX headers", response.text)
        categories = client.get(f"/api/v1/categories?category_library_id={library['id']}", headers=SUPER_ADMIN)
        self.assertEqual(categories.status_code, 200, categories.text)
        self.assertFalse(any(item["name"] == blocked_name for item in categories.json()))


if __name__ == "__main__":
    unittest.main()

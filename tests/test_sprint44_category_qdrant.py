import os
import time
from urllib.parse import urlparse

import httpx
from fastapi.testclient import TestClient

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

import backend.app.main as main
from backend.app.main import app


client = TestClient(app)
SUPER_ADMIN = {"X-User-Role": "super_admin"}


class FakeQdrant:
    def __init__(self):
        self.collections: set[str] = set()
        self.points: dict[str, dict[int, dict]] = {}

    def __call__(self, method: str, path: str, **kwargs):
        parsed = urlparse(path)
        clean_path = parsed.path
        if method == "GET" and clean_path == "/collections":
            return httpx.Response(200, json={"result": {"collections": sorted(self.collections)}})
        if method == "PUT" and clean_path.startswith("/collections/") and clean_path.count("/") == 2:
            name = clean_path.rsplit("/", 1)[1]
            self.collections.add(name)
            self.points.setdefault(name, {})
            return httpx.Response(200, json={"result": True})
        if method == "DELETE" and clean_path.startswith("/collections/") and clean_path.count("/") == 2:
            name = clean_path.rsplit("/", 1)[1]
            self.collections.discard(name)
            self.points.pop(name, None)
            return httpx.Response(200, json={"result": True})
        if method == "PUT" and clean_path.endswith("/points"):
            name = clean_path.split("/")[2]
            self.collections.add(name)
            self.points.setdefault(name, {})
            for point in kwargs["json"]["points"]:
                self.points[name][int(point["id"])] = point
            return httpx.Response(200, json={"result": {"operation_id": 1}})
        if method == "POST" and clean_path.endswith("/points/delete"):
            name = clean_path.split("/")[2]
            for point_id in kwargs["json"]["points"]:
                self.points.setdefault(name, {}).pop(int(point_id), None)
            return httpx.Response(200, json={"result": {"operation_id": 2}})
        if method == "POST" and clean_path.endswith("/points/search"):
            name = clean_path.split("/")[2]
            result = []
            for point in self.points.get(name, {}).values():
                path_string = point["payload"].get("path_string", "")
                score = 0.96 if "复印纸" in path_string else 0.42
                result.append({"id": point["id"], "score": score, "payload": point["payload"]})
            result.sort(key=lambda item: item["score"], reverse=True)
            return httpx.Response(200, json={"result": result[: kwargs["json"].get("limit", 3)]})
        return httpx.Response(404, json={"status": {"error": f"unhandled {method} {path}"}})


def unique(prefix: str) -> str:
    return f"{prefix}-{time.time_ns()}"


def create_library(name: str) -> dict:
    response = client.post(
        "/api/v1/category-libraries",
        headers=SUPER_ADMIN,
        json={"name": name, "description": "Sprint 44", "enabled": True, "qdrant_enabled": True},
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_category(library_id: int, name: str, parent_id: int | None = None, description: str = "") -> dict:
    response = client.post(
        "/api/v1/categories",
        headers=SUPER_ADMIN,
        json={
            "name": name,
            "category_library_id": library_id,
            "parent_category_id": parent_id,
            "description": description,
            "enabled": True,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_qdrant_health_collection_lifecycle_and_category_sync(monkeypatch):
    fake = FakeQdrant()
    monkeypatch.setattr(main, "qdrant_request", fake)

    health = client.get("/api/v1/health/qdrant")
    assert health.status_code == 200, health.text
    assert health.json()["status"] == "available"

    library = create_library(unique("sprint44-lib"))
    collection = f"category_library_{library['id']}"
    assert collection in fake.collections

    level1 = create_category(library["id"], "办公用品", description="办公物资")
    level2 = create_category(library["id"], "纸张", level1["id"], "办公纸张")
    level3 = create_category(library["id"], "复印纸", level2["id"], "A4打印复印纸")
    assert fake.points[collection][level3["id"]]["payload"]["path_string"] == "办公用品 > 纸张 > 复印纸"

    updated = client.put(
        f"/api/v1/categories/{level3['id']}",
        headers=SUPER_ADMIN,
        json={"name": "A4复印纸", "description": "白色办公打印复印纸"},
    )
    assert updated.status_code == 200, updated.text
    assert fake.points[collection][level3["id"]]["payload"]["path_string"] == "办公用品 > 纸张 > A4复印纸"

    deleted = client.delete(f"/api/v1/categories/{level3['id']}", headers=SUPER_ADMIN)
    assert deleted.status_code == 200, deleted.text
    assert level3["id"] not in fake.points[collection]


def test_material_category_match_and_reembed(monkeypatch):
    fake = FakeQdrant()
    monkeypatch.setattr(main, "qdrant_request", fake)

    library = create_library(unique("sprint44-match-lib"))
    level1 = create_category(library["id"], "办公用品")
    level2 = create_category(library["id"], "纸张", level1["id"])
    level3 = create_category(library["id"], "复印纸", level2["id"])

    reembed = client.post(f"/api/v1/category-libraries/{library['id']}/re-embed", headers=SUPER_ADMIN)
    assert reembed.status_code == 200, reembed.text
    assert reembed.json()["processed"] >= 3

    response = client.post(
        "/api/v1/ai/material-category-match",
        headers=SUPER_ADMIN,
        json={
            "material_name": "A4复印纸",
            "brand": "晨光",
            "description": "办公打印用白色复印纸",
            "category_library_ids": [library["id"]],
        },
    )
    assert response.status_code == 200, response.text
    matches = response.json()["matches"]
    assert 1 <= len(matches) <= 3
    assert matches == sorted(matches, key=lambda item: item["score"], reverse=True)
    assert matches[0]["category"]["id"] == level3["id"]
    assert 0 <= matches[0]["confidence"] <= 1

    empty = client.post(
        "/api/v1/ai/material-category-match",
        headers=SUPER_ADMIN,
        json={"material_name": "A4复印纸", "category_library_ids": []},
    )
    assert empty.status_code == 200, empty.text
    assert empty.json()["matches"] == []

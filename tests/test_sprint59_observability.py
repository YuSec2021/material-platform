import os
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient
from sqlalchemy import inspect

from backend.app.database import SessionLocal, engine, sanitize_sql_statement
from backend.app.main import app, ensure_slow_query_schema
from backend.app.models import SlowQueryLog


def clear_slow_query_log() -> None:
    ensure_slow_query_schema()
    db = SessionLocal()
    try:
        db.query(SlowQueryLog).delete()
        db.commit()
    finally:
        db.close()


class Sprint59ObservabilityTest(unittest.TestCase):
    def test_metrics_endpoint_exposes_prometheus_text_and_updates_for_health_route(self):
        with TestClient(app) as client:
            initial = client.get("/metrics")
            self.assertEqual(initial.status_code, 200, initial.text)
            self.assertIn("text/plain", initial.headers.get("content-type", ""))
            self.assertIn("# HELP", initial.text)
            self.assertIn("# TYPE", initial.text)

            for _ in range(3):
                response = client.get("/health")
                self.assertEqual(response.status_code, 200, response.text)

            updated = client.get("/metrics")
            self.assertEqual(updated.status_code, 200, updated.text)
            self.assertIn('http_requests_total{method="GET",route="/health",status_code="200"}', updated.text)
            self.assertIn(
                'http_request_duration_seconds_count{method="GET",route="/health",status_code="200"}',
                updated.text,
            )
            self.assertNotEqual(initial.text, updated.text)

    def test_slow_query_threshold_zero_persists_rows_and_read_api_returns_bare_array(self):
        previous_threshold = os.environ.get("SLOW_SQL_THRESHOLD_MS")
        os.environ["SLOW_SQL_THRESHOLD_MS"] = "0"
        try:
            with TestClient(app) as client:
                clear_slow_query_log()
                response = client.get("/api/v1/category-libraries")
                self.assertEqual(response.status_code, 200, response.text)

                slow_queries = client.get("/api/v1/observability/slow-queries?limit=20")
                self.assertEqual(slow_queries.status_code, 200, slow_queries.text)
                items = slow_queries.json()
                self.assertIsInstance(items, list)
                self.assertGreaterEqual(len(items), 1)

                first = items[0]
                self.assertIsInstance(first["duration_ms"], (int, float))
                self.assertGreaterEqual(first["duration_ms"], 0)
                self.assertIn("timestamp", first)
                self.assertTrue(first["statement"] or first["operation"])
                lowered = first["statement"].lower()
                for forbidden in ["bearer ", "password=", "token=", "postgresql://", "postgres://"]:
                    self.assertNotIn(forbidden, lowered)

                table_names = set(inspect(engine).get_table_names())
                self.assertIn("slow_query_log", table_names)
                db = SessionLocal()
                try:
                    persisted_count = db.query(SlowQueryLog).count()
                finally:
                    db.close()
                self.assertGreaterEqual(persisted_count, len(items))
        finally:
            if previous_threshold is None:
                os.environ.pop("SLOW_SQL_THRESHOLD_MS", None)
            else:
                os.environ["SLOW_SQL_THRESHOLD_MS"] = previous_threshold

    def test_default_slow_query_threshold_does_not_log_ordinary_fast_queries(self):
        previous_threshold = os.environ.get("SLOW_SQL_THRESHOLD_MS")
        os.environ["SLOW_SQL_THRESHOLD_MS"] = "200"
        try:
            with TestClient(app) as client:
                clear_slow_query_log()
                response = client.get("/api/v1/category-libraries")
                self.assertEqual(response.status_code, 200, response.text)

                slow_queries = client.get("/api/v1/observability/slow-queries?limit=20")
                self.assertEqual(slow_queries.status_code, 200, slow_queries.text)
                self.assertEqual(slow_queries.json(), [])
        finally:
            if previous_threshold is None:
                os.environ.pop("SLOW_SQL_THRESHOLD_MS", None)
            else:
                os.environ["SLOW_SQL_THRESHOLD_MS"] = previous_threshold

    def test_sql_statement_sanitizer_redacts_common_secret_literals(self):
        raw = "SELECT * FROM config WHERE password='abc' AND token=\"xyz\" AND note='Bearer secret-token'"
        sanitized = sanitize_sql_statement(raw).lower()
        self.assertIn("<redacted>", sanitized)
        self.assertNotIn("password='abc'", sanitized)
        self.assertNotIn('token="xyz"', sanitized)
        self.assertNotIn("bearer secret-token", sanitized)


if __name__ == "__main__":
    unittest.main()

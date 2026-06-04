import os
import time
import unittest

os.environ.setdefault("MATERIAL_RETRIEVAL_TEST", "1")

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def web_vital_payload(metric: str, token: str, value: float = 123.4) -> dict:
    return {
        "metric": metric,
        "value": value,
        "rating": "good",
        "client_metric_id": f"sprint60-{metric.lower()}-{token}",
        "navigation_type": "navigate",
        "url": "http://localhost:5173/materials",
        "path": "/materials",
        "user_agent": "sprint60-test",
        "timestamp": "2026-06-04T00:00:00Z",
    }


class Sprint60WebVitalsTelemetryApiTest(unittest.TestCase):
    def unique_token(self) -> str:
        return str(time.time_ns())[-10:]

    def test_supported_metrics_are_created_and_queryable(self):
        token = self.unique_token()
        for metric in ["LCP", "CLS", "INP", "FID", "TTFB"]:
            payload = web_vital_payload(metric, token, value=88.2)
            response = client.post("/api/v1/telemetry/web-vitals", json=payload)
            self.assertEqual(response.status_code, 201, response.text)
            created = response.json()
            self.assertIsInstance(created["id"], int)
            for key, expected in payload.items():
                self.assertEqual(created[key], expected)

            query = client.get(
                "/api/v1/telemetry/web-vitals",
                params={"client_metric_id": payload["client_metric_id"]},
            )
            self.assertEqual(query.status_code, 200, query.text)
            records = query.json()
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["id"], created["id"])

    def test_invalid_metric_is_rejected_without_persistence(self):
        token = self.unique_token()
        payload = web_vital_payload("BAD_METRIC", token)
        response = client.post("/api/v1/telemetry/web-vitals", json=payload)
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIn("metric", response.text)

        query = client.get(
            "/api/v1/telemetry/web-vitals",
            params={"client_metric_id": payload["client_metric_id"]},
        )
        self.assertEqual(query.status_code, 200, query.text)
        self.assertEqual(query.json(), [])


if __name__ == "__main__":
    unittest.main()

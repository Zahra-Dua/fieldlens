import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FAKE_TFLITE = b"\x1c\x00\x00\x00TFL3" + b"\x00" * 64


class StubPredictor:
    """Stands in for the real model: these tests are about the API, not about LiteRT."""

    def __init__(self, path, version):
        self.version = version


@pytest.fixture
def client(tmp_path):
    # `with` runs the lifespan (startup/shutdown); tmp_path keeps tests off real data.
    with TestClient(create_app(tmp_path, None, StubPredictor)) as c:
        yield c


def upload(client, version="1.0.0", platforms=("android", "ios"), data=FAKE_TFLITE):
    return client.post(
        "/models",
        data={"version": version, "platforms": list(platforms),
              "quantization": "float16", "accuracy": "0.91"},
        files={"file": ("m.tflite", data, "application/octet-stream")},
    )


def promote(client, version, status):
    return client.patch(f"/models/{version}/status", json={"status": status})


def test_upload_creates_draft(client):
    r = upload(client)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "draft"
    assert body["size_bytes"] == len(FAKE_TFLITE)
    assert len(body["sha256"]) == 64


def test_upload_rejects_non_tflite(client):
    r = upload(client, data=b"hello world, not a model")
    assert r.status_code == 422
    assert "TFL3" in r.json()["detail"]          # rejected for the RIGHT reason


def test_rejected_upload_leaves_nothing_behind(client):
    upload(client, data=b"hello world, not a model")
    assert client.get("/models").json() == []


def test_upload_rejects_bad_version(client):
    r = upload(client, version="v1")
    assert r.status_code == 422
    assert any("version" in err["loc"] for err in r.json()["detail"])


def test_duplicate_upload_is_409(client):
    upload(client)
    assert upload(client).status_code == 409


def test_latest_is_404_until_promoted_then_changes(client):
    upload(client, "1.0.0")
    assert client.get("/models/latest", params={"platform": "android"}).status_code == 404
    assert promote(client, "1.0.0", "staged").status_code == 200
    assert promote(client, "1.0.0", "production").status_code == 200
    assert client.get("/models/latest", params={"platform": "android"}).json()["version"] == "1.0.0"

    upload(client, "1.1.0")
    promote(client, "1.1.0", "staged")
    promote(client, "1.1.0", "production")
    assert client.get("/models/latest", params={"platform": "android"}).json()["version"] == "1.1.0"
    assert client.get("/models/1.0.0").json()["status"] == "staged"


def test_cannot_skip_staging(client):
    upload(client)
    assert promote(client, "1.0.0", "production").status_code == 409


def test_download_returns_exact_bytes(client):
    upload(client)
    r = client.get("/models/1.0.0/download")
    assert r.status_code == 200
    assert r.content == FAKE_TFLITE
    assert r.headers["x-model-sha256"] == client.get("/models/1.0.0").json()["sha256"]


def test_unknown_version_404(client):
    assert client.get("/models/9.9.9").status_code == 404
    assert client.get("/models/9.9.9/download").status_code == 404


def test_registry_survives_restart(tmp_path):
    with TestClient(create_app(tmp_path, None, StubPredictor)) as c:
        upload(c)
    with TestClient(create_app(tmp_path, None, StubPredictor)) as c:
        assert c.get("/models/1.0.0").status_code == 200


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_openapi_lists_every_route(client):
    paths = client.get("/openapi.json").json()["paths"]
    for p in ["/health", "/models", "/models/latest", "/models/{version}",
              "/models/{version}/status", "/models/{version}/download"]:
        assert p in paths


def test_health_shows_no_model_until_promoted(client):
    assert client.get("/health").json()["model_loaded"] is False
    upload(client)
    promote(client, "1.0.0", "staged")
    promote(client, "1.0.0", "production")
    health = client.get("/health").json()
    assert health["model_loaded"] is True
    assert health["model_version"] == "1.0.0"


def test_predict_is_503_without_a_model(client):
    r = client.post("/predict", files={"file": ("x.jpg", b"whatever", "image/jpeg")})
    assert r.status_code == 503
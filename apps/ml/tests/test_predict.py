"""Tests that run the REAL model on REAL photos.

Fixtures: tests/fixtures/<class>_<n>.jpg  e.g. glass_1.jpg, metal_1.jpg, ...
Use clear photos taken from the TEST split (never train), one or two per class.
"""

import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import BUNDLED_MODEL, create_app
from app.predictor import CLASSES

FIXTURES = Path(__file__).parent / "fixtures"
IMAGES = sorted(FIXTURES.glob("*.jpg"))


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    # No predictor_factory override: this loads the real bundled model, once per module.
    with TestClient(create_app(tmp_path_factory.mktemp("data"))) as c:
        yield c


def post_image(client, data: bytes, name="photo.jpg"):
    return client.post("/predict", files={"file": (name, data, "image/jpeg")})


def test_bundled_model_and_fixtures_exist():
    assert BUNDLED_MODEL.exists(), f"missing {BUNDLED_MODEL}"
    labels = {p.name.split("_")[0].upper() for p in IMAGES}
    assert labels == set(CLASSES), f"need a fixture for every class, have {sorted(labels)}"


@pytest.mark.parametrize("path", IMAGES, ids=lambda p: p.name)
def test_known_image_gets_known_label(client, path):
    expected = path.name.split("_")[0].upper()
    r = post_image(client, path.read_bytes(), path.name)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["label"] == expected, f"{path.name}: got {body['label']} ({body['confidence']:.2f})"
    assert body["confidence"] > 0.5
    assert set(body["scores"]) == set(CLASSES)
    assert sum(body["scores"].values()) == pytest.approx(1.0, abs=1e-3)   # softmax
    assert body["model_version"] == "bundled-float32"
    assert body["latency_ms"] > 0


def test_not_an_image_is_422(client):
    r = post_image(client, b"definitely not a picture")
    assert r.status_code == 422
    assert "image" in r.json()["detail"].lower()


def test_png_with_alpha_channel_works(client):
    buf = io.BytesIO()
    Image.new("RGBA", (400, 300), (120, 120, 120, 200)).save(buf, "PNG")
    assert post_image(client, buf.getvalue(), "x.png").status_code == 200


def test_concurrent_predictions_are_consistent(client):
    """The lock must keep threads from corrupting each other's tensors."""
    data = IMAGES[0].read_bytes()
    single = post_image(client, data).json()["scores"]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: post_image(client, data), range(24)))
    for r in results:
        assert r.status_code == 200
        for cls, p in r.json()["scores"].items():
            assert p == pytest.approx(single[cls], abs=1e-4)


def test_health_reports_loaded_model(client):
    body = client.get("/health").json()
    assert body["model_loaded"] is True
    assert body["model_version"] == "bundled-float32"

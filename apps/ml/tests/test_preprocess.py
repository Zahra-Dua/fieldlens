"""Preprocessing tests. They need no model: only the resize maths."""

import io

import numpy as np
from PIL import Image

from app.predictor import IMAGE_SIZE, preprocess, resize_bilinear_tf


def png_bytes(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, "PNG")
    return buf.getvalue()


def test_output_shape_dtype_and_range():
    arr = np.random.default_rng(0).integers(0, 256, (300, 500, 3), dtype=np.uint8)
    out = preprocess(png_bytes(arr))
    assert out.shape == (1, IMAGE_SIZE, IMAGE_SIZE, 3)
    assert out.dtype == np.float32
    assert 0.0 <= out.min() and out.max() <= 255.0


def test_a_224_image_passes_through_unchanged():
    arr = np.random.default_rng(1).integers(0, 256, (224, 224, 3), dtype=np.uint8)
    assert np.array_equal(preprocess(png_bytes(arr))[0], arr.astype(np.float32))


def test_constant_image_stays_constant():
    out = resize_bilinear_tf(np.full((1000, 700, 3), 77, np.uint8), 224, 224)
    assert np.allclose(out, 77.0)


def test_linear_ramp_is_sampled_at_half_pixel_centres():
    width = 800
    ramp = np.tile(np.arange(width, dtype=np.float32)[None, :, None], (1000, 1, 3))
    out = resize_bilinear_tf(ramp, 224, 224)
    expected = (np.arange(224) + 0.5) * (width / 224) - 0.5
    assert np.allclose(out[0, :, 0], expected, atol=1e-3)


def test_no_antialiasing_when_shrinking():
    """Every 4th column is white. Training-style resize samples between the black
    columns and stays black; an antialiasing resize would average to about 64."""
    arr = np.zeros((896, 896, 3), dtype=np.uint8)
    arr[:, ::4, :] = 255
    out = resize_bilinear_tf(arr, 224, 224)
    assert out.max() < 1.0
    pil = np.asarray(Image.fromarray(arr).resize((224, 224), Image.Resampling.BILINEAR))
    assert pil.mean() > 30   # shows what PIL would have done instead


def test_rgba_alpha_is_dropped_not_blended():
    rgba = np.zeros((300, 300, 4), dtype=np.uint8)
    rgba[..., 0] = 200
    rgba[..., 3] = 10
    assert np.allclose(preprocess(png_bytes(rgba))[0, :, :, 0], 200.0)
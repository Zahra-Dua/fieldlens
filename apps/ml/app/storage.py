"""Where model files live on disk, and how we check them before keeping them."""

import hashlib
from pathlib import Path

# A real .tflite file is a FlatBuffer: bytes 4..8 are the file identifier "TFL3".
TFLITE_MAGIC = b"TFL3"
MAX_BYTES = 50 * 1024 * 1024  # 50 MB; our biggest variant is under 4 MB


class InvalidModelFile(Exception):
    pass


def validate_tflite(data: bytes) -> None:
    if not data:
        raise InvalidModelFile("Uploaded file is empty")
    if len(data) > MAX_BYTES:
        raise InvalidModelFile(f"File is larger than {MAX_BYTES // (1024 * 1024)} MB")
    if data[4:8] != TFLITE_MAGIC:
        raise InvalidModelFile("Not a TFLite model (missing 'TFL3' header)")


class ModelStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, version: str) -> Path:
        # `version` was already checked against the semver regex, so it can't contain
        # slashes or '..'. That is what makes this path safe.
        return self.root / f"fieldlens-{version}.tflite"

    def save(self, version: str, data: bytes) -> tuple[int, str]:
        """Write atomically; return (size_bytes, sha256 hex)."""
        validate_tflite(data)
        target = self.path_for(version)
        tmp = target.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(target)
        return len(data), hashlib.sha256(data).hexdigest()

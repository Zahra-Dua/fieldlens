"""Model version registry: the rules for which version is live.

Rules (the part the tests protect):
  * A new version always starts as `draft`.
  * Allowed moves:  draft -> staged,  staged -> production,
                    staged -> draft,  production -> staged (demote / rollback step).
    You cannot jump draft -> production: a build must be staged first.
  * At most ONE version is `production`. Promoting another one demotes the
    current production version to `staged`, so rolling back is just promoting it again.
  * `latest(platform)` = the production version that supports that platform.

Metadata is kept in a JSON file, written atomically (temp file + rename), so a
crash mid-write cannot leave a half-written registry. A lock makes it safe when
FastAPI runs plain `def` routes in several threads at once.
"""

import json
import os
import threading
from datetime import UTC, datetime
from pathlib import Path

from .schemas import ModelCreate, ModelVersion, Platform, Status


class RegistryError(Exception):
    """Base class; the API layer turns these into HTTP errors."""


class VersionExists(RegistryError):
    pass


class VersionNotFound(RegistryError):
    pass


class InvalidTransition(RegistryError):
    pass


ALLOWED = {
    Status.DRAFT: {Status.STAGED},
    Status.STAGED: {Status.PRODUCTION, Status.DRAFT},
    Status.PRODUCTION: {Status.STAGED},
}


def _semver_key(v: str) -> tuple[int, int, int]:
    major, minor, patch = (int(p) for p in v.split("."))
    return major, minor, patch


def _now() -> datetime:
    return datetime.now(UTC)


class Registry:
    def __init__(self, path: Path | None = None) -> None:
        self._path = path          # None = in memory only (used by tests)
        self._lock = threading.RLock()
        self._items: dict[str, ModelVersion] = {}
        if path is not None and path.exists():
            raw = json.loads(path.read_text(encoding="utf-8"))
            self._items = {v["version"]: ModelVersion.model_validate(v) for v in raw}

    # ---- reads -------------------------------------------------------
    def list(self) -> list[ModelVersion]:
        with self._lock:
            return sorted(self._items.values(), key=lambda m: _semver_key(m.version), reverse=True)

    def get(self, version: str) -> ModelVersion:
        with self._lock:
            try:
                return self._items[version]
            except KeyError:
                raise VersionNotFound(f"No model version {version}") from None

    def production(self) -> ModelVersion | None:
        with self._lock:
            return next((m for m in self._items.values() if m.status is Status.PRODUCTION), None)

    def latest(self, platform: Platform) -> ModelVersion:
        with self._lock:
            prod = self.production()
            if prod is None or platform not in prod.platforms:
                raise VersionNotFound(f"No production model for platform '{platform}'")
            return prod

    # ---- writes ------------------------------------------------------
    def add(self, meta: ModelCreate, size_bytes: int = 0, sha256: str = "") -> ModelVersion:
        with self._lock:
            if meta.version in self._items:
                raise VersionExists(f"Version {meta.version} already exists")
            now = _now()
            item = ModelVersion(
                **meta.model_dump(), status=Status.DRAFT,
                size_bytes=size_bytes, sha256=sha256, created_at=now, updated_at=now,
            )
            self._items[item.version] = item
            self._save()
            return item

    def set_status(self, version: str, new: Status) -> ModelVersion:
        with self._lock:
            item = self.get(version)
            if new is item.status:
                return item  # already there: do nothing, not an error
            if new not in ALLOWED[item.status]:
                raise InvalidTransition(f"Cannot move {version} from {item.status} to {new}")
            if new is Status.PRODUCTION:
                current = self.production()
                if current is not None:
                    self._items[current.version] = current.model_copy(
                        update={"status": Status.STAGED, "updated_at": _now()})
            updated = item.model_copy(update={"status": new, "updated_at": _now()})
            self._items[version] = updated
            self._save()
            return updated

    # ---- persistence -------------------------------------------------
    def _save(self) -> None:
        if self._path is None:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        data = [m.model_dump(mode="json") for m in self._items.values()]
        tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        os.replace(tmp, self._path)   # atomic swap

"""FieldLens ML service: model registry + cloud-fallback inference.

Run from the repo root:
    python -m uv --directory apps/ml run uvicorn app.main:app --reload
Docs:  http://127.0.0.1:8000/docs
"""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from .predictor import InvalidImage, Predictor
from .registry import InvalidTransition, Registry, VersionExists, VersionNotFound
from .schemas import (
    ErrorResponse,
    HealthResponse,
    ModelCreate,
    ModelVersion,
    Platform,
    PredictResponse,
    PromoteRequest,
    SemVer,
)
from .storage import InvalidModelFile, ModelStorage

ML_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = ML_ROOT / "storage"
# Used until a version is promoted to production, so /predict works on a fresh install.
BUNDLED_MODEL = ML_ROOT / "models" / "fieldlens_float32.tflite"


log = logging.getLogger("fieldlens.ml")


def load_predictor(registry, storage, bundled, factory=Predictor):
    """The production model if there is one, else the bundled fallback, else None."""
    prod = registry.production()
    if prod is not None and storage.path_for(prod.version).exists():
        return factory(storage.path_for(prod.version), prod.version)
    if bundled is not None and bundled.exists():
        return factory(bundled, "bundled-float32")
    return None


def create_app(
    data_dir: Path | None = None,
    bundled_model: Path | None = BUNDLED_MODEL,
    predictor_factory=Predictor,   # tests swap in a stub so they don't need a real model
) -> FastAPI:
    data_dir = data_dir or Path(os.environ.get("FIELDLENS_ML_DATA", DEFAULT_DATA_DIR))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Runs ONCE at startup. Everything expensive is built here, not per request.
        app.state.registry = Registry(data_dir / "registry.json")
        app.state.storage = ModelStorage(data_dir / "models")
        # Load the model ONCE here, not per request: reading + preparing it takes far
        # longer than a single prediction.
        app.state.predictor = load_predictor(app.state.registry, app.state.storage, bundled_model, predictor_factory)
        yield
        # (anything after `yield` runs at shutdown)

    app = FastAPI(
        title="FieldLens ML Service",
        version="0.1.0",
        description="Owns the model lifecycle: upload versions, promote them, "
                    "serve the latest one to apps, and run cloud-fallback inference.",
        lifespan=lifespan,
    )

    # ---- turn registry errors into proper HTTP responses -----------------
    def _err(status: int):
        async def handler(_: Request, exc: Exception):
            return JSONResponse(status_code=status, content={"detail": str(exc)})
        return handler

    app.add_exception_handler(VersionNotFound, _err(404))
    app.add_exception_handler(VersionExists, _err(409))
    app.add_exception_handler(InvalidTransition, _err(409))
    app.add_exception_handler(InvalidModelFile, _err(422))
    app.add_exception_handler(InvalidImage, _err(422))

    # ---- dependencies ----------------------------------------------------
    def get_registry(request: Request) -> Registry:
        return request.app.state.registry

    def get_storage(request: Request) -> ModelStorage:
        return request.app.state.storage

    Reg = Annotated[Registry, Depends(get_registry)]
    Store = Annotated[ModelStorage, Depends(get_storage)]

    def get_predictor(request: Request) -> Predictor:
        predictor = request.app.state.predictor
        if predictor is None:
            raise HTTPException(status_code=503, detail="No model is loaded")
        return predictor

    Pred = Annotated[Predictor, Depends(get_predictor)]

    # ---- routes ----------------------------------------------------------
    # NOTE: all of these are plain `def`, not `async def`. They do blocking work
    # (disk, hashing, locks), so FastAPI runs them in its threadpool and the
    # event loop stays free. See docs/ml-service.md.

    @app.get("/health", response_model=HealthResponse, tags=["system"])
    def health(request: Request):
        predictor = request.app.state.predictor
        return HealthResponse(
            model_loaded=predictor is not None,
            model_version=predictor.version if predictor else None,
        )

    @app.post(
        "/predict", response_model=PredictResponse, tags=["inference"],
        responses={422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
        summary="Classify an uploaded photo (cloud fallback)",
    )
    def predict(file: Annotated[UploadFile, File(description="JPEG/PNG photo")], predictor: Pred):
        # Plain `def` on purpose: inference blocks the CPU, so FastAPI runs this in its
        # threadpool and the event loop keeps serving other requests.
        return predictor.predict(file.file.read())

    @app.post(
        "/models", response_model=ModelVersion, status_code=201, tags=["models"],
        responses={409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
        summary="Upload a new model version (starts as draft)",
    )
    def upload_model(
        # Each form field is declared on its own. (A single `Annotated[ModelCreate, Form()]`
        # next to a File param makes FastAPI look for ONE field called "meta".)
        version: Annotated[SemVer, Form(description="Semantic version, e.g. 1.2.0")],
        platforms: Annotated[list[Platform], Form(min_length=1)],
        quantization: Annotated[str, Form(description="float32, float16, dynamic_range or int8")],
        accuracy: Annotated[float, Form(ge=0, le=1, description="Test accuracy, 0 to 1")],
        file: Annotated[UploadFile, File(description="The .tflite file")],
        registry: Reg,
        storage: Store,
        notes: Annotated[str, Form(max_length=500)] = "",
    ):
        meta = ModelCreate(version=version, platforms=platforms, quantization=quantization,
                           accuracy=accuracy, notes=notes)
        # Fail on a duplicate version BEFORE touching the disk.
        try:
            registry.get(meta.version)
        except VersionNotFound:
            pass
        else:
            raise VersionExists(f"Version {meta.version} already exists")
        data = file.file.read()
        size, digest = storage.save(meta.version, data)
        return registry.add(meta, size_bytes=size, sha256=digest)

    @app.get("/models", response_model=list[ModelVersion], tags=["models"],
             summary="List all versions, newest first")
    def list_models(registry: Reg):
        return registry.list()

    # `/models/latest` must be declared BEFORE `/models/{version}`, otherwise
    # "latest" would be captured as a version string.
    @app.get(
        "/models/latest", response_model=ModelVersion, tags=["models"],
        responses={404: {"model": ErrorResponse}},
        summary="The production model for a platform",
    )
    def latest_model(platform: Platform, registry: Reg):
        return registry.latest(platform)

    @app.get("/models/{version}", response_model=ModelVersion, tags=["models"],
             responses={404: {"model": ErrorResponse}})
    def get_model(version: str, registry: Reg):
        return registry.get(version)

    @app.patch(
        "/models/{version}/status", response_model=ModelVersion, tags=["models"],
        responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
        summary="Promote or demote a version",
    )
    def set_status(version: str, body: PromoteRequest, request: Request, registry: Reg, storage: Store):
        item = registry.set_status(version, body.status)
        # The live model may have changed. Build the new one first, then swap the
        # reference in one assignment, so /predict never sees a half-loaded model.
        try:
            request.app.state.predictor = load_predictor(
                registry, storage, bundled_model, predictor_factory)
        except Exception:
            # A file with a valid header can still fail to load. Keep serving the old
            # model rather than going down; /health shows which version is really live.
            log.exception("Could not load the new model; keeping the previous one")
        return item

    @app.get(
        "/models/{version}/download", tags=["models"],
        response_class=FileResponse,
        responses={404: {"model": ErrorResponse}},
        summary="Download the .tflite file",
    )
    def download_model(version: str, registry: Reg, storage: Store):
        item = registry.get(version)  # 404 if unknown
        path = storage.path_for(item.version)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Model file missing on disk")
        return FileResponse(
            path, media_type="application/octet-stream",
            filename=path.name, headers={"X-Model-SHA256": item.sha256},
        )

    return app


app = create_app()
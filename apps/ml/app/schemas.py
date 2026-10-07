"""Pydantic v2 models: the shapes of everything that enters or leaves the service."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

# MAJOR.MINOR.PATCH, digits only, no leading zeros ("1.2.0" ok, "1.02.0" not).
SEMVER_PATTERN = r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$"
SemVer = Annotated[str, StringConstraints(pattern=SEMVER_PATTERN)]


class Status(StrEnum):
    DRAFT = "draft"
    STAGED = "staged"
    PRODUCTION = "production"


class Platform(StrEnum):
    ANDROID = "android"
    IOS = "ios"


class ModelCreate(BaseModel):
    """Metadata sent with an upload (the .tflite file travels alongside it)."""

    version: SemVer = Field(examples=["1.0.0"])
    platforms: list[Platform] = Field(
        min_length=1, examples=[["android", "ios"]],
        description="Which platforms this build is meant for.",
    )
    quantization: str = Field(examples=["float32", "float16", "dynamic_range", "int8"])
    accuracy: float = Field(ge=0, le=1, description="Test-split accuracy, 0 to 1.")
    notes: str = Field(default="", max_length=500)


class ModelVersion(ModelCreate):
    """A stored model version: the upload metadata plus what the service adds."""

    model_config = ConfigDict(from_attributes=True)

    status: Status = Status.DRAFT
    size_bytes: int = Field(default=0, ge=0)
    sha256: str = Field(default="", description="Hex digest of the file, for integrity checks.")
    created_at: datetime
    updated_at: datetime


class PromoteRequest(BaseModel):
    status: Status = Field(description="The status to move this version to.")


class Prediction(BaseModel):
    label: str
    confidence: float = Field(ge=0, le=1)


class PredictResponse(BaseModel):
    label: str
    confidence: float = Field(ge=0, le=1)
    scores: dict[str, float] = Field(description="Probability for every class.")
    model_version: str
    latency_ms: float


class HealthResponse(BaseModel):
    status: str = "ok"
    model_loaded: bool
    model_version: str | None = None


class ErrorResponse(BaseModel):
    detail: str

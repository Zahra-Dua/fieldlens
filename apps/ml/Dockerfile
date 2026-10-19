# syntax=docker/dockerfile:1

# ---- builder: install the locked dependencies into a virtualenv ----
FROM python:3.14-slim AS builder
RUN pip install --no-cache-dir uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Only the dependency files first, so this layer is cached until they change.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# ---- runtime: Python + the ready virtualenv + our code. No pip, no uv. ----
FROM python:3.14-slim AS runtime
RUN useradd --system --uid 1000 --create-home appuser \
 && mkdir /data && chown appuser /data
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY app ./app
# The bundled fallback model (used until a version is promoted to production).
COPY models ./models
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    FIELDLENS_ML_DATA=/data
USER appuser
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

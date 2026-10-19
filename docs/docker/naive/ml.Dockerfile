# BASELINE ONLY: the "before" image for the size comparison. Do not use.
# Single stage, full Python image, pip + uv stay in the image, runs as root.
FROM python:3.14
WORKDIR /app
COPY . .
RUN pip install uv && uv sync --frozen --no-dev --no-install-project
ENV PATH="/app/.venv/bin:$PATH" FIELDLENS_ML_DATA=/data
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

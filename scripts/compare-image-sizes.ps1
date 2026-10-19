# Builds the naive (single-stage) and the real (multi-stage) image of each app
# and prints a size table. Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/compare-image-sizes.ps1
$ErrorActionPreference = "Stop"

$apps = @("api", "ml", "web")
$rows = @()

foreach ($app in $apps) {
    Write-Host "== $app : building naive image ..." -ForegroundColor Cyan
    docker build -q -f "docs/docker/naive/$app.Dockerfile" -t "fieldlens-$app`:naive" "apps/$app" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "naive build of $app failed" }

    Write-Host "== $app : building multi-stage image ..." -ForegroundColor Cyan
    docker build -q -t "fieldlens-$app`:multistage" "apps/$app" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "multi-stage build of $app failed" }

    $before = [double](docker image inspect --format "{{.Size}}" "fieldlens-$app`:naive")
    $after  = [double](docker image inspect --format "{{.Size}}" "fieldlens-$app`:multistage")

    $rows += [pscustomobject]@{
        App          = $app
        "Before (MB)" = [math]::Round($before / 1MB, 1)
        "After (MB)"  = [math]::Round($after / 1MB, 1)
        "Saved"       = ("{0:P0}" -f (1 - $after / $before))
    }
}

$rows | Format-Table -AutoSize
Write-Host "Copy this table into docs/docker.md" -ForegroundColor Green

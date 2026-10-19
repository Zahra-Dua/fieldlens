# Checks that no secret from your local .env ended up inside the built images.
# Run from the repo root, after "docker compose build":
#   .\scripts\check-image-secrets.ps1
# It never prints your secret values.

# "Continue", not "Stop": Windows PowerShell 5.1 treats any text a program
# writes to stderr as a crash when this is "Stop".
$ErrorActionPreference = "Continue"

# 1. Collect secret values (any key containing PASSWORD or SECRET) from .env
$secrets = @{}
foreach ($line in Get-Content .env) {
    if ($line -match '^\s*([A-Z0-9_]*(PASSWORD|SECRET)[A-Z0-9_]*)\s*=\s*(.+?)\s*$') {
        $secrets[$Matches[1]] = $Matches[3].Trim('"').Trim("'")
    }
}
Write-Host "Checking $($secrets.Count) secret values: $($secrets.Keys -join ', ')"

$images = @("fieldlens-api", "fieldlens-ml", "fieldlens-web")
$failed = $false

foreach ($img in $images) {
    Write-Host "`n== $img" -ForegroundColor Cyan

    # 2. Runs as non-root?
    $uid = (docker run --rm --entrypoint id $img -u 2>$null | Out-String).Trim()
    if ($uid -eq "0" -or $uid -eq "") { Write-Host "  FAIL: runs as root (or id failed)" -ForegroundColor Red; $failed = $true }
    else { Write-Host "  ok: runs as non-root (uid $uid)" -ForegroundColor Green }

    # 3. Any .env file inside the image? (errors go to /dev/null inside the container)
    $envFiles = docker run --rm --entrypoint sh $img -c 'find / -name \.env\* -not -path /proc/\* -not -path /sys/\* -not -path \*/node_modules/\* 2>/dev/null' 2>$null
    if ($envFiles) { Write-Host "  FAIL: .env file found: $envFiles" -ForegroundColor Red; $failed = $true }
    else { Write-Host "  ok: no .env file in the image" -ForegroundColor Green }

    # 4. Any secret in the layer history or in the image's own env settings?
    $meta = (docker history --no-trunc $img 2>$null | Out-String) + (docker image inspect $img 2>$null | Out-String)
    foreach ($key in $secrets.Keys) {
        if ($meta.Contains($secrets[$key])) {
            Write-Host "  FAIL: value of $key is in history/config" -ForegroundColor Red; $failed = $true
        }
    }
    Write-Host "  ok: history and config checked" -ForegroundColor Green

    # 5. Any secret inside any file of the image?
    foreach ($key in $secrets.Keys) {
        $hits = docker run --rm -e "NEEDLE=$($secrets[$key])" --entrypoint sh $img -c 'grep -rIlF --exclude-dir=proc --exclude-dir=sys --exclude-dir=dev -e $NEEDLE / 2>/dev/null' 2>$null
        if ($hits) { Write-Host "  FAIL: value of $key found in files: $hits" -ForegroundColor Red; $failed = $true }
    }
    Write-Host "  ok: files scanned" -ForegroundColor Green
}

if ($failed) { Write-Host "`nSECRETS CHECK FAILED" -ForegroundColor Red; exit 1 }
Write-Host "`nSECRETS CHECK PASSED" -ForegroundColor Green

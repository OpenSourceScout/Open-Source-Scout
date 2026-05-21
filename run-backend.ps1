# Start the FastAPI app without --reload (more stable on Windows + OneDrive).
# Default port 8003 — use 8001 only if nothing else is bound there:  .\run-backend.ps1 -ApiPort 8001
param([int]$ApiPort = 8003)

$ErrorActionPreference = "SilentlyContinue"

foreach ($conn in Get-NetTCPConnection -LocalPort $ApiPort -State Listen) {
    Stop-Process -Id $conn.OwningProcess -Force
}
Start-Sleep -Seconds 1

$frontend = Join-Path $PSScriptRoot "frontend"
if (Test-Path $frontend) {
    Push-Location $frontend
    npx --yes kill-port $ApiPort 2>$null
    Pop-Location
}
Start-Sleep -Seconds 1

Set-Location $PSScriptRoot
Write-Host "API: http://127.0.0.1:$ApiPort"
Write-Host "Clone cache: $env:LOCALAPPDATA\OpenSourceScout\repos"
Write-Host "Frontend: cd frontend; npm run dev   (Vite defaults to proxy http://localhost:$ApiPort)"
$env:UV_LINK_MODE = "copy"
if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv sync 2>$null
    uv run python -m uvicorn app.api:app --port $ApiPort
    exit $LASTEXITCODE
}

$python = "python"
if (Test-Path ".\.venv\Scripts\python.exe") {
    $python = ".\.venv\Scripts\python.exe"
} elseif (Test-Path ".\venv\Scripts\python.exe") {
    $python = ".\venv\Scripts\python.exe"
}

& $python -m uvicorn app.api:app --port $ApiPort

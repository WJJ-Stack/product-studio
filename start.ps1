$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:PYTHONPATH = (Get-Location).Path
& "$PSScriptRoot\.venv\Scripts\python.exe" -m uvicorn backend.app:app --host 0.0.0.0 --port 8000

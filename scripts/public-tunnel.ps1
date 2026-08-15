$ErrorActionPreference = 'Stop'
$exeDir = 'D:\devtools\cloudflared'
$exe = Join-Path $exeDir 'cloudflared.exe'
if (-not (Test-Path $exe)) {
  New-Item -ItemType Directory -Force -Path $exeDir | Out-Null
  $url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  curl.exe -L --fail -o $exe $url
}
& $exe tunnel --url http://127.0.0.1:8000

$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNode = Join-Path $taskRoot '.tools/node-v24.21.0-win-x64'
if (Test-Path (Join-Path $taskNode 'node.exe')) { $env:PATH = $taskNode + ';' + $env:PATH }
$env:npm_config_cache = Join-Path $taskRoot '.tools/npm-cache'

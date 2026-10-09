# Windows portable runtimes, downloaded only into this repository.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskTools = Join-Path $taskRoot '.tools'
New-Item -ItemType Directory -Force -Path $taskTools | Out-Null
function Get-TaskDownload([string]$Uri, [string]$Name) {
    $target = Join-Path $taskTools $Name
    Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $target
    return $target
}
function Assert-TaskHash([string]$Path, [string]$Algorithm, [string]$Expected) {
    if ((Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLower() -ne $Expected.ToLower()) {
        throw "Checksum mismatch for $Path. Do not extract this archive."
    }
}
$taskNodeVersion = 'v24.21.0'
$taskNodeArchive = "node-$taskNodeVersion-win-x64.zip"
$taskSums = Get-TaskDownload "https://nodejs.org/dist/$taskNodeVersion/SHASUMS256.txt" 'node-shasums.txt'
$taskNodeHash = ((Get-Content -LiteralPath $taskSums | Where-Object { $_ -match "  $([regex]::Escape($taskNodeArchive))$" }) -split '\s+')[0]
if (-not $taskNodeHash) { throw 'Node archive is not listed in the official checksum manifest.' }
$taskNodeZip = Get-TaskDownload "https://nodejs.org/dist/$taskNodeVersion/$taskNodeArchive" 'node.zip'
Assert-TaskHash $taskNodeZip 'SHA256' $taskNodeHash
Expand-Archive -LiteralPath $taskNodeZip -DestinationPath $taskTools -Force
$taskJavaZip = Get-TaskDownload 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip' 'java.zip'
Assert-TaskHash $taskJavaZip 'SHA256' 'd35f31e712f0fcf6ac5a093edc90204fbff22f720ba3950bd09d331d5e621636'
Expand-Archive -LiteralPath $taskJavaZip -DestinationPath $taskTools -Force
try {
    $taskFusekiZip = Get-TaskDownload 'https://downloads.apache.org/jena/binaries/apache-jena-fuseki-6.2.0.zip' 'fuseki.zip'
} catch {
    $taskFusekiZip = Get-TaskDownload 'https://archive.apache.org/dist/jena/binaries/apache-jena-fuseki-6.2.0.zip' 'fuseki.zip'
}
Assert-TaskHash $taskFusekiZip 'SHA512' '46e5d798faf80fe5f4b32318750071b9172315f9d86bb3aa3ba4d5e94abe2e21cd194eab349d491a203c934c6e59b370a671b338f2a413110e859dc628ffe934'
Expand-Archive -LiteralPath $taskFusekiZip -DestinationPath $taskTools -Force
Write-Output 'Portable Node.js, Java 21 and Fuseki installed in .tools. No system installation was changed.'
Write-Output 'Run: . ./scripts/use-local-runtime.ps1'

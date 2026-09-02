param(
    [ValidateSet('win-x64', 'win-arm64')] [string] $Runtime = 'win-x64'
)

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$project = Join-Path $workspace 'src\ColorNotes.App\ColorNotes.App.csproj'
$configuration = Join-Path $workspace 'NuGet.Config'
$releaseRoot = Join-Path $workspace 'artifacts\release'
$publishDirectory = Join-Path $releaseRoot "ColorNotes-$Runtime"
$archivePath = Join-Path $releaseRoot "ColorNotes-$Runtime.zip"
$portableDotnet = Join-Path $workspace '.dotnet\dotnet.exe'
$dotnet = if (Test-Path -LiteralPath $portableDotnet) { $portableDotnet } else { 'dotnet' }

$env:DOTNET_CLI_HOME = Join-Path $workspace '.dotnet-home'
$env:APPDATA = Join-Path $workspace '.dotnet-home\AppData'
$env:NUGET_PACKAGES = Join-Path $workspace '.dotnet-home\packages'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
New-Item -ItemType Directory -Force -Path $env:APPDATA, $releaseRoot | Out-Null

& $dotnet restore $project -r $Runtime --configfile $configuration
if ($LASTEXITCODE -ne 0) { throw 'Restore failed.' }

& $dotnet publish $project -c Release -r $Runtime --self-contained true --no-restore -o $publishDirectory
if ($LASTEXITCODE -ne 0) { throw 'Publish failed.' }

Compress-Archive -Path (Join-Path $publishDirectory '*') -DestinationPath $archivePath -CompressionLevel Optimal -Force
Write-Host "Release ready: $archivePath"


param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef
)

$ErrorActionPreference = 'Stop'
$datasetPython = 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $datasetPython -PathType Leaf)) {
    throw 'Python Unsloth tidak dijumpai. Semak lokasi pemasangan Pinokio.'
}

Add-Type -AssemblyName System.Windows.Forms
$datasetDownloads = Join-Path $env:USERPROFILE 'Downloads'
$datasetPicker = New-Object System.Windows.Forms.FolderBrowserDialog
$datasetPicker.Description = 'Pilih folder dataset V4 yang mengandungi manifest-V4.json dan empat imej PNG.'
$datasetPicker.ShowNewFolderButton = $false
$datasetLatest = Get-ChildItem -LiteralPath $datasetDownloads -Directory -Filter 'FCA-V4*' |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'manifest-V4.json') } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($datasetLatest) { $datasetPicker.SelectedPath = $datasetLatest.FullName }
if ($datasetPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host 'Dibatalkan. Tiada dataset diubah.'
    return
}
$datasetSource = $datasetPicker.SelectedPath
if (-not (Test-Path -LiteralPath (Join-Path $datasetSource 'manifest-V4.json') -PathType Leaf)) {
    throw 'Folder dipilih bukan output dataset V4. manifest-V4.json tidak dijumpai.'
}

$datasetStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$datasetOutput = Join-Path $datasetDownloads ('FCA-V5-' + $datasetStamp)
$datasetHelper = Join-Path ([IO.Path]::GetTempPath()) ('FCA-V5-helper-' + $datasetStamp)
New-Item -ItemType Directory -Path $datasetHelper | Out-Null
$datasetBase = "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/dataset-v5"
$datasetFiles = @{
    'prepare.py' = 'd9bdfdf15cb69a37669c06f41a498f9c6ebbe1dfa0483877c4cc675fc4d75ec9'
    'evaluator.html' = '17fd20e980e627d2d5b16f77f88d4991bdff5cdf44850d695e2103e25ecaeaf7'
}
foreach ($datasetName in $datasetFiles.Keys) {
    $datasetPath = Join-Path $datasetHelper $datasetName
    Invoke-WebRequest -UseBasicParsing -Uri "$datasetBase/$datasetName" -OutFile $datasetPath
    $datasetDigest = (Get-FileHash -LiteralPath $datasetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($datasetDigest -ne $datasetFiles[$datasetName]) {
        throw "Fail $datasetName tidak sepadan dengan versi disemak. Skrip tidak dijalankan."
    }
}

& $datasetPython (Join-Path $datasetHelper 'prepare.py') $datasetSource $datasetOutput
if ($LASTEXITCODE -ne 0) { throw 'Dataset V5 belum berjaya dijana. Semak mesej ralat di atas.' }
Write-Host 'Dataset V5 disediakan. Latihan perlu dimulakan dalam Unsloth Studio.'
Start-Process explorer.exe -ArgumentList ('"' + $datasetOutput + '"')

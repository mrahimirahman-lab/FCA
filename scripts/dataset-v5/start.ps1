param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef,
    [switch]$UseCorrections,
    [switch]$ReviewReferences
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
$datasetPrefix = if ($UseCorrections -or $ReviewReferences) { 'FCA-V5-R1-' } else { 'FCA-V5-' }
$datasetOutput = Join-Path $datasetDownloads ($datasetPrefix + $datasetStamp)
$datasetHelper = Join-Path ([IO.Path]::GetTempPath()) ('FCA-V5-helper-' + $datasetStamp)
New-Item -ItemType Directory -Path $datasetHelper | Out-Null
$datasetBase = "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/dataset-v5"
$datasetFiles = @{
    'review.html' = '6720e6c1c8296a9d5d086fe1a3f841bd41efcdea8c2a709e368a03dae32b6dc0'
    'prepare.py' = '69b78f24ded4f628f4f5cddc83e2b7917959bbb61247be52efbcb995c1b14e76'
    'evaluator.html' = 'a16b6cfc5f9d38467bf33cd4818f5d2e57a00d5eeb763bf95d350177c5ee0570'
}
foreach ($datasetName in $datasetFiles.Keys) {
    $datasetPath = Join-Path $datasetHelper $datasetName
    Invoke-WebRequest -UseBasicParsing -Uri "$datasetBase/$datasetName" -OutFile $datasetPath
    $datasetDigest = (Get-FileHash -LiteralPath $datasetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($datasetDigest -ne $datasetFiles[$datasetName]) {
        throw "Fail $datasetName tidak sepadan dengan versi disemak. Skrip tidak dijalankan."
    }
}

if ($ReviewReferences) {
    Start-Process explorer.exe -ArgumentList ('"' + $datasetSource + '"')
    Start-Process (Join-Path $datasetHelper 'review.html')
    Write-Host 'Dalam editor: pilih manifest-V4.json dan PNG asal, lukis semula kotak, sahkan dan simpan pembetulan JSON.'
    Read-Host 'Selepas fail pembetulan disimpan, kembali ke sini dan tekan Enter' | Out-Null
}
$datasetArguments = @((Join-Path $datasetHelper 'prepare.py'), $datasetSource, $datasetOutput)
if ($UseCorrections -or $ReviewReferences) {
    $datasetCorrectionPicker = New-Object System.Windows.Forms.OpenFileDialog
    $datasetCorrectionPicker.Filter = 'Pembetulan JSON (*.json)|*.json'
    $datasetCorrectionPicker.Title = 'Pilih pembetulan-ruang-V5.json yang baru disimpan'
    $datasetCorrectionPicker.InitialDirectory = $datasetDownloads
    if ($datasetCorrectionPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        Write-Host 'Dibatalkan. Tiada dataset latihan baharu dijana.'
        return
    }
    $datasetArguments += @('--corrections', $datasetCorrectionPicker.FileName)
}
& $datasetPython @datasetArguments
if ($LASTEXITCODE -ne 0) { throw 'Dataset V5 belum berjaya dijana. Semak mesej ralat di atas.' }
Write-Host 'Dataset V5 disediakan. Latihan perlu dimulakan dalam Unsloth Studio.'
Start-Process explorer.exe -ArgumentList ('"' + $datasetOutput + '"')

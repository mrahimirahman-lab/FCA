param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef
)
$ErrorActionPreference = 'Stop'
$elementBatchPython = 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $elementBatchPython -PathType Leaf)) { throw 'Python Unsloth tidak dijumpai.' }
Add-Type -AssemblyName System.Windows.Forms
$elementReviewPicker = New-Object System.Windows.Forms.OpenFileDialog
$elementReviewPicker.Filter = 'Semakan elemen (*.json)|*.json'
$elementReviewPicker.Title = '1. Pilih semakan-elemen (6).json yang telah disahkan'
$elementReviewPicker.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
if ($elementReviewPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
$elementReviewPath = $elementReviewPicker.FileName
$elementReviewData = Get-Content -LiteralPath $elementReviewPath -Raw | ConvertFrom-Json
$elementPilotManifest = $null
$elementPossible = @()
$elementAdjacent = Join-Path (Split-Path -Parent $elementReviewPath) 'manifest-elemen.json'
if (Test-Path -LiteralPath $elementAdjacent -PathType Leaf) { $elementPossible += Get-Item -LiteralPath $elementAdjacent }
$elementPossible += Get-ChildItem -Path (Join-Path $env:USERPROFILE 'Downloads\CubiCasa-elemen-*\manifest-elemen.json') -File -ErrorAction SilentlyContinue
foreach ($elementCandidate in $elementPossible) {
    if ((Get-FileHash -LiteralPath $elementCandidate.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -eq $elementReviewData.manifest_sha256) {
        $elementPilotManifest = $elementCandidate.FullName
        break
    }
}
if (-not $elementPilotManifest) {
    $elementPilotPicker = New-Object System.Windows.Forms.OpenFileDialog
    $elementPilotPicker.Filter = 'Manifest elemen (manifest-elemen.json)|manifest-elemen.json'
    $elementPilotPicker.Title = 'Pilih manifest-elemen.json yang sepadan dengan semakan enam pelan'
    if ($elementPilotPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $elementPilotManifest = $elementPilotPicker.FileName
}
$elementPreviousPicker = New-Object System.Windows.Forms.OpenFileDialog
$elementPreviousPicker.Filter = 'Manifest CubiCasa lama (manifest-eksport.json)|manifest-eksport.json'
$elementPreviousPicker.Title = '2. Pilih CubiCasa-batch-...\dataset\manifest-eksport.json untuk kekalkan split asal'
$elementPreviousPicker.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
if ($elementPreviousPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
$elementPreviousBatch = Split-Path -Parent (Split-Path -Parent $elementPreviousPicker.FileName)
$elementSourcePicker = New-Object System.Windows.Forms.FolderBrowserDialog
$elementSourcePicker.Description = '3. Pilih folder sumber CubiCasa PENUH yang mengandungi model.svg dan F1_scaled.png.'
$elementSourcePicker.ShowNewFolderButton = $false
if ($elementSourcePicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
$elementBatchStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$elementBatchHelper = Join-Path ([IO.Path]::GetTempPath()) ('CubiCasa-element-batch-' + $elementBatchStamp)
$elementBatchOutput = Join-Path (Join-Path $env:USERPROFILE 'Downloads') ('CubiCasa-elemen-batch-' + $elementBatchStamp)
New-Item -ItemType Directory -Path $elementBatchHelper | Out-Null
$elementBatchFiles = @{
    'batch.py' = @{ Source = 'plan-elements/batch.py'; Hash = '015c0fd55720a215318d9a9216a0036dcc304dd6fe42ebbb768548a269ff1e77' }
    'prepare.py' = @{ Source = 'plan-elements/prepare.py'; Hash = '0d2cc1877cb435afde8da1106c31501e3f42259da873dfcd11b9ca905b90b390' }
    'review.html' = @{ Source = 'plan-elements/review.html'; Hash = 'b8d014de473bf40514b0c92cb8454dd6c8e44c2f26cbe9f9364011e9f6659c3a' }
    'prompt-ms.txt' = @{ Source = 'plan-elements/prompt-ms.txt'; Hash = 'd7309735aa5fa4d7062c97493416a5327c7aa086162e1eead65cc04cb460aaeb' }
    'cubi_geometry.py' = @{ Source = 'cubicasa/prepare.py'; Hash = '0d5ffc5b35cf7c230d3a6c43cfffc6e4048a64e687222f8d8bff42a77036cc0e' }
}
foreach ($elementBatchName in $elementBatchFiles.Keys) {
    $elementBatchEntry = $elementBatchFiles[$elementBatchName]
    $elementBatchPath = Join-Path $elementBatchHelper $elementBatchName
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/$($elementBatchEntry.Source)" -OutFile $elementBatchPath
    if ((Get-FileHash -LiteralPath $elementBatchPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $elementBatchEntry.Hash) {
        throw "Fail $elementBatchName tidak sepadan. Penjana tidak dijalankan."
    }
}
& $elementBatchPython (Join-Path $elementBatchHelper 'batch.py') $elementSourcePicker.SelectedPath $elementPreviousBatch $elementPilotManifest $elementReviewPath $elementBatchOutput
if ($LASTEXITCODE -ne 0) { throw 'Batch elemen belum berjaya. Tiada latihan dimulakan; semak ralat di atas.' }
Write-Host "Dataset elemen: $elementBatchOutput"
Write-Host 'Tiada training dijalankan. Semak manifest-eksport-elemen.json dan BACA-DAHULU.txt.'
Start-Process explorer.exe -ArgumentList ('"' + $elementBatchOutput + '"')
Start-Process (Join-Path $elementBatchOutput 'audit\BUKA-SEMAKAN-ELEMEN.html')

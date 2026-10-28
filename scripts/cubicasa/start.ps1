param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef,
    [switch]$Folder,
    [switch]$Batch,
    [ValidateRange(1, 200)]
    [int]$Limit = 20
)
$ErrorActionPreference = 'Stop'
$cubiPython = 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $cubiPython -PathType Leaf)) {
    throw 'Python Unsloth tidak dijumpai. Semak folder pemasangan Pinokio.'
}
Add-Type -AssemblyName System.Windows.Forms
if ($Folder) {
    $cubiPicker = New-Object System.Windows.Forms.FolderBrowserDialog
    $cubiPicker.Description = if ($Batch) { 'Pilih folder dataset CubiCasa PENUH, bukan folder tiga sampel.' } else { 'Pilih folder dataset CubiCasa yang mengandungi folder-folder sampel asal.' }
    $cubiPicker.ShowNewFolderButton = $false
    if ($cubiPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $cubiSource = $cubiPicker.SelectedPath
} else {
    $cubiPicker = New-Object System.Windows.Forms.OpenFileDialog
    $cubiPicker.Filter = 'Dataset ZIP (*.zip)|*.zip'
    $cubiPicker.Title = if ($Batch) { 'Pilih ZIP dataset CubiCasa PENUH' } else { 'Pilih CubiCasa-sampel.zip untuk semakan awal' }
    $cubiPicker.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
    if ($cubiPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $cubiSource = $cubiPicker.FileName
}
$cubiStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$cubiPrefix = if ($Batch) { 'CubiCasa-batch-' } else { 'CubiCasa-semak-' }
$cubiOutput = Join-Path (Join-Path $env:USERPROFILE 'Downloads') ($cubiPrefix + $cubiStamp)
$cubiHelper = Join-Path ([IO.Path]::GetTempPath()) ('CubiCasa-helper-' + $cubiStamp)
New-Item -ItemType Directory -Path $cubiHelper | Out-Null
$cubiBase = "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/cubicasa"
$cubiFiles = @{
    'prepare.py' = '0d5ffc5b35cf7c230d3a6c43cfffc6e4048a64e687222f8d8bff42a77036cc0e'
    'review.html' = '9cc1be48561a560f0d86a8814ca5d996d10b500d0516b709157298da0b35e287'
}
foreach ($cubiName in $cubiFiles.Keys) {
    $cubiPath = Join-Path $cubiHelper $cubiName
    Invoke-WebRequest -UseBasicParsing -Uri "$cubiBase/$cubiName" -OutFile $cubiPath
    if ((Get-FileHash -LiteralPath $cubiPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $cubiFiles[$cubiName]) {
        throw "Fail $cubiName tidak sepadan dengan versi disemak. Skrip tidak dijalankan."
    }
}
if ($Batch) {
    & $cubiPython (Join-Path $cubiHelper 'prepare.py') batch $cubiSource $cubiOutput
} else {
    & $cubiPython (Join-Path $cubiHelper 'prepare.py') audit $cubiSource $cubiOutput --limit $Limit
}
if ($LASTEXITCODE -ne 0) { throw 'Audit belum berjaya. Semak ralat di atas; tiada latihan dimulakan.' }
Write-Host "Semakan disediakan: $cubiOutput"
Write-Host 'Tiada model dilatih. Semak fail BACA-DAHULU dan poligon sebelum memulakan latihan.'
Start-Process explorer.exe -ArgumentList ('"' + $cubiOutput + '"')
if ($Batch) {
    Start-Process (Join-Path $cubiOutput 'audit\BUKA-SEMAKAN-CUBICASA.html')
} else {
    Start-Process (Join-Path $cubiOutput 'BUKA-SEMAKAN-CUBICASA.html')
}

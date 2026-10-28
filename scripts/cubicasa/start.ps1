param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef,
    [switch]$Folder,
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
    $cubiPicker.Description = 'Pilih folder dataset CubiCasa yang mengandungi folder-folder sampel asal.'
    $cubiPicker.ShowNewFolderButton = $false
    if ($cubiPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $cubiSource = $cubiPicker.SelectedPath
} else {
    $cubiPicker = New-Object System.Windows.Forms.OpenFileDialog
    $cubiPicker.Filter = 'Dataset ZIP (*.zip)|*.zip'
    $cubiPicker.Title = 'Pilih CubiCasa-sampel.zip untuk semakan awal'
    $cubiPicker.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
    if ($cubiPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $cubiSource = $cubiPicker.FileName
}
$cubiStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$cubiOutput = Join-Path (Join-Path $env:USERPROFILE 'Downloads') ('CubiCasa-semak-' + $cubiStamp)
$cubiHelper = Join-Path ([IO.Path]::GetTempPath()) ('CubiCasa-helper-' + $cubiStamp)
New-Item -ItemType Directory -Path $cubiHelper | Out-Null
$cubiBase = "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/cubicasa"
$cubiFiles = @{
    'prepare.py' = '7376d2289e06afc597ca1cbccd983824011e35497492a788025bfb8a962044ff'
    'review.html' = '79e402dcc842458c9b2b671fc0467dea15d50be50145d4c9f13f54cf29492ac9'
}
foreach ($cubiName in $cubiFiles.Keys) {
    $cubiPath = Join-Path $cubiHelper $cubiName
    Invoke-WebRequest -UseBasicParsing -Uri "$cubiBase/$cubiName" -OutFile $cubiPath
    if ((Get-FileHash -LiteralPath $cubiPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $cubiFiles[$cubiName]) {
        throw "Fail $cubiName tidak sepadan dengan versi disemak. Skrip tidak dijalankan."
    }
}
& $cubiPython (Join-Path $cubiHelper 'prepare.py') audit $cubiSource $cubiOutput --limit $Limit
if ($LASTEXITCODE -ne 0) { throw 'Audit belum berjaya. Semak ralat di atas; tiada latihan dimulakan.' }
Write-Host "Semakan disediakan: $cubiOutput"
Write-Host 'Semak poligon dalam HTML. Ini belum menjana Parquet atau melatih model.'
Start-Process explorer.exe -ArgumentList ('"' + $cubiOutput + '"')
Start-Process (Join-Path $cubiOutput 'BUKA-SEMAKAN-CUBICASA.html')

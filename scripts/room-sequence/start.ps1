param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef,
    [Parameter(Mandatory = $true)]
    [string]$ReferenceData
)
$ErrorActionPreference = 'Stop'
$sequencePython = 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $sequencePython -PathType Leaf)) { throw 'Python Unsloth tidak dijumpai.' }
$sequenceReference = $ReferenceData -replace '\s',''
if ($sequenceReference.Length -gt 1048576 -or $sequenceReference -notmatch '^[A-Za-z0-9+/=]+$') { throw 'Data rujukan tidak sah.' }
Add-Type -AssemblyName System.Windows.Forms
$sequencePicker = New-Object System.Windows.Forms.OpenFileDialog
$sequencePicker.Filter = 'Pelan bersih PNG/JPEG (*.png;*.jpg;*.jpeg)|*.png;*.jpg;*.jpeg'
$sequencePicker.Title = 'Pilih fail pelan bersih asal tanpa warna, nombor jawapan atau anak panah'
$sequencePicker.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
if ($sequencePicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
$sequenceStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$sequenceHelper = Join-Path ([IO.Path]::GetTempPath()) ('FCA-sequence-helper-' + $sequenceStamp)
$sequenceOutput = Join-Path (Join-Path $env:USERPROFILE 'Downloads') ('FCA-ruang-urutan-' + $sequenceStamp)
New-Item -ItemType Directory -Path $sequenceHelper | Out-Null
$sequenceFiles = @{
    'prepare.py' = '2ca5e307b7e5f54e86fec415be3a3032939f89d3f9d83e78d57bb867a2f30d29'
    'review.html' = 'b13b949a2cc92a2400c06fd2ee47829612184830dfe567c508761b6379edbfe3'
}
foreach ($sequenceName in $sequenceFiles.Keys) {
    $sequencePath = Join-Path $sequenceHelper $sequenceName
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/room-sequence/$sequenceName" -OutFile $sequencePath
    if ((Get-FileHash -LiteralPath $sequencePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sequenceFiles[$sequenceName]) {
        throw "Fail $sequenceName tidak sepadan. Skrip tidak dijalankan."
    }
}
& $sequencePython (Join-Path $sequenceHelper 'prepare.py') $sequencePicker.FileName $sequenceOutput --reference-b64 $sequenceReference
if ($LASTEXITCODE -ne 0) { throw 'Semakan urutan belum berjaya. Semak ralat di atas.' }
Write-Host "Semakan urutan: $sequenceOutput"
Write-Host 'Semua geometri masih draf sehingga disahkan. Tiada Parquet atau model dilatih.'
Start-Process explorer.exe -ArgumentList ('"' + $sequenceOutput + '"')
Start-Process (Join-Path $sequenceOutput 'BUKA-SEMAKAN-URUTAN.html')

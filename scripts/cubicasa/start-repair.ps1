param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef
)
$ErrorActionPreference = 'Stop'
$cubiFixPython = 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $cubiFixPython -PathType Leaf)) { throw 'Python Unsloth tidak dijumpai.' }
Add-Type -AssemblyName System.Windows.Forms
$cubiFixPicker = New-Object System.Windows.Forms.OpenFileDialog
$cubiFixPicker.Filter = 'Halaman ujian (BUKA-UJIAN-CUBICASA.html)|BUKA-UJIAN-CUBICASA.html'
$cubiFixPicker.Title = 'Pilih BUKA-UJIAN-CUBICASA.html yang butangnya tidak memberi respons'
$cubiFixPicker.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
if ($cubiFixPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
$cubiFixHelper = Join-Path ([IO.Path]::GetTempPath()) ('CubiCasa-fix-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $cubiFixHelper | Out-Null
$cubiFixBase = "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/cubicasa"
$cubiFixFiles = @{
    'repair-evaluator.py' = 'a474ac39c786b281b0c3600760e973c9a8e5c1f81275b9e9dd83ab2e0d4f80de'
    'evaluator.html' = '706b557298b282d02d936278c981445d3447f02aeb77dcb5423144026bd563cb'
    'score.js' = 'b74db1941b34bcf0c60744e2c6e2a5e426d41f07f6191b603e292c5af2c0c2b1'
}
foreach ($cubiFixName in $cubiFixFiles.Keys) {
    $cubiFixPath = Join-Path $cubiFixHelper $cubiFixName
    Invoke-WebRequest -UseBasicParsing -Uri "$cubiFixBase/$cubiFixName" -OutFile $cubiFixPath
    if ((Get-FileHash -LiteralPath $cubiFixPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $cubiFixFiles[$cubiFixName]) {
        throw "Fail $cubiFixName tidak sepadan. Pembaikan tidak dijalankan."
    }
}
& $cubiFixPython (Join-Path $cubiFixHelper 'repair-evaluator.py') $cubiFixPicker.FileName
if ($LASTEXITCODE -ne 0) { throw 'Pembaikan belum berjaya. Semak ralat di atas.' }
Write-Host 'Kembali ke tab ujian asal dan tekan Ctrl+R. Tiada latihan dimulakan.'

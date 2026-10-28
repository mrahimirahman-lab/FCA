param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef
)
$ErrorActionPreference = 'Stop'
$cubiEvalPython = 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $cubiEvalPython -PathType Leaf)) {
    throw 'Python Unsloth tidak dijumpai. Semak folder pemasangan Pinokio.'
}
Add-Type -AssemblyName System.Windows.Forms
$cubiEvalPicker = New-Object System.Windows.Forms.OpenFileDialog
$cubiEvalPicker.Filter = 'Manifest eksport (manifest-eksport.json)|manifest-eksport.json'
$cubiEvalPicker.Title = 'Pilih manifest-eksport.json dalam folder CubiCasa-batch-...\dataset'
$cubiEvalPicker.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
if ($cubiEvalPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
$cubiEvalBatch = Split-Path -Parent (Split-Path -Parent $cubiEvalPicker.FileName)
$cubiEvalStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$cubiEvalOutput = Join-Path (Join-Path $env:USERPROFILE 'Downloads') ('CubiCasa-ujian-' + $cubiEvalStamp)
$cubiEvalHelper = Join-Path ([IO.Path]::GetTempPath()) ('CubiCasa-eval-helper-' + $cubiEvalStamp)
New-Item -ItemType Directory -Path $cubiEvalHelper | Out-Null
$cubiEvalBase = "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/cubicasa"
$cubiEvalFiles = @{
    'evaluate.py' = '8d1ff7a0a0e793f3688182994fc53e1274a34cbb962972ffe43b15bbce6c2259'
    'prepare.py' = '0d5ffc5b35cf7c230d3a6c43cfffc6e4048a64e687222f8d8bff42a77036cc0e'
    'evaluator.html' = 'dbbc2bd85f120a1831fd331c043c6d33ebf765a8230dd5f426f2baf54f8330d5'
    'score.js' = '829661098f5d336932ab7c708c76466f2a2ef4b1021ff1cc3584aaf45d36b4be'
}
foreach ($cubiEvalName in $cubiEvalFiles.Keys) {
    $cubiEvalPath = Join-Path $cubiEvalHelper $cubiEvalName
    Invoke-WebRequest -UseBasicParsing -Uri "$cubiEvalBase/$cubiEvalName" -OutFile $cubiEvalPath
    if ((Get-FileHash -LiteralPath $cubiEvalPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $cubiEvalFiles[$cubiEvalName]) {
        throw "Fail $cubiEvalName tidak sepadan dengan versi disemak. Skrip tidak dijalankan."
    }
}
& $cubiEvalPython (Join-Path $cubiEvalHelper 'evaluate.py') $cubiEvalBatch $cubiEvalOutput
if ($LASTEXITCODE -ne 0) { throw 'Pakej ujian belum berjaya. Semak ralat di atas.' }
Write-Host "Pakej ujian disediakan: $cubiEvalOutput"
Write-Host 'Tiada inferens atau latihan dijalankan. Gunakan Compare in Chat untuk setiap imej.'
Start-Process explorer.exe -ArgumentList ('"' + $cubiEvalOutput + '"')
Start-Process (Join-Path $cubiEvalOutput 'BUKA-UJIAN-CUBICASA.html')

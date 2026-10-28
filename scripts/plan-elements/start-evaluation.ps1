param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef
)
$ErrorActionPreference = 'Stop'
$elementEvalPython = 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $elementEvalPython -PathType Leaf)) { throw 'Python Unsloth tidak dijumpai.' }
Add-Type -AssemblyName System.Windows.Forms
$elementEvalPicker = New-Object System.Windows.Forms.OpenFileDialog
$elementEvalPicker.Filter = 'Manifest elemen (manifest-eksport-elemen.json)|manifest-eksport-elemen.json'
$elementEvalPicker.Title = 'Pilih CubiCasa-elemen-batch-...\dataset\manifest-eksport-elemen.json'
$elementEvalPicker.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
if ($elementEvalPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
$elementEvalBatch = Split-Path -Parent (Split-Path -Parent $elementEvalPicker.FileName)
$elementEvalStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$elementEvalHelper = Join-Path ([IO.Path]::GetTempPath()) ('FCA-element-eval-' + $elementEvalStamp)
$elementEvalOutput = Join-Path (Join-Path $env:USERPROFILE 'Downloads') ('FCA-ELEMEN-ujian-' + $elementEvalStamp)
New-Item -ItemType Directory -Path $elementEvalHelper | Out-Null
$elementEvalFiles = @{
    'evaluate.py' = @{ Source = 'plan-elements/evaluate.py'; Hash = '9614a0f06a02c34391df9dc925eb1e4742e4ae8c7c4156e67a56a0ddf5751d09' }
    'prepare.py' = @{ Source = 'plan-elements/prepare.py'; Hash = '0d2cc1877cb435afde8da1106c31501e3f42259da873dfcd11b9ca905b90b390' }
    'evaluator.html' = @{ Source = 'plan-elements/evaluator.html'; Hash = 'bdd4acf4bde1d45b8fe14095c70f93fadb1ce161675766146d2b3e08a0e5e1c8' }
    'prompt-ms.txt' = @{ Source = 'plan-elements/prompt-ms.txt'; Hash = 'd7309735aa5fa4d7062c97493416a5327c7aa086162e1eead65cc04cb460aaeb' }
    'cubi_geometry.py' = @{ Source = 'cubicasa/prepare.py'; Hash = '0d5ffc5b35cf7c230d3a6c43cfffc6e4048a64e687222f8d8bff42a77036cc0e' }
    'score.js' = @{ Source = 'cubicasa/score.js'; Hash = '829661098f5d336932ab7c708c76466f2a2ef4b1021ff1cc3584aaf45d36b4be' }
}
foreach ($elementEvalName in $elementEvalFiles.Keys) {
    $elementEvalEntry = $elementEvalFiles[$elementEvalName]
    $elementEvalPath = Join-Path $elementEvalHelper $elementEvalName
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/$($elementEvalEntry.Source)" -OutFile $elementEvalPath
    if ((Get-FileHash -LiteralPath $elementEvalPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $elementEvalEntry.Hash) {
        throw "Fail $elementEvalName tidak sepadan. Penjana ujian tidak dijalankan."
    }
}
& $elementEvalPython (Join-Path $elementEvalHelper 'evaluate.py') $elementEvalBatch $elementEvalOutput
if ($LASTEXITCODE -ne 0) { throw 'Pakej ujian elemen belum berjaya. Semak ralat di atas.' }
Write-Host "Ujian elemen: $elementEvalOutput"
Write-Host 'Tiada inferens atau latihan dijalankan. Mulakan dengan satu pelan dan tiga kelas dalam Compare in Chat.'
Start-Process explorer.exe -ArgumentList ('"' + $elementEvalOutput + '"')
Start-Process (Join-Path $elementEvalOutput 'BUKA-UJIAN-ELEMEN.html')

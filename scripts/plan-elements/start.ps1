param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string]$ReleaseRef
)
$ErrorActionPreference = 'Stop'
$elementPython = 'C:\pinokio\api\unsloth.git\env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $elementPython -PathType Leaf)) { throw 'Python Unsloth tidak dijumpai.' }
Add-Type -AssemblyName System.Windows.Forms
$elementPicker = New-Object System.Windows.Forms.FolderBrowserDialog
$elementPicker.Description = 'Pilih folder CubiCasa yang mengandungi pasangan F1_scaled.png dan model.svg.'
$elementPicker.ShowNewFolderButton = $false
if ($elementPicker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
$elementStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$elementHelper = Join-Path ([IO.Path]::GetTempPath()) ('CubiCasa-elements-' + $elementStamp)
$elementOutput = Join-Path (Join-Path $env:USERPROFILE 'Downloads') ('CubiCasa-elemen-' + $elementStamp)
New-Item -ItemType Directory -Path $elementHelper | Out-Null
$elementFiles = @{
    'prepare.py' = @{ Source = 'plan-elements/prepare.py'; Hash = '0d2cc1877cb435afde8da1106c31501e3f42259da873dfcd11b9ca905b90b390' }
    'review.html' = @{ Source = 'plan-elements/review.html'; Hash = 'b8d014de473bf40514b0c92cb8454dd6c8e44c2f26cbe9f9364011e9f6659c3a' }
    'prompt-ms.txt' = @{ Source = 'plan-elements/prompt-ms.txt'; Hash = 'd7309735aa5fa4d7062c97493416a5327c7aa086162e1eead65cc04cb460aaeb' }
    'cubi_geometry.py' = @{ Source = 'cubicasa/prepare.py'; Hash = '0d5ffc5b35cf7c230d3a6c43cfffc6e4048a64e687222f8d8bff42a77036cc0e' }
}
foreach ($elementName in $elementFiles.Keys) {
    $elementEntry = $elementFiles[$elementName]
    $elementPath = Join-Path $elementHelper $elementName
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/mrahimirahman-lab/FCA/$ReleaseRef/scripts/$($elementEntry.Source)" -OutFile $elementPath
    if ((Get-FileHash -LiteralPath $elementPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $elementEntry.Hash) {
        throw "Fail $elementName tidak sepadan. Audit tidak dijalankan."
    }
}
& $elementPython (Join-Path $elementHelper 'prepare.py') audit $elementPicker.SelectedPath $elementOutput --limit 6
if ($LASTEXITCODE -ne 0) { throw 'Audit elemen belum berjaya. Semak ralat di atas.' }
Write-Host "Semakan elemen: $elementOutput"
Write-Host 'Belum ada model dilatih. Semak geometri sebelum menyediakan Parquet baharu.'
Start-Process explorer.exe -ArgumentList ('"' + $elementOutput + '"')
Start-Process (Join-Path $elementOutput 'BUKA-SEMAKAN-ELEMEN.html')

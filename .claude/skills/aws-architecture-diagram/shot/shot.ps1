param([string]$Query = "steps=0", [string]$Name = "shot", [int]$W = 1440, [int]$H = 900)
# Screenshots a widget in the book with headless Chrome (or Edge): view.html opens the page, presses the
# step button and moves the widget to the top. The PNG goes to %TEMP%\ztm-shots\<Name>.png.
# Example: .\shot.ps1 -Query "page=6/invalidation&w=invalidate-arch&steps=2&noside=1" -Name s2 -W 1440 -H 900
$dir = (Get-Item $PSScriptRoot).FullName
$outDir = Join-Path $env:TEMP "ztm-shots"
New-Item -ItemType Directory -Force $outDir | Out-Null
$out = Join-Path $outDir ($Name + ".png")
if (Test-Path $out) { Remove-Item $out }
$browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
             "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
             "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
             "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw "No Chrome or Edge found" }
$url = "file:///" + ($dir -replace '\\', '/') + "/view.html?" + $Query
$a = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
       "--user-data-dir=$outDir\profile", "--window-size=$W,$H", '--virtual-time-budget=8000', "--screenshot=$out", $url)
Start-Process -FilePath $browser -ArgumentList $a -Wait -WindowStyle Hidden | Out-Null
if (Test-Path $out) { "saved $out" } else { "no screenshot" }

<#
  สร้าง "ชุดติดตั้งออฟไลน์" (zip) สำหรับเครื่องที่ทำงานที่ไม่มีอินเทอร์เน็ต — รันที่เครื่องที่บ้าน (Windows x64 มีอินเทอร์เน็ต)
      powershell -ExecutionPolicy Bypass -File .\make-offline-bundle.ps1
  ผลลัพธ์: dist\rehab-offline-YYYYMMDD.zip  (รวมแพ็กเกจที่คอมไพล์แล้วของ Windows: SQLite, Argon2, sharp)
  ** ไม่มีข้อมูลใดๆ ในชุดนี้ — ไม่รวมโฟลเดอร์ data, backups, .env **
#>
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd"
$out = "$PSScriptRoot\dist\rehab-offline-$stamp"

Write-Host "[1] ติดตั้งแพ็กเกจใหม่ทั้งหมดและ build..." -ForegroundColor Cyan
npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { exit 1 }
$env:NEXT_TELEMETRY_DISABLED = "1"
npm run build; if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[2] คัดลอกไฟล์ (ไม่รวมข้อมูล)..." -ForegroundColor Cyan
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
robocopy $PSScriptRoot $out /E /XD data backups uploads certs logs dist .git .claude .next\cache /XF .env .env.local *.db *.db-* *.rhbk *.sha256 *.xlsx *.csv /NFL /NDL /NJH /NJS | Out-Null
New-Item -ItemType Directory -Force "$out\offline" | Out-Null
Set-Content "$out\offline\.prebuilt" "build เมื่อ $(Get-Date -Format 'yyyy-MM-dd HH:mm') — update.ps1 จะไม่ build ซ้ำ" -Encoding utf8

# ตรวจซ้ำว่าไม่มีไฟล์ข้อมูลหลุดเข้าไป
$leak = Get-ChildItem $out -Recurse -File -Include *.db, *.rhbk, .env, .env.local -ErrorAction SilentlyContinue
if ($leak) { Write-Host "✗ พบไฟล์ข้อมูลในชุดติดตั้ง — ยกเลิก: $($leak.FullName -join ', ')" -ForegroundColor Red; exit 1 }

$msi = Get-ChildItem "$PSScriptRoot\offline\node-*-x64.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($msi) { Copy-Item $msi.FullName "$out\offline\" } else { Write-Host "! ยังไม่มีตัวติดตั้ง Node.js — ดาวน์โหลด node-v24.x-x64.msi จาก nodejs.org ใส่ไว้ในโฟลเดอร์ offline แล้วรันใหม่" -ForegroundColor Yellow }

Write-Host "[3] บีบอัด..." -ForegroundColor Cyan
Compress-Archive -Path "$out\*" -DestinationPath "$out.zip" -Force
Remove-Item -Recurse -Force $out
Write-Host "✓ เสร็จ: $out.zip — คัดลอกลง USB ไปติดตั้งที่ทำงาน" -ForegroundColor Green

<#
  อัปเดตโปรแกรม: สำรองข้อมูล → ดึงโค้ดใหม่ → ติดตั้ง/build → เริ่มใหม่ (migration ทำอัตโนมัติ) → ถ้าพัง ย้อนกลับเวอร์ชันเดิม
  ** อัปเดตสภาพแวดล้อมทดสอบก่อนเสมอ **
      powershell -ExecutionPolicy Bypass -File .\update.ps1 -Staging          (ที่โฟลเดอร์ทดสอบ)
      powershell -ExecutionPolicy Bypass -File .\update.ps1                   (ใช้จริง — ดึงจาก GitHub)
      powershell -ExecutionPolicy Bypass -File .\update.ps1 -Zip E:\rehab.zip (ใช้จริง — จาก USB)
#>
param([switch]$Staging, [string]$Zip)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$AppDir = $PSScriptRoot
Set-Location $AppDir
function Say($m, $c = "White") { Write-Host $m -ForegroundColor $c }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Say "ต้องเปิด PowerShell แบบ Run as administrator" Red; exit 1 }
$ServiceName = if ($Staging) { "RehabSystemTest" } else { "RehabSystem" }
Get-Content .env | ForEach-Object { if ($_ -match "^\s*([^#=]+)=(.*)$") { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2] } }
$Port = $env:PORT

function Healthy {
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 3
    try { if ((Invoke-WebRequest "https://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) { return $true } } catch {}
  }
  return $false
}

# 1) สำรองข้อมูลก่อนอัปเดต (ทำได้ขณะระบบทำงาน)
Say "[1] สำรองข้อมูลก่อนอัปเดต..." Cyan
$out = npx tsx scripts/backup-now.mts pre_update
Say $out
if ($LASTEXITCODE -ne 0) { Say "สำรองข้อมูลไม่สำเร็จ — ยกเลิกการอัปเดต (ระบบเดิมยังทำงานปกติ)" Red; exit 1 }
$backupName = ($out | Select-String -Pattern "rehab-[0-9-]+-pre_update\.rhbk").Matches.Value | Select-Object -Last 1

# 2) จำเวอร์ชันเดิม
$hasGit = Test-Path "$AppDir\.git"
$prev = if ($hasGit) { git rev-parse HEAD } else { $null }
$prevCopy = $null
if (-not $hasGit) {
  $prevCopy = "$env:TEMP\rehab-prev-$(Get-Date -Format yyyyMMddHHmmss)"
  Say "[2] เก็บสำเนาโปรแกรมเดิมไว้ที่ $prevCopy" Cyan
  robocopy $AppDir $prevCopy /E /XD node_modules data backups /XF .env /NFL /NDL /NJH /NJS | Out-Null
}

# 3) หยุดบริการ + ดึงโค้ดใหม่
Say "[3] หยุดบริการและดึงโค้ดใหม่..." Cyan
Stop-Service $ServiceName -ErrorAction SilentlyContinue
try {
  if ($Zip) {
    $tmp = "$env:TEMP\rehab-new-$(Get-Date -Format yyyyMMddHHmmss)"
    Expand-Archive $Zip -DestinationPath $tmp -Force
    $src = (Get-ChildItem $tmp | Where-Object { $_.PSIsContainer } | Select-Object -First 1).FullName
    if (-not (Test-Path "$src\package.json")) { $src = $tmp }
    robocopy $src $AppDir /E /XD data backups .git /XF .env /NFL /NDL /NJH /NJS | Out-Null
  } elseif ($hasGit) {
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "git pull ไม่สำเร็จ" }
  } else { throw "ไม่พบ Git และไม่ได้ระบุ -Zip" }

  Say "[4] ติดตั้งแพ็กเกจและ build..." Cyan
  if (-not (Test-Path "$AppDir\offline\.prebuilt")) {
    npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw "npm ci ไม่สำเร็จ" }
    npm run build; if ($LASTEXITCODE -ne 0) { throw "build ไม่สำเร็จ" }
  }
  if (Test-Path "$AppDir\assets\fonts\THSarabunNew.ttf") { New-Item -ItemType Directory -Force "$AppDir\public\fonts" | Out-Null; Copy-Item "$AppDir\assets\fonts\*.ttf" "$AppDir\public\fonts\" -Force }

  Say "[5] เริ่มบริการ (migration ทำอัตโนมัติเมื่อเริ่ม)..." Cyan
  Start-Service $ServiceName
  if (-not (Healthy)) { throw "ระบบไม่ตอบหลังอัปเดต" }
  Say "✓ อัปเดตสำเร็จ" Green
} catch {
  Say "✗ $($_.Exception.Message) — กำลังย้อนกลับเวอร์ชันเดิม..." Red
  Stop-Service $ServiceName -ErrorAction SilentlyContinue
  if ($hasGit -and $prev) { git reset --hard $prev } elseif ($prevCopy) { robocopy $prevCopy $AppDir /E /NFL /NDL /NJH /NJS | Out-Null }
  npm ci --no-audit --no-fund; npm run build
  if ($backupName) { npx tsx scripts/restore-cli.mts $backupName }
  Start-Service $ServiceName
  if (Healthy) { Say "✓ ย้อนกลับเวอร์ชันเดิมเรียบร้อย ระบบใช้งานได้ตามเดิม — แจ้งผู้พัฒนาพร้อมข้อความข้างบน" Yellow }
  else { Say "✗ ย้อนกลับแล้วระบบยังไม่ตอบ — ดู README หัวข้อ 'แก้ปัญหาเบื้องต้น'" Red }
  exit 1
}

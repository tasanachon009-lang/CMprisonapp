<#
  ติดตั้งระบบสถานฟื้นฟู (ครั้งแรก) — คำสั่งเดียว
  วิธีใช้: คลิกขวา PowerShell > Run as administrator แล้วพิมพ์
      cd C:\RehabApp
      powershell -ExecutionPolicy Bypass -File .\install.ps1
  ติดตั้งสภาพแวดล้อมทดสอบ (แยกโฟลเดอร์/ฐานข้อมูล/พอร์ต):
      powershell -ExecutionPolicy Bypass -File .\install.ps1 -Staging
#>
param([switch]$Staging)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$AppDir = $PSScriptRoot
Set-Location $AppDir

function Say($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Step($n, $msg) { Write-Host ""; Write-Host "[$n] $msg" -ForegroundColor Cyan }
function Ask($q, $default) {
  $a = Read-Host "$q$(if ($default) { " [$default]" })"
  if ([string]::IsNullOrWhiteSpace($a)) { return $default } else { return $a.Trim() }
}
function AskSecret($q) {
  $s = Read-Host $q -AsSecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
function Fail($msg) { Say "✗ $msg" Red; Say "การติดตั้งหยุดลง — แก้ปัญหาตามข้อความแล้วรันใหม่ได้ (ปลอดภัย ไม่ทับข้อมูลเดิม)" Yellow; exit 1 }

# ── 0. ตรวจสิทธิ์ผู้ดูแลเครื่อง ──
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail "ต้องเปิด PowerShell แบบ Run as administrator" }

$ServiceName = if ($Staging) { "RehabSystemTest" } else { "RehabSystem" }
$DefaultData = if ($Staging) { "C:\RehabData-Test" } else { "C:\RehabData" }
$DefaultPort = if ($Staging) { "8443" } else { "443" }

Say "=============================================" Green
Say " ติดตั้งระบบสถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด $(if ($Staging) { '(สภาพแวดล้อมทดสอบ)' })" Green
Say "=============================================" Green

# ── 1. Node.js ──
Step 1 "ตรวจ Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  $msi = Get-ChildItem "$AppDir\offline\node-*-x64.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($msi) {
    Say "ติดตั้ง Node.js จากชุดออฟไลน์: $($msi.Name)"
    Start-Process msiexec.exe -ArgumentList "/i `"$($msi.FullName)`" /qn" -Wait
  } elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    Say "ติดตั้ง Node.js LTS ด้วย winget..."
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  } else { Fail "ไม่พบ Node.js — ใส่ไฟล์ node-vXX-x64.msi ไว้ในโฟลเดอร์ offline แล้วรันใหม่" }
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
$ver = (node -v)
if ([int]($ver.TrimStart("v").Split(".")[0]) -lt 22) { Fail "ต้องใช้ Node.js เวอร์ชัน 22 ขึ้นไป (พบ $ver)" }
Say "✓ Node.js $ver" Green

# ── 2. ค่าตั้งพื้นฐาน → .env ──
Step 2 "ตั้งค่าพื้นฐาน (ถามทีละข้อ กด Enter = ใช้ค่าในวงเล็บ)"
$envFile = Join-Path $AppDir ".env"
$SecretsFile = Join-Path $AppDir "พิมพ์ใส่ซองแล้วลบไฟล์นี้.txt"
if (Test-Path $envFile) {
  Say "พบไฟล์ .env เดิม — ใช้ค่าเดิม (ถ้าต้องการตั้งใหม่ ให้ลบ .env ก่อน)" Yellow
  Get-Content $envFile | ForEach-Object { if ($_ -match "^\s*([^#=]+)=(.*)$") { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2] } }
  $DataRoot = Split-Path $env:DATA_DIR -Parent
  $Port = $env:PORT
} else {
  $DataRoot = Ask "โฟลเดอร์เก็บข้อมูล (ควรอยู่บนดิสก์ที่เปิด BitLocker)" $DefaultData
  $Port = Ask "พอร์ต HTTPS" $DefaultPort
  $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $BackupKey = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
  $pfxBytes = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($pfxBytes)
  $PfxPass = [Convert]::ToBase64String($pfxBytes)
  $lines = @(
    "APP_ENV=$(if ($Staging) { 'staging' } else { 'production' })",
    "DATA_DIR=$DataRoot\data",
    "BACKUP_LOCAL_DIR=$DataRoot\backups",
    "BACKUP_KEY=$BackupKey",
    "PORT=$Port",
    "HTTPS_PFX=$DataRoot\certs\server.pfx",
    "HTTPS_PFX_PASSPHRASE=$PfxPass",
    "NEXT_TELEMETRY_DISABLED=1"
  )
  [IO.File]::WriteAllLines($envFile, $lines, (New-Object Text.UTF8Encoding $false))
  # .env อ่านได้เฉพาะผู้ดูแลเครื่องและระบบ
  icacls $envFile /inheritance:r /grant:r "Administrators:F" "SYSTEM:F" | Out-Null
  $lines | ForEach-Object { if ($_ -match "^([^=]+)=(.*)$") { Set-Item -Path "env:$($matches[1])" -Value $matches[2] } }
  $hdr = "ข้อมูลลับของระบบสถานฟื้นฟู — พิมพ์ใส่ซองปิดผนึกให้หัวหน้าเก็บ แล้วลบไฟล์นี้ทิ้ง`r`nสร้างเมื่อ $(Get-Date -Format 'yyyy-MM-dd HH:mm') เครื่อง $env:COMPUTERNAME`r`n`r`nกุญแจถอดรหัสไฟล์สำรอง (BACKUP_KEY) — ถ้าหาย จะเปิดไฟล์สำรองไม่ได้อีกเลย:`r`n$BackupKey`r`n"
  [IO.File]::WriteAllText($SecretsFile, $hdr, (New-Object Text.UTF8Encoding $true))
}
foreach ($d in @("$DataRoot\data", "$DataRoot\backups", "$DataRoot\certs", "$DataRoot\logs")) { New-Item -ItemType Directory -Force $d | Out-Null }
icacls $DataRoot /inheritance:r /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" | Out-Null
Say "✓ ข้อมูลอยู่ที่ $DataRoot (เข้าถึงได้เฉพาะผู้ดูแลเครื่อง)" Green

# ── 3. แพ็กเกจ ──
Step 3 "ติดตั้งแพ็กเกจโปรแกรม"
if (Test-Path "$AppDir\node_modules\next") {
  Say "พบ node_modules แล้ว (ชุดออฟไลน์) — ข้าม" Yellow
} else {
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail "ติดตั้งแพ็กเกจไม่สำเร็จ (ถ้าเครื่องไม่มีอินเทอร์เน็ต ให้ใช้ชุดติดตั้งออฟไลน์)" }
}
if (Test-Path "$AppDir\assets\fonts\THSarabunNew.ttf") {
  New-Item -ItemType Directory -Force "$AppDir\public\fonts" | Out-Null
  Copy-Item "$AppDir\assets\fonts\*.ttf" "$AppDir\public\fonts\" -Force
  Say "✓ คัดลอกฟอนต์ TH Sarabun New" Green
} else { Say "! ยังไม่พบฟอนต์ assets\fonts\THSarabunNew.ttf — เอกสารพิมพ์จะใช้ฟอนต์ชั่วคราว (ดู README)" Yellow }
if (-not (Test-Path "$AppDir\.next\BUILD_ID")) {
  Say "กำลัง build (ใช้เวลา 1–3 นาที)..."
  npm run build
  if ($LASTEXITCODE -ne 0) { Fail "build ไม่สำเร็จ" }
}
Say "✓ โปรแกรมพร้อม" Green

# ── 4. ฐานข้อมูล + บัญชีหัวหน้า ──
Step 4 "สร้างฐานข้อมูลและบัญชีหัวหน้าคนแรก"
$dbExists = Test-Path "$env:DATA_DIR\rehab.db"
if (-not $dbExists) {
  Say "รหัสหน่วยงาน = รหัสกลางที่ทุกเครื่องต้องใส่ครั้งแรก (อย่างน้อย 8 ตัว)"
  do { $org = AskSecret "ตั้งรหัสหน่วยงาน"; $org2 = AskSecret "พิมพ์รหัสหน่วยงานอีกครั้ง" } while ($org -ne $org2 -or $org.Length -lt 8)
  $env:SETUP_ORG_CODE = $org
  Say "บัญชีหัวหน้าสถานฟื้นฟู (ผู้ดูแลระบบคนแรก)"
  $env:SETUP_ADMIN_PREFIX = Ask "คำนำหน้า" "นาง"
  $env:SETUP_ADMIN_FIRST = Ask "ชื่อ" ""
  $env:SETUP_ADMIN_LAST = Ask "นามสกุล" ""
  do { $pw = AskSecret "ตั้งรหัสผ่านผู้ดูแล (อย่างน้อย 12 ตัว มีตัวอักษรและตัวเลข)"; $pw2 = AskSecret "พิมพ์รหัสผ่านอีกครั้ง" } while ($pw -ne $pw2 -or $pw.Length -lt 12)
  $env:SETUP_ADMIN_PASSWORD = $pw
}
$env:SETUP_SECRETS_FILE = $SecretsFile
npx tsx scripts/setup.mts
$code = $LASTEXITCODE
Remove-Item env:SETUP_ORG_CODE, env:SETUP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
if ($code -ne 0) { Fail "ตั้งค่าฐานข้อมูลไม่สำเร็จ" }

# ── 5. HTTPS (ใบรับรองของหน่วยงานเอง) ──
Step 5 "สร้างใบรับรอง HTTPS ของหน่วยงาน"
$pfx = "$DataRoot\certs\server.pfx"
if (-not (Test-Path $pfx)) {
  $hostName = $env:COMPUTERNAME.ToLower()
  $ips = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }).IPAddress
  $san = "2.5.29.17={text}DNS=$hostName&DNS=localhost" + (($ips | ForEach-Object { "&IPAddress=$_" }) -join "")
  $ca = New-SelfSignedCertificate -Type Custom -Subject "CN=Rehab Local CA ($hostName)" -KeyUsage CertSign, CRLSign, DigitalSignature -KeyExportPolicy NonExportable `
    -TextExtension @("2.5.29.19={critical}{text}ca=true&pathlength=0") -CertStoreLocation Cert:\LocalMachine\My -NotAfter (Get-Date).AddYears(10)
  $srv = New-SelfSignedCertificate -Type SSLServerAuthentication -Subject "CN=$hostName" -TextExtension @($san) -Signer $ca `
    -KeyExportPolicy Exportable -CertStoreLocation Cert:\LocalMachine\My -NotAfter (Get-Date).AddYears(5)
  Export-PfxCertificate -Cert $srv -FilePath $pfx -Password (ConvertTo-SecureString $env:HTTPS_PFX_PASSPHRASE -AsPlainText -Force) | Out-Null
  Export-Certificate -Cert $ca -FilePath "$DataRoot\certs\rehab-ca.cer" | Out-Null
  Import-Certificate -FilePath "$DataRoot\certs\rehab-ca.cer" -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
  Copy-Item "$DataRoot\certs\rehab-ca.cer" "$AppDir\ติดตั้งใบรับรองนี้ที่เครื่องลูกข่าย-rehab-ca.cer" -Force
  Say "✓ ใบรับรองสำหรับ https://$hostName และ $($ips -join ', ')" Green
  Say "  เครื่องลูกข่ายทุกเครื่องต้องติดตั้งไฟล์ rehab-ca.cer ครั้งเดียว (ดู README หัวข้อ 'ติดตั้งใบรับรองที่เครื่องลูกข่าย')" Yellow
}

# ── 6. Firewall: รับเฉพาะใน LAN ──
Step 6 "ตั้ง Firewall (รับเฉพาะเครือข่ายภายใน)"
Get-NetFirewallRule -DisplayName "$ServiceName HTTPS" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "$ServiceName HTTPS" -Direction Inbound -Protocol TCP -LocalPort $Port -Profile Domain, Private -Action Allow | Out-Null
Say "✓ เปิดพอร์ต $Port เฉพาะเครือข่าย Domain/Private (ไม่เปิดจากอินเทอร์เน็ต)" Green

# ── 7. Windows Service ──
Step 7 "ติดตั้งเป็น Windows Service ($ServiceName) เปิดเองเมื่อเปิดเครื่อง"
node scripts/service.cjs install $ServiceName
Start-Sleep -Seconds 8
try {
  $r = Invoke-WebRequest "https://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 30
  if ($r.StatusCode -eq 200) { Say "✓ ระบบทำงานแล้ว" Green }
} catch { Say "! ระบบยังไม่ตอบ อาจใช้เวลาอีกสักครู่ — เปิด https://localhost:$Port ดูภายหลัง" Yellow }

Say ""
Say "=============================================" Green
Say " ติดตั้งเสร็จ" Green
Say "   เปิดใช้งาน: https://$($env:COMPUTERNAME.ToLower())$(if ($Port -ne '443') { ":$Port" })" Green
Say "=============================================" Green
if (Test-Path $SecretsFile) {
  Say ""
  Say "สำคัญ: เปิดไฟล์ '$SecretsFile' พิมพ์ใส่ซองปิดผนึกให้หัวหน้าเก็บ แล้วลบไฟล์ทิ้ง" Red
  notepad $SecretsFile
}

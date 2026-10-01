$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$privateDir = Join-Path (Get-Location) '.medibill-mobile'
if (Test-Path $privateDir) { throw 'Mobile setup already exists. Keep it, or stop the gateway and rename .medibill-mobile before configuring a new password.' }
$password = Read-Host 'Choose a mobile access password (at least 12 characters)' -AsSecureString
$passwordAgain = Read-Host 'Repeat mobile access password' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$ptrAgain = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordAgain)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $plainAgain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptrAgain)
  if ($plain.Length -lt 12) { throw 'Password must have at least 12 characters.' }
  if ($plain -cne $plainAgain) { throw 'Passwords did not match.' }
  New-Item -ItemType Directory $privateDir | Out-Null
  # Restrict certificate and credential files to this Windows account.
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $privateDir /inheritance:r /grant:r "${sid}:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict credential folder permissions.' }
  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($plain)) | & node.exe scripts/mobile-gateway.mjs --credentials
  if ($LASTEXITCODE -ne 0) { throw 'Could not create mobile credentials.' }
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $certificatePassword = [Convert]::ToBase64String($bytes)
  $certificate = New-SelfSignedCertificate -DnsName 'medibill.local','localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(1)
  try {
    Export-PfxCertificate -Cert $certificate -FilePath (Join-Path $privateDir 'server.pfx') -Password (ConvertTo-SecureString $certificatePassword -AsPlainText -Force) | Out-Null
    [IO.File]::WriteAllText((Join-Path $privateDir 'tls-password.txt'), $certificatePassword)
  } finally { Remove-Item "Cert:\CurrentUser\My\$($certificate.Thumbprint)" }
  Write-Host 'Mobile access configured. Keep .medibill-mobile private and out of Git.'
  Write-Host 'Start MediBill normally, then run: node scripts/mobile-gateway.mjs'
} catch {
  if (Test-Path $privateDir) { Remove-Item $privateDir -Recurse -Force }
  throw
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptrAgain)
  $plain = $null
  $plainAgain = $null
}

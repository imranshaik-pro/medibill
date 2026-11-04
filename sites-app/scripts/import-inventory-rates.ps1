[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$File,
  [switch]$Apply,
  [string]$BaseUrl = 'http://127.0.0.1:5173'
)
$ErrorActionPreference = 'Stop'
$uri = [Uri]$BaseUrl
if ($uri.Scheme -ne 'http' -or $uri.Host -notin @('localhost','127.0.0.1') -or $uri.AbsolutePath -ne '/') {
  throw 'This script is for the local development app only. Use http://127.0.0.1:5173.'
}
$data = Get-Content -LiteralPath $File -Raw | ConvertFrom-Json
if (-not $data.rows -or -not $data.sourceFile) { throw 'Expected a JSON object with sourceFile and rows.' }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.Cookies.Add($uri, ([System.Net.Cookie]::new('__sites_local_auth','1','/')))
$directory = Join-Path $env:USERPROFILE 'MediBill-Local-Backups'
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss_fff'
$payload = @{ action='preview'; sourceFile=$data.sourceFile; rows=@($data.rows) }
$endpoint = $BaseUrl.TrimEnd('/') + '/api/inventory/rates/import'
function Send-Import($body) {
  try {
    return Invoke-RestMethod -Uri $endpoint -Method Post -WebSession $session -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 20)))
  } catch {
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
    throw
  }
}
function Save-Reports($plan, [string]$label) {
  $prefix = Join-Path $directory "rate_import_${stamp}_${label}"
  $plan | ConvertTo-Json -Depth 25 | Set-Content -LiteralPath "$prefix.json" -Encoding UTF8
  @($plan.issues | Where-Object { $_.status -eq 'unmatched' }) | Export-Csv -LiteralPath "${prefix}_unmatched.csv" -NoTypeInformation -Encoding UTF8
  @($plan.issues) | Export-Csv -LiteralPath "${prefix}_review.csv" -NoTypeInformation -Encoding UTF8
  @($plan.updates) | Select-Object id,product,batch,pack,mrp,oldRate,newRate,originalRate,rateDivisor,unit,@{Name='sourceRows';Expression={$_.sourceRows -join ','}} | Export-Csv -LiteralPath "${prefix}_changes.csv" -NoTypeInformation -Encoding UTF8
  Write-Host "Reports saved: $prefix.json and CSV files"
}
$preview = Send-Import $payload
Save-Reports $preview 'preview'
$preview.summary | Format-List | Out-Host
$preview.updates | Select-Object product,batch,pack,oldRate,newRate | Format-Table -AutoSize | Out-Host
if (-not $Apply) { Write-Host 'Preview only. Run again with -Apply after reviewing the CSV files.'; exit 0 }
if (@($preview.updates).Count -eq 0) { Write-Host 'No safe changes to apply. Check the review and unmatched CSV files.'; exit 0 }
$confirmation = Read-Host 'Only Rate will change. A backup will be created. Type UPDATE to confirm'
if ($confirmation -cne 'UPDATE') { Write-Host 'Cancelled. No rates changed.'; exit 0 }
# Download a full local safety copy BEFORE any rates are changed.
$backup = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/backups') -Method Post -WebSession $session -ContentType 'application/json' -Body '{}'
if (-not $backup.downloadUrl) { throw 'Backup did not return a download URL. Rates were not changed.' }
$downloadUri = [Uri]::new($uri, [string]$backup.downloadUrl)
if ($downloadUri.Scheme -ne $uri.Scheme -or $downloadUri.Host -ne $uri.Host -or $downloadUri.Port -ne $uri.Port) { throw 'Unexpected backup download location. Rates were not changed.' }
$backupFile = Join-Path $directory "medibill_before_rate_import_$stamp.json"
Invoke-WebRequest -Uri $downloadUri.AbsoluteUri -WebSession $session -OutFile $backupFile -UseBasicParsing | Out-Null
$backupData = Get-Content -LiteralPath $backupFile -Raw | ConvertFrom-Json
if (-not $backupData.format -or -not $backupData.tenantId) { throw 'Backup validation failed. Rates were not changed.' }
Write-Host "Full safety backup saved: $backupFile"
$payload.action='apply'
$payload.confirm_update=$true
$payload.planHash=$preview.planHash
$result = Send-Import $payload
Save-Reports $result 'applied'
Write-Host "Updated $($result.updated) inventory batch rates. Refresh Inventory & Stock."

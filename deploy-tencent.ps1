param(
  [Parameter(Mandatory = $true)]
  [string]$EnvId,

  [string]$CloudPath = "/yinxie"
)

$ErrorActionPreference = "Stop"

Write-Host "Deploying static site to CloudBase environment '$EnvId' at '$CloudPath'..."
Write-Host "Deleting old CloudBase hosting files first, so stale COS metadata such as Content-Disposition: attachment is removed..."
npx tcb hosting delete $CloudPath --dir --force -e $EnvId

Write-Host "Uploading current static files..."
npx tcb hosting deploy . $CloudPath -e $EnvId

Write-Host ""
Write-Host "Deployment complete. If the browser still downloads index.html, purge CDN/cache in the CloudBase console and redeploy with this script."

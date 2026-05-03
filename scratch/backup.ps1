# Backup Script
$date = Get-Date -Format "yyyy-MM-dd_HHmm"
$destination = "backups/backup_$date.zip"
Write-Host "Creando backup en $destination..."
Get-ChildItem -Exclude node_modules, .git, dist, backups | Compress-Archive -DestinationPath $destination -Force
Write-Host "Backup completado con éxito."

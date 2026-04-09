# setup-wsl-portproxy.ps1
# Forward Windows ports 3000 & 8000 ke WSL2 IP (untuk akses dari komputer lain di LAN)
# Jalankan di Windows PowerShell sebagai Administrator

param(
    [string]$WslIp = ""
)

# Jika WslIp tidak diberikan, ambil dari WSL
if ([string]::IsNullOrWhiteSpace($WslIp)) {
    try {
        # wsl command should be available on Windows 10+ if WSL installed
        $WslIpRaw = wsl hostname -I 2>$null
        if ($LASTEXITCODE -eq 0 -and $WslIpRaw) {
            $WslIp = $WslIpRaw.Trim()
        } else {
            # fallback: try to read from WSL /etc/resolv.conf via wsl
            $Resolv = wsl cat /etc/resolv.conf 2>$null
            if ($Resolv) {
                $WslIp = ($Resolv -split "`n" | Where-Object { $_ -match '^nameserver\s+' }) | ForEach-Object { $_ -replace '^nameserver\s+', '' } | Select-Object -First 1
            }
        }
    } catch {
        Write-Error "Gagal mendapatkan WSL IP. Berikan parameter -WslIp <IP_WSL>."
        exit 1
    }
}

if ([string]::IsNullOrWhiteSpace($WslIp)) {
    Write-Error "Tidak dapat mendeteksi WSL IP. Pastikan WSL berjalan atau berikan -WslIp."
    exit 1
}

Write-Host "WSL IP terdeteksi: $WslIp" -ForegroundColor Cyan

# Hapus rules lama (jika ada)
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=0.0.0.0 2>$null
netsh interface portproxy delete v4tov4 listenport=8000 listenaddress=0.0.0.0 2>$null

# Tambah rules baru
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3000 connectaddress=$WslIp connectport=3000
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8000 connectaddress=$WslIp connectport=8000

Write-Host "✅ Port forwarding configured:" -ForegroundColor Green
Write-Host "   Windows 0.0.0.0:3000 -> $WslIp:3000 (frontend)"
Write-Host "   Windows 0.0.0.0:8000 -> $WslIp:8000 (backend)"
Write-Host ""

# Add Windows Firewall rules (if not already present)
try {
    New-NetFirewallRule -DisplayName "BMBB Frontend" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "BMBB Backend" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -ErrorAction SilentlyContinue
    Write-Host "✅ Firewall rules added (or already existed)." -ForegroundColor Green
} catch {
    Write-Warning "Failed to add firewall rules. You may need to add them manually."
}
Write-Host ""
Write-Host "🌐 After this, access the app from other computers using:" -ForegroundColor Cyan
# Determine Windows host IP (from WSL perspective, we can get via PowerShell from within this script? We could, but simpler: just tell them to get IP from ipconfig)
Write-Host "   http://<Windows-host-IP>:3000"
Write-Host "   (Find Windows host IP via 'ipconfig' on Windows, look for IPv4 of your active network adapter.)"

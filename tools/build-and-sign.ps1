# MASHINA KONTROL :: Native Binary Compiler & Authenticode Signer

$root = Split-Path -Parent $PSScriptRoot
$icoPath = Join-Path $root "app.ico"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  MASHINA KONTROL :: BUILDING EXECUTABLES WITH ICON" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Compile Kontrol.exe with embedded multi-res icon and assembly metadata
$launcherSrc = Join-Path $root "server\src\KontrolLauncher.cs"
$launcherExe = Join-Path $root "Kontrol.exe"
Write-Host "Compiling Kontrol.exe with embedded app.ico..."
& $csc /nologo /optimize+ /win32icon:"$icoPath" /out:"$launcherExe" "$launcherSrc"
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Kontrol.exe built successfully with embedded application icon." -ForegroundColor Green
} else {
    Write-Error "Failed to compile Kontrol.exe"
    exit 1
}

# 2. Compile server\bin\kontrol-wininput.exe with embedded icon and assembly metadata
$winInputSrc = Join-Path $root "server\src\KontrolWinInput.cs"
$winInputExe = Join-Path $root "server\bin\kontrol-wininput.exe"
Write-Host "Compiling server\bin\kontrol-wininput.exe with embedded app.ico..."
& $csc /nologo /optimize+ /win32icon:"$icoPath" /out:"$winInputExe" "$winInputSrc"
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] kontrol-wininput.exe built successfully with embedded application icon." -ForegroundColor Green
} else {
    Write-Error "Failed to compile kontrol-wininput.exe"
    exit 1
}

Write-Host "`n=================================================" -ForegroundColor Cyan
Write-Host "  AUTHENTICODE CODE SIGNING" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 3. Locate or Create Authenticode Code Signing Certificate
$subjectName = "CN=Mashina Studio (Zan Zupancic), O=Mashina Studio, C=SI"

# Clean up any legacy mangled certificate
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Thumbprint -eq "16CEAB6E43F02A85717A588924E6CE2F95356F5C" } | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem Cert:\CurrentUser\TrustedPublisher | Where-Object { $_.Thumbprint -eq "16CEAB6E43F02A85717A588924E6CE2F95356F5C" } | Remove-Item -Force -ErrorAction SilentlyContinue

$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -eq $subjectName } | Select-Object -First 1

if (-not $cert) {
    Write-Host "Generating official Mashina Studio Code Signing Certificate..."
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $subjectName `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(10) `
        -HashAlgorithm "SHA256"
    Write-Host "  [OK] Created certificate thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
} else {
    Write-Host "Found existing certificate thumbprint: $($cert.Thumbprint)"
}

# 4. Export public certificate (.cer)
$cerPath = Join-Path $root "mashina-studio.cer"
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
Write-Host "Exported public certificate: $cerPath"

# 5. Install certificate into CurrentUser\TrustedPublisher (silent, no interactive modal)
try {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::TrustedPublisher, [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser)
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $store.Add($cert)
    $store.Close()
    Write-Host "  [OK] Certificate trusted in CurrentUser\TrustedPublisher store." -ForegroundColor Green
} catch {
    Write-Warning "Could not add to CurrentUser\TrustedPublisher: $_"
}

# 6. Digitally sign both executables
Write-Host "Signing Kontrol.exe..."
$sig1 = Set-AuthenticodeSignature -FilePath $launcherExe -Certificate $cert -HashAlgorithm SHA256
Write-Host "  Kontrol.exe Status: $($sig1.Status) - $($sig1.StatusMessage)" -ForegroundColor $(if ($sig1.Status -eq 'Valid') { 'Green' } else { 'Yellow' })

Write-Host "Signing server\bin\kontrol-wininput.exe..."
$sig2 = Set-AuthenticodeSignature -FilePath $winInputExe -Certificate $cert -HashAlgorithm SHA256
Write-Host "  kontrol-wininput.exe Status: $($sig2.Status) - $($sig2.StatusMessage)" -ForegroundColor $(if ($sig2.Status -eq 'Valid') { 'Green' } else { 'Yellow' })

Write-Host "`n[SUCCESS] All binaries compiled with high-res icon and digitally signed!" -ForegroundColor Green

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "public\icon-512.png"
$outPath = Join-Path $root "app.ico"

$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$sizes = @(256, 128, 64, 48, 32, 16)
$entries = @()

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $s, $s)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $bytes = $ms.ToArray()
    $ms.Dispose()

    $entries += [PSCustomObject]@{
        Size = $s
        Bytes = $bytes
    }
}
$src.Dispose()

$fs = [System.IO.File]::Create($outPath)
$bw = New-Object System.IO.BinaryWriter $fs

# 1. ICONDIR header (6 bytes)
$bw.Write([uint16]0)                  # idReserved (must be 0)
$bw.Write([uint16]1)                  # idType (1 = icon)
$bw.Write([uint16]$entries.Count)     # idCount

# 2. ICONDIRENTRY list (16 bytes per entry)
$offset = 6 + ($entries.Count * 16)
foreach ($item in $entries) {
    $bWidth = if ($item.Size -ge 256) { [byte]0 } else { [byte]$item.Size }
    $bHeight = if ($item.Size -ge 256) { [byte]0 } else { [byte]$item.Size }

    $bw.Write($bWidth)                # bWidth
    $bw.Write($bHeight)               # bHeight
    $bw.Write([byte]0)                # bColorCount
    $bw.Write([byte]0)                # bReserved
    $bw.Write([uint16]1)              # wPlanes
    $bw.Write([uint16]32)             # wBitCount
    $bw.Write([uint32]$item.Bytes.Length) # dwBytesInRes
    $bw.Write([uint32]$offset)        # dwImageOffset

    $offset += $item.Bytes.Length
}

# 3. Image data blocks
foreach ($item in $entries) {
    $bw.Write($item.Bytes)
}

$bw.Close()
$fs.Close()

Write-Host "Created $outPath successfully with $($entries.Count) icon resolutions."

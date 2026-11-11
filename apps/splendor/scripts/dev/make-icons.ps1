# 生成 Tauri 所需的应用图标（原创宝石菱形图案）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\..\packages\desktop\src-tauri\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-IconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $scale = $size / 256.0

    # 深色圆角背景
    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = [int](44 * $scale)
    $bgPath.AddArc(0, 0, $r, $r, 180, 90)
    $bgPath.AddArc($size - $r, 0, $r, $r, 270, 90)
    $bgPath.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
    $bgPath.AddArc(0, $size - $r, $r, $r, 90, 90)
    $bgPath.CloseFigure()
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 14, 20, 34))
    $g.FillPath($bgBrush, $bgPath)

    # 宝石菱形（蓝→绿渐变）
    $pts = @(
        (New-Object System.Drawing.PointF([float](128 * $scale), [float](30 * $scale))),
        (New-Object System.Drawing.PointF([float](226 * $scale), [float](128 * $scale))),
        (New-Object System.Drawing.PointF([float](128 * $scale), [float](226 * $scale))),
        (New-Object System.Drawing.PointF([float](30 * $scale), [float](128 * $scale)))
    )
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF([float](40 * $scale), [float](40 * $scale))),
        (New-Object System.Drawing.PointF([float](216 * $scale), [float](216 * $scale))),
        [System.Drawing.Color]::FromArgb(255, 124, 196, 255),
        [System.Drawing.Color]::FromArgb(255, 63, 208, 143)
    )
    $g.FillPolygon($grad, $pts)

    # 内层高光面
    $inner = @(
        (New-Object System.Drawing.PointF([float](128 * $scale), [float](62 * $scale))),
        (New-Object System.Drawing.PointF([float](192 * $scale), [float](128 * $scale))),
        (New-Object System.Drawing.PointF([float](128 * $scale), [float](194 * $scale))),
        (New-Object System.Drawing.PointF([float](64 * $scale), [float](128 * $scale)))
    )
    $hi = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 255, 255, 255))
    $g.FillPolygon($hi, $inner)

    # 金币点缀（右上）
    $gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 246, 196, 83))
    $g.FillEllipse($gold, [float](178 * $scale), [float](26 * $scale), [float](52 * $scale), [float](52 * $scale))

    $g.Dispose()
    return $bmp
}

foreach ($size in @(256, 128, 32)) {
    $bmp = New-IconBitmap $size
    $path = Join-Path $outDir ("icon-{0}.png" -f $size)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "已生成 $path"
}

# Tauri 约定文件名
Copy-Item (Join-Path $outDir "icon-256.png") (Join-Path $outDir "icon.png") -Force
Copy-Item (Join-Path $outDir "icon-128.png") (Join-Path $outDir "128x128.png") -Force
Copy-Item (Join-Path $outDir "icon-32.png") (Join-Path $outDir "32x32.png") -Force
Copy-Item (Join-Path $outDir "icon-128.png") (Join-Path $outDir "128x128@2x.png") -Force

# ICO（取 256 尺寸）
$bmp = New-IconBitmap 256
$hicon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hicon)
$fs = [System.IO.File]::Create((Join-Path $outDir "icon.ico"))
$icon.Save($fs)
$fs.Close()
$bmp.Dispose()
Write-Output "已生成 icon.ico"

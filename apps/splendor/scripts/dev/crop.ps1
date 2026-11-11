param(
    [string]$In = "D:\yihe\splendor\data\tmp\photo-a.jpg",
    [string]$Out = "D:\yihe\splendor\data\tmp",
    [string]$Prefix = "crop"
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($In)
Write-Output ("size: {0}x{1}" -f $img.Width, $img.Height)

function Save-Crop {
    param([int]$x, [int]$y, [int]$w, [int]$h, [string]$name)
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $path = Join-Path $Out ("{0}-{1}.jpg" -f $Prefix, $name)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $g.Dispose(); $bmp.Dispose()
    Write-Output $path
}

# 右列（第 9 列，5 张二级 5 费卡）
$colX = [int]($img.Width * 0.855)
Save-Crop $colX 0 ($img.Width - $colX) $img.Height "rightcol"
# 顶行（白色加成 8 张一级卡 + 第 9 列）
Save-Crop 0 0 $img.Width ([int]($img.Height * 0.21)) "toprow"
# 右下角单卡放大（红加成 5 费卡）
$cw = [int]($img.Width * 0.145)
$ch = [int]($img.Height * 0.21)
Save-Crop ($img.Width - $cw) ([int]($img.Height * 0.58)) $cw $ch "red5"
# 左下角单卡放大（黑加成 5 费卡）
Save-Crop ($img.Width - $cw) ([int]($img.Height * 0.79)) $cw $ch "black5"
$img.Dispose()

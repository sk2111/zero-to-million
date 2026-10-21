param([string[]]$In, [string]$Out, [int]$Cols = 2, [double]$Scale = 0.5, [int]$CropH = 0)
# Tiles screenshots into one image, each scaled down (and cut to the top CropH pixels first, if given).
Add-Type -AssemblyName System.Drawing
$imgs = $In | ForEach-Object { [System.Drawing.Image]::FromFile($_) }
$w = [int]($imgs[0].Width * $Scale); $h0 = if ($CropH -gt 0) { $CropH } else { $imgs[0].Height }; $h = [int]($h0 * $Scale)
$rows = [math]::Ceiling($imgs.Count / $Cols)
$dst = New-Object System.Drawing.Bitmap ($w * $Cols), ($h * $rows)
$g = [System.Drawing.Graphics]::FromImage($dst); $g.Clear([System.Drawing.Color]::White)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
for ($i = 0; $i -lt $imgs.Count; $i++) {
  $x = ($i % $Cols) * $w; $y = [math]::Floor($i / $Cols) * $h
  $g.DrawImage($imgs[$i], (New-Object System.Drawing.Rectangle $x, $y, $w, $h), (New-Object System.Drawing.Rectangle 0, 0, $imgs[$i].Width, $h0), [System.Drawing.GraphicsUnit]::Pixel)
}
$dst.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $dst.Dispose(); $imgs | ForEach-Object { $_.Dispose() }
"montage $Out"

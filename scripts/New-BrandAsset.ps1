param(
    [Parameter(Mandatory = $true)] [string] $DestinationPng
)

Add-Type -AssemblyName System.Drawing

$size = 512
$bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

function New-RoundedRectanglePath([System.Drawing.RectangleF] $rectangle, [float] $radius) {
    $diameter = $radius * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($rectangle.Left, $rectangle.Top, $diameter, $diameter, 180, 90)
    $path.AddArc($rectangle.Right - $diameter, $rectangle.Top, $diameter, $diameter, 270, 90)
    $path.AddArc($rectangle.Right - $diameter, $rectangle.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($rectangle.Left, $rectangle.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $notePath = New-RoundedRectanglePath ([System.Drawing.RectangleF]::new(42, 42, 428, 428)) 76
    $noteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#FFD453'))
    $graphics.FillPath($noteBrush, $notePath)

    $inkPen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#3E3B37'), 34)
    $inkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $inkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($inkPen, 135, 177, 377, 177)
    $graphics.DrawLine($inkPen, 135, 256, 377, 256)
    $graphics.DrawLine($inkPen, 135, 335, 316, 335)

    $accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#F36F5F'))
    $graphics.FillEllipse($accentBrush, 352, 318, 34, 34)

    $destinationDirectory = Split-Path -Parent $DestinationPng
    if ($destinationDirectory) { New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null }
    $bitmap.Save($DestinationPng, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    if ($accentBrush) { $accentBrush.Dispose() }
    if ($inkPen) { $inkPen.Dispose() }
    if ($noteBrush) { $noteBrush.Dispose() }
    if ($notePath) { $notePath.Dispose() }
    $graphics.Dispose()
    $bitmap.Dispose()
}


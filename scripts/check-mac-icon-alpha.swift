import AppKit
import Foundation

let iconPaths = Array(CommandLine.arguments.dropFirst())
guard !iconPaths.isEmpty else {
  fputs("Provide at least one PNG icon path.\n", stderr)
  exit(2)
}

for iconPath in iconPaths {
  guard
    let image = NSImage(contentsOfFile: iconPath),
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff)
  else {
    fputs("Could not decode icon: \(iconPath)\n", stderr)
    exit(1)
  }

  let width = bitmap.pixelsWide
  let height = bitmap.pixelsHigh
  guard width > 1, height > 1 else {
    fputs("Icon is too small: \(iconPath)\n", stderr)
    exit(1)
  }

  let corners: [CGFloat] = [
    bitmap.colorAt(x: 0, y: 0)?.alphaComponent ?? CGFloat(1),
    bitmap.colorAt(x: width - 1, y: 0)?.alphaComponent ?? CGFloat(1),
    bitmap.colorAt(x: 0, y: height - 1)?.alphaComponent ?? CGFloat(1),
    bitmap.colorAt(x: width - 1, y: height - 1)?.alphaComponent ?? CGFloat(1)
  ]
  guard corners.allSatisfy({ $0 < 0.01 }) else {
    fputs("Icon corners must be transparent: \(iconPath)\n", stderr)
    exit(1)
  }

  var minX = width
  var minY = height
  var maxX = -1
  var maxY = -1
  for y in 0..<height {
    for x in 0..<width {
      let alpha = bitmap.colorAt(x: x, y: y)?.alphaComponent ?? CGFloat(0)
      if alpha > 0.01 {
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
      }
    }
  }

  guard maxX >= minX, maxY >= minY else {
    fputs("Icon has no visible pixels: \(iconPath)\n", stderr)
    exit(1)
  }

  let visibleWidthRatio = Double(maxX - minX + 1) / Double(width)
  let visibleHeightRatio = Double(maxY - minY + 1) / Double(height)
  // Small icon sizes are quantized heavily, so a single antialiased edge pixel
  // can shift the measured bounds by more than five percent. Enforce artwork
  // scale on high-resolution sources while checking transparent corners at all
  // resolutions.
  if width >= 256, height >= 256 {
    guard visibleWidthRatio >= 0.84, visibleWidthRatio <= 0.90,
          visibleHeightRatio >= 0.84, visibleHeightRatio <= 0.90 else {
      fputs(
        "Icon visible bounds are outside the expected macOS range: \(iconPath) " +
          "(width=\(visibleWidthRatio), height=\(visibleHeightRatio))\n",
        stderr
      )
      exit(1)
    }
  }

  print(
    "Verified transparent macOS icon: \(iconPath) " +
      "bounds=\(minX),\(minY)...\(maxX),\(maxY)"
  )
}

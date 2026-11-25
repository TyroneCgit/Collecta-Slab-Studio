import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Draw at the export size so the rim and the stacked contours stay distinct in the Dock.
let output = URL(fileURLWithPath: CommandLine.arguments[1])
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: r, green: g, blue: b, alpha: a)
}
func roundRect(_ rect: CGRect, _ radius: CGFloat) -> CGPath {
    CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
}

func makeIcon(size: Int) throws -> Data {
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                            bytesPerRow: size * 4, space: colorSpace,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let scale = CGFloat(size) / 1024
    context.scaleBy(x: scale, y: scale)
    let square = roundRect(CGRect(x: 80, y: 80, width: 864, height: 864), 190)
    context.saveGState()
    context.setShadow(offset: CGSize(width: 0, height: -12), blur: 28, color: color(0.06,0.05,0.1,0.32))
    context.addPath(square)
    context.setFillColor(color(0.12, 0.11, 0.15))
    context.fillPath()
    context.restoreGState()
    context.saveGState()
    context.addPath(square)
    context.clip()
    let gradient = CGGradient(colorsSpace: colorSpace,
        colors: [color(0.1,0.095,0.13), color(0.2,0.18,0.26), color(0.29,0.25,0.35)] as CFArray,
        locations: [0,0.70,1])!
    context.drawLinearGradient(gradient, start: CGPoint(x: 800, y: 160),
                               end: CGPoint(x: 216, y: 944), options: [.drawsBeforeStartLocation,.drawsAfterEndLocation])
    context.restoreGState()
    context.addPath(square)
    context.setStrokeColor(color(0.73,0.69,0.82,0.38))
    context.setLineWidth(3)
    context.strokePath()
    context.translateBy(x: 512, y: 512)
    context.rotate(by: -.pi / 13)
    for level in 0..<3 {
        let offset = CGFloat(level - 1)
        let box = CGRect(x: -154 + 45 * offset, y: -235 - 7 * offset, width: 308, height: 470)
        context.addPath(roundRect(box, 30))
        context.setFillColor(color(0.18 + CGFloat(level) * 0.026, 0.16 + CGFloat(level) * 0.024, 0.23 + CGFloat(level) * 0.035))
        context.setLineWidth(15)
        context.setStrokeColor([color(0.40,0.49,0.64), color(0.52,0.69,0.80), color(0.67,0.92,0.92)][level])
        context.drawPath(using: .fillStroke)
        if level == 2 {
            context.move(to: CGPoint(x: box.minX + 30, y: box.maxY - 92))
            context.addLine(to: CGPoint(x: box.maxX - 30, y: box.maxY - 92))
            context.setLineCap(.round)
            context.setLineWidth(11)
            context.strokePath()
        }
    }
    let png = NSMutableData()
    guard let image = context.makeImage(),
          let target = CGImageDestinationCreateWithData(png, UTType.png.identifier as CFString, 1, nil) else {
        throw CocoaError(.fileWriteUnknown)
    }
    CGImageDestinationAddImage(target, image, nil)
    guard CGImageDestinationFinalize(target) else { throw CocoaError(.fileWriteUnknown) }
    return png as Data
}

func chunk(_ type: String, _ payload: Data) -> Data {
    var length = UInt32(8 + payload.count).bigEndian
    var data = Data(type.utf8)
    withUnsafeBytes(of: &length) { data.append(contentsOf: $0) }
    data.append(payload)
    return data
}

var icons = Data()
for (type, pixels) in [("icp4", 16), ("icp5", 32), ("icp6", 64), ("ic07", 128),
                       ("ic08", 256), ("ic09", 512), ("ic10", 1024)] {
    icons.append(chunk(type, try makeIcon(size: pixels)))
}
try chunk("icns", icons).write(to: output, options: .atomic)

import AppKit
import ImageIO
import UniformTypeIdentifiers
import WebKit

private struct StudioFailure: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

final class StudioBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let bootstrap = """
    (() => {
      const send = (action, fields = {}) => window.webkit.messageHandlers.slab4.postMessage({action, ...fields});
      Object.defineProperty(window, "slabHost", {value: Object.freeze({
        pickImage: side => send("pickImage", {side}),
        saveAsset: (dataURL, suggestedName) => send("saveAsset", {dataURL, suggestedName: suggestedName || "Slab.png"}),
        revealExport: () => send("revealExport"),
        loadDraft: () => send("loadDraft"),
        saveDraft: draft => send("saveDraft", {draft})
      })});
    })();
    """

    weak var window: NSWindow?
    let pageURL: URL
    let draftURL: URL
    private var lastExportURL: URL?
    private let files = DispatchQueue(label: "slab4.local-files", qos: .userInitiated)
    private static let draftLimit = 120 * 1024 * 1024

    static var localDraftURL: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("Slab Studio 4", isDirectory: true).appendingPathComponent("draft.json")
    }

    static func seedFromStandardInput() throws -> Bool {
        let fm = FileManager.default
        guard let url = localDraftURL, let identifier = Bundle.main.bundleIdentifier,
              identifier == "studio.slab.local-editor-4",
              url.pathComponents.contains(identifier) else {
            throw StudioFailure("Version 4 storage is unavailable.")
        }
        guard !fm.fileExists(atPath: url.path) else { return false }
        var bytes = Data()
        while let part = try FileHandle.standardInput.read(upToCount: 128 * 1024), !part.isEmpty {
            guard bytes.count + part.count <= draftLimit else { throw StudioFailure("Draft too large.") }
            bytes.append(part)
        }
        guard let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              value["version"] as? Int == 1, value["label"] is [String: Any],
              value["scene"] is [String: Any] else { throw StudioFailure("Draft unavailable.") }
        let directory = try prepareDraftDirectory(for: url)
        let temporary = directory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: temporary) }
        try bytes.write(to: temporary, options: .withoutOverwriting)
        // Creating the final name as a hard link publishes a complete file and
        // preserves an existing draft even if two launches race.
        do { try fm.linkItem(at: temporary, to: url) }
        catch {
            if fm.fileExists(atPath: url.path) { return false }
            throw error
        }
        return true
    }

    @discardableResult
    private static func prepareDraftDirectory(for url: URL) throws -> URL {
        var directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var settings = URLResourceValues()
        settings.isExcludedFromBackup = true
        try directory.setResourceValues(settings)
        return directory
    }

    init(pageURL: URL, draftURL: URL) {
        self.pageURL = pageURL.standardizedFileURL
        self.draftURL = draftURL
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.standardizedFileURL == pageURL,
              let payload = message.body as? [String: Any],
              let action = payload["action"] as? String else {
            replyHandler(nil, "Only the local editor can use this command.")
            return
        }
        switch action {
        case "pickImage":
            let imageTitles = ["front": "Choose card front", "back": "Choose card back",
                               "qr": "Choose a QR code image"]
            guard let side = payload["side"] as? String, let title = imageTitles[side], let window else {
                replyHandler(nil, "The image picker is unavailable.")
                return
            }
            let panel = NSOpenPanel()
            panel.title = title
            panel.allowedContentTypes = [.png, .jpeg, .heic, .heif, .webP, .gif, .tiff]
            panel.canChooseDirectories = false
            panel.allowsMultipleSelection = false
            panel.beginSheetModal(for: window) { response in
                guard response == .OK, let url = panel.url else {
                    replyHandler(NSNull(), nil)
                    return
                }
                self.perform(replyHandler) { try Self.rasterImage(at: url) }
            }
        case "loadDraft":
            perform(replyHandler) { try self.readDraft() }
        case "saveDraft":
            guard let draft = payload["draft"] as? [String: Any] else {
                replyHandler(nil, "The draft has an invalid format.")
                return
            }
            perform(replyHandler) {
                try self.writeDraft(draft)
                return true
            }
        case "revealExport":
            guard let url = lastExportURL else {
                replyHandler(nil, "Save an asset first.")
                return
            }
            NSWorkspace.shared.activateFileViewerSelecting([url])
            replyHandler(true, nil)
        case "saveAsset":
            guard let dataURL = payload["dataURL"] as? String,
                  dataURL.utf8.count <= Self.draftLimit,
                  let suggested = payload["suggestedName"] as? String,
                  let format = AssetFormat(rawValue: (suggested as NSString).pathExtension.lowercased()),
                  let window else {
                replyHandler(nil, "The export format or file size is unsupported.")
                return
            }
            let panel = NSSavePanel()
            panel.title = format == .usdz ? "Export for Xcode" : "Export graded-card asset"
            if format == .usdz {
                panel.message = "Drag the saved USDZ into your Xcode project and select your app target."
            }
            panel.allowedContentTypes = [UTType(filenameExtension: format.rawValue) ?? .data]
            panel.canCreateDirectories = true
            panel.directoryURL = lastExportURL?.deletingLastPathComponent()
                ?? FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            let candidate = suggested
                .components(separatedBy: CharacterSet(charactersIn: "/:\\").union(.controlCharacters))
                .joined(separator: "-").trimmingCharacters(in: .whitespacesAndNewlines)
            let stem = (candidate as NSString).deletingPathExtension.prefix(120)
            panel.nameFieldStringValue = "\(stem.isEmpty ? "Slab" : String(stem)).\(format.rawValue)"
            panel.beginSheetModal(for: window) { response in
                guard response == .OK, let url = panel.url else {
                    replyHandler(false, nil)
                    return
                }
                self.perform({ value, error in
                    if error == nil { self.lastExportURL = url }
                    replyHandler(value, error)
                }) {
                    try Self.writeAsset(dataURL, format: format, to: url)
                    return true
                }
            }
        default:
            replyHandler(nil, "This editor command is unavailable.")
        }
    }

    private func perform(_ reply: @escaping (Any?, String?) -> Void,
                         _ work: @escaping () throws -> Any) {
        files.async {
            let result = Result { try work() }
            DispatchQueue.main.async {
                switch result {
                case .success(let value): reply(value, nil)
                case .failure(let error): reply(nil, error.localizedDescription)
                }
            }
        }
    }

    func readDraft() throws -> Any {
        guard FileManager.default.fileExists(atPath: draftURL.path) else { return NSNull() }
        guard try draftURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0 <= Self.draftLimit else {
            throw StudioFailure("The saved draft exceeds the local storage limit.")
        }
        let value = try JSONSerialization.jsonObject(with: Data(contentsOf: draftURL))
        guard let object = value as? [String: Any] else {
            throw StudioFailure("The saved draft could not be read.")
        }
        return object
    }

    func writeDraft(_ draft: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: draft)
        guard data.count <= Self.draftLimit else { throw StudioFailure("The draft is too large to save.") }
        try Self.prepareDraftDirectory(for: draftURL)
        try data.write(to: draftURL, options: .atomic)
    }

    enum AssetFormat: String { case png, glb, usdz }

    static func writeAsset(_ dataURL: String, format: AssetFormat, to url: URL) throws {
        guard let comma = dataURL.firstIndex(of: ","),
              dataURL[..<comma].lowercased().hasSuffix(";base64"),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])) else {
            throw StudioFailure("The exported data could not be read.")
        }
        switch format {
        case .png:
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                  CGImageSourceGetType(source) as String? == UTType.png.identifier,
                  CGImageSourceGetCount(source) == 1 else {
                throw StudioFailure("The PNG image is invalid. Try exporting again.")
            }
        case .glb:
            guard data.count >= 20, data.prefix(8) == Data([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]),
                  data[16..<20] == Data("JSON".utf8) else {
                throw StudioFailure("The GLB model is invalid. Try exporting again.")
            }
            let declaredLength = (8..<12).reduce(0) { $0 | (Int(data[$1]) << (8 * ($1 - 8))) }
            guard declaredLength == data.count else {
                throw StudioFailure("The GLB model is incomplete. Try exporting again.")
            }
        case .usdz:
            // The exporter writes a stored ZIP with a USD layer first and no archive comment.
            guard data.count >= 86, data.starts(with: [0x50, 0x4b, 0x03, 0x04]),
                  data[8] == 0, data[9] == 0,
                  data.suffix(22).starts(with: [0x50, 0x4b, 0x05, 0x06]) else {
                throw StudioFailure("The USDZ model is incomplete. Try exporting again.")
            }
        }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let folder = url.deletingLastPathComponent().resolvingSymlinksInPath()
        // A save-panel grant can cover only the output file. Use available folder metadata.
        let location = try? folder.resourceValues(forKeys: [.volumeIsLocalKey, .isUbiquitousItemKey])
        let folderPath = folder.path + "/"
        if location?.volumeIsLocal == false || location?.isUbiquitousItem == true ||
            folderPath.contains("/Library/CloudStorage/") || folderPath.contains("/Library/Mobile Documents/") {
            throw StudioFailure("Choose a local folder outside cloud storage for this export.")
        }
        try data.write(to: url, options: .atomic)
    }

    static func rasterImage(at url: URL) throws -> [String: String] {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let properties = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        guard properties.isRegularFile == true,
              let fileSize = properties.fileSize, fileSize <= 96 * 1024 * 1024 else {
            throw StudioFailure("Choose a local image smaller than 96 MB.")
        }
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let type = CGImageSourceGetType(source) as String?,
              [UTType.png, .jpeg, .heic, .heif, .webP, .gif, .tiff].contains(where: { $0.identifier == type }),
              CGImageSourceGetCount(source) > 0 else {
            throw StudioFailure("Choose a PNG, JPEG, HEIC, WebP, GIF, or TIFF image.")
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 3072
        ]
        guard let pixels = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              let context = CGContext(data: nil, width: pixels.width, height: pixels.height,
                bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw StudioFailure("The image could not be decoded.")
        }
        context.draw(pixels, in: CGRect(x: 0, y: 0, width: pixels.width, height: pixels.height))
        let data = NSMutableData()
        guard let raster = context.makeImage(),
              let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)
        else { throw StudioFailure("The image could not be prepared.") }
        CGImageDestinationAddImage(destination, raster, nil)
        guard CGImageDestinationFinalize(destination) else {
            throw StudioFailure("The image could not be prepared.")
        }
        return ["name": url.lastPathComponent, "dataURL": "data:image/png;base64," + (data as Data).base64EncodedString()]
    }
}

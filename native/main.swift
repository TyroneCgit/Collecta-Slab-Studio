import AppKit
import WebKit

@MainActor
final class StudioApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var web: WKWebView!
    private var bridge: StudioBridge!
    private var loaded = false
    private var quitting = false
    private var lastRecovery: Date?

    func applicationDidFinishLaunching(_ notification: Notification) {
        createMenus()
        let frame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 848)
        let size = NSSize(width: min(1320, frame.width), height: min(850, max(480, frame.height - 32)))
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Slab Studio 2"
        window.contentMinSize = NSSize(width: min(800, size.width), height: min(560, size.height))
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("SlabStudioEditor2")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        guard let root = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true),
              let draftURL = StudioBridge.localDraftURL else {
            showError("The editor could not open.", "Rebuild the application to restore its bundled files.")
            return
        }
        let page = root.appendingPathComponent("index.html")
        bridge = StudioBridge(pageURL: page, draftURL: draftURL)
        bridge.window = window
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.allowsAirPlayForMediaPlayback = false
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        let controller = config.userContentController
        controller.addUserScript(WKUserScript(source: StudioBridge.bootstrap, injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
        controller.addScriptMessageHandler(bridge, contentWorld: .page, name: "slab2")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.allowsLinkPreview = false
        window.contentView = web
        window.makeFirstResponder(web)

        let policy = #"[{"trigger":{"url-filter":"^http"},"action":{"type":"block"}},{"trigger":{"url-filter":"^ws"},"action":{"type":"block"}},{"trigger":{"url-filter":"^ftp"},"action":{"type":"block"}}]"#
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "SlabStudio2OfflineV1",
            encodedContentRuleList: policy) { [weak self] rules, _ in
            guard let self else { return }
            guard let rules else {
                self.showError("The local editor could not start.", "The offline content rules were unavailable.")
                return
            }
            controller.add(rules)
            self.web.loadFileURL(page, allowingReadAccessTo: root)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.targetFrame?.isMainFrame == true &&
                        action.request.url?.standardizedFileURL == bridge.pageURL ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        showError("The editor could not open.", error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loaded = false
        if let lastRecovery, Date().timeIntervalSince(lastRecovery) < 10 {
            showError("The preview could not restart.", "Close Slab Studio 2 and open it again to restore the latest saved draft.")
            return
        }
        lastRecovery = Date()
        webView.loadFileURL(bridge.pageURL, allowingReadAccessTo: bridge.pageURL.deletingLastPathComponent())
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        NSApp.terminate(nil)
        return false
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard loaded else { return .terminateNow }
        guard !quitting else { return .terminateLater }
        quitting = true
        web.callAsyncJavaScript("if (typeof window.slabFlushDraft === 'function') await window.slabFlushDraft(); return true;",
                                arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success: sender.reply(toApplicationShouldTerminate: true)
            case .failure(let error):
                let alert = NSAlert()
                alert.messageText = "The last change could not be saved."
                alert.informativeText = error.localizedDescription
                alert.addButton(withTitle: "Keep Editing")
                alert.addButton(withTitle: "Quit Without Saving")
                alert.beginSheetModal(for: self.window) { response in
                    self.quitting = false
                    sender.reply(toApplicationShouldTerminate: response == .alertSecondButtonReturn)
                }
            }
        }
        return .terminateLater
    }

    private func showError(_ title: String, _ message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.beginSheetModal(for: window)
    }

    @objc private func openExport(_ sender: Any?) {
        guard loaded else { return }
        web.evaluateJavaScript("window.slabOpenExport?.()")
    }

    private func createMenus() {
        let menu = NSMenu()
        let appMenu = NSMenu()
        menu.addItem(withTitle: "Slab Studio 2", action: nil, keyEquivalent: "").submenu = appMenu
        appMenu.addItem(withTitle: "About Slab Studio 2", action: #selector(NSApp.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Slab Studio 2", action: #selector(NSApp.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit Slab Studio 2", action: #selector(NSApp.terminate(_:)), keyEquivalent: "q")
        let file = NSMenu(title: "File")
        menu.addItem(withTitle: "File", action: nil, keyEquivalent: "").submenu = file
        file.addItem(withTitle: "Export Asset…", action: #selector(openExport(_:)), keyEquivalent: "e").target = self
        file.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let edit = NSMenu(title: "Edit")
        menu.addItem(withTitle: "Edit", action: nil, keyEquivalent: "").submenu = edit
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let windows = NSMenu(title: "Window")
        menu.addItem(withTitle: "Window", action: nil, keyEquivalent: "").submenu = windows
        windows.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windows.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        NSApp.windowsMenu = windows
        NSApp.mainMenu = menu
    }
}

// The original app's private draft can be streamed locally when creating this copy.
// The normal Finder launch opens the editor with only its own container.
if Array(CommandLine.arguments.dropFirst()) == ["--seed-draft"] {
    do {
        let seeded = try StudioBridge.seedFromStandardInput()
        print(seeded ? "Initialized an independent draft." : "Kept the existing draft.")
        exit(EXIT_SUCCESS)
    } catch {
        fputs("The independent draft could not be initialized. The original is intact.\n", stderr)
        exit(EXIT_FAILURE)
    }
}

MainActor.assumeIsolated {
    let application = NSApplication.shared
    let delegate = StudioApp()
    application.setActivationPolicy(.regular)
    application.delegate = delegate
    withExtendedLifetime(delegate) { application.run() }
}

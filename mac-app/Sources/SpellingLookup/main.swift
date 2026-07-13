import AppKit

// Menu-bar accessory app: no Dock icon, lives in the status bar.
// Top-level code runs on the main thread, so we assume main-actor isolation.
MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.accessory)
    app.run()
}

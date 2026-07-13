import AppKit
import ApplicationServices
import SwiftUI
import Carbon.HIToolbox

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let popover = NSPopover()
    private let model = LookupModel()
    private var hotKey: GlobalHotKey?

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "textformat.abc", accessibilityDescription: "Spelling Lookup")
            button.action = #selector(togglePopover)
            button.target = self
        }
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(rootView: ContentView(model: model))

        // Global hotkey: ⌘⇧L (kVK_ANSI_L = 0x25).
        hotKey = GlobalHotKey(keyCode: UInt32(kVK_ANSI_L), modifiers: UInt32(cmdKey | shiftKey)) { [weak self] in
            MainActor.assumeIsolated { self?.triggerLookup() }
        }
    }

    @objc private func togglePopover() {
        if popover.isShown {
            popover.performClose(nil)
        } else {
            showPopover()
        }
    }

    private func showPopover() {
        guard let button = statusItem.button else { return }
        // An .accessory app isn't frontmost; activate so the popover takes key focus
        // when triggered by the global hotkey (otherwise it shows but won't accept input).
        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }

    private func triggerLookup() {
        guard ensureAccessibility() else {
            model.phase = .error("Grant Accessibility permission in System Settings ▸ Privacy, then try again.")
            showPopover()
            return
        }
        guard let word = SelectionReader.copySelectedText() else {
            model.phase = .error("No text selected.")
            showPopover()
            return
        }
        model.lookup(word)
        showPopover()
    }

    private func ensureAccessibility() -> Bool {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        return AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
    }
}

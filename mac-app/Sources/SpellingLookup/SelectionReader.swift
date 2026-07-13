import AppKit

// Reads the text currently selected in the frontmost app by synthesising ⌘C
// and reading the pasteboard, then restoring the previous clipboard contents.
// Requires Accessibility permission (to post the key events).
enum SelectionReader {
    private static let kVK_ANSI_C: CGKeyCode = 0x08

    static func copySelectedText() -> String? {
        let pb = NSPasteboard.general
        let previous = pb.string(forType: .string)
        let changeCountBefore = pb.changeCount

        let source = CGEventSource(stateID: .combinedSessionState)
        let down = CGEvent(keyboardEventSource: source, virtualKey: kVK_ANSI_C, keyDown: true)
        let up = CGEvent(keyboardEventSource: source, virtualKey: kVK_ANSI_C, keyDown: false)
        down?.flags = .maskCommand
        up?.flags = .maskCommand
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)

        // Wait briefly for the copy to land on the pasteboard.
        var copied: String?
        let deadline = Date().addingTimeInterval(0.4)
        while Date() < deadline {
            if pb.changeCount != changeCountBefore {
                copied = pb.string(forType: .string)
                break
            }
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02))
        }

        // Restore whatever was on the clipboard before we hijacked it.
        if let previous {
            pb.clearContents()
            pb.setString(previous, forType: .string)
        }

        let trimmed = copied?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed?.isEmpty ?? true) ? nil : trimmed
    }
}

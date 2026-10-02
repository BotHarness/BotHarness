import AppKit

final class QADelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var input: NSTextField!
    var result: NSTextField!

    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 780, height: 420), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "BotHarness Local Computer QA"
        let view = window.contentView!
        let title = NSTextField(labelWithString: "Local Computer verification")
        title.font = .systemFont(ofSize: 28, weight: .semibold)
        title.frame = NSRect(x: 36, y: 330, width: 700, height: 42)
        view.addSubview(title)
        let description = NSTextField(labelWithString: "Type the QA proof into this field, then save it.")
        description.font = .systemFont(ofSize: 16)
        description.frame = NSRect(x: 36, y: 276, width: 700, height: 30)
        view.addSubview(description)
        input = NSTextField(frame: NSRect(x: 36, y: 200, width: 700, height: 40))
        input.placeholderString = "Proof text"
        input.setAccessibilityLabel("QA proof text")
        view.addSubview(input)
        let button = NSButton(title: "Save proof", target: self, action: #selector(saveProof))
        button.frame = NSRect(x: 36, y: 138, width: 140, height: 40)
        button.bezelStyle = .rounded
        view.addSubview(button)
        result = NSTextField(labelWithString: "Waiting for the Bot")
        result.font = .systemFont(ofSize: 18)
        result.frame = NSRect(x: 36, y: 70, width: 700, height: 44)
        view.addSubview(result)
        window.center()
        window.makeKeyAndOrderFront(nil)
    }

    @objc func saveProof() {
        let value = input.stringValue
        do {
            try value.write(toFile: "/private/tmp/bh694-native-proof.txt", atomically: true, encoding: .utf8)
            result.stringValue = "Saved: " + value
        } catch {
            result.stringValue = "Save failed"
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = QADelegate()
app.delegate = delegate
app.run()

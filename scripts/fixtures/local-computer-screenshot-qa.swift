import AppKit

final class VisualMarkerView: NSView {
    let marker: String
    init(frame: NSRect, marker: String) {
        self.marker = marker
        super.init(frame: frame)
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { fatalError("Use the QA initializer") }
    override func draw(_ dirtyRect: NSRect) {
        NSColor.white.setFill()
        bounds.fill()
        NSColor.systemBlue.setFill()
        NSBezierPath(ovalIn: NSRect(x: 42, y: 70, width: 90, height: 90)).fill()
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 48, weight: .bold),
            .foregroundColor: NSColor.black,
        ]
        (marker as NSString).draw(at: NSPoint(x: 168, y: 86), withAttributes: attributes)
    }
}

final class ScreenshotQADelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    func applicationDidFinishLaunching(_ notification: Notification) {
        let marker = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(6))
        let proofFile = ProcessInfo.processInfo.environment["BH_QA_PROOF_FILE"]!
        try! marker.write(toFile: proofFile, atomically: true, encoding: .utf8)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 780, height: 400), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "BotHarness Local Screenshot QA"
        window.backgroundColor = .white
        let title = NSTextField(labelWithString: "Local Computer screenshot verification")
        title.font = .systemFont(ofSize: 24, weight: .semibold)
        title.frame = NSRect(x: 30, y: 320, width: 720, height: 40)
        window.contentView!.addSubview(title)
        let description = NSTextField(labelWithString: "Read the six-character code beside the blue circle from the screenshot.")
        description.frame = NSRect(x: 30, y: 272, width: 720, height: 32)
        window.contentView!.addSubview(description)
        let markerView = VisualMarkerView(frame: NSRect(x: 30, y: 30, width: 720, height: 230), marker: marker)
        window.contentView!.addSubview(markerView)
        window.center()
        window.makeKeyAndOrderFront(nil)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = ScreenshotQADelegate()
app.delegate = delegate
app.run()

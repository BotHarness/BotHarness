import AppKit

final class IdleMarkerView: NSView {
    var marker = ""
    override func draw(_ dirtyRect: NSRect) {
        NSColor.white.setFill()
        bounds.fill()
        NSColor.systemBlue.setFill()
        NSBezierPath(ovalIn: NSRect(x: 30, y: 38, width: 80, height: 80)).fill()
        (marker as NSString).draw(at: NSPoint(x: 145, y: 48), withAttributes: [
            .font: NSFont.monospacedSystemFont(ofSize: 48, weight: .bold),
            .foregroundColor: NSColor.black,
        ])
    }
}

final class IdleQADelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var markerView: IdleMarkerView!
    var counterLabel: NSTextField!
    var clicks = 0
    let markerFile = ProcessInfo.processInfo.environment["BH_QA_PROOF_FILE"] ?? "/private/tmp/bh713-marker.txt"
    let counterFile = ProcessInfo.processInfo.environment["BH_QA_COUNTER_FILE"] ?? "/private/tmp/bh713-counter.txt"
    func applicationDidFinishLaunching(_ notification: Notification) {
        let pidFile = ProcessInfo.processInfo.environment["BH_QA_PID_FILE"] ?? "/private/tmp/bh713-fixture-pid.txt"
        try! String(ProcessInfo.processInfo.processIdentifier).write(toFile: pidFile, atomically: true, encoding: .utf8)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 780, height: 430), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "BotHarness Local Idle QA"
        window.backgroundColor = .white
        window.appearance = NSAppearance(named: .aqua)
        window.collectionBehavior = [.moveToActiveSpace]
        let view = window.contentView!
        let title = NSTextField(labelWithString: "Local Computer idle recovery")
        title.font = .systemFont(ofSize: 25, weight: .semibold)
        title.frame = NSRect(x: 30, y: 355, width: 700, height: 40)
        view.addSubview(title)
        let description = NSTextField(labelWithString: "The next observation must see the new visual code; old tokens must fail.")
        description.frame = NSRect(x: 30, y: 320, width: 720, height: 30)
        view.addSubview(description)
        markerView = IdleMarkerView(frame: NSRect(x: 30, y: 130, width: 720, height: 165))
        markerView.setAccessibilityElement(false)
        view.addSubview(markerView)
        let button = NSButton(title: "QA click counter", target: self, action: #selector(countClick))
        button.frame = NSRect(x: 30, y: 65, width: 180, height: 40)
        button.bezelStyle = .rounded
        view.addSubview(button)
        counterLabel = NSTextField(labelWithString: "Clicks: 0")
        counterLabel.frame = NSRect(x: 240, y: 69, width: 440, height: 32)
        view.addSubview(counterLabel)
        try! "0".write(toFile: counterFile, atomically: true, encoding: .utf8)
        updateMarker()
        Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in self?.updateMarker() }
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    func updateMarker() {
        guard let marker = try? String(contentsOfFile: markerFile, encoding: .utf8), marker != markerView.marker else { return }
        markerView.marker = marker
        markerView.needsDisplay = true
    }
    @objc func countClick() {
        clicks += 1
        counterLabel.stringValue = "Clicks: \(clicks)"
        try! String(clicks).write(toFile: counterFile, atomically: true, encoding: .utf8)
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = IdleQADelegate()
app.delegate = delegate
app.run()

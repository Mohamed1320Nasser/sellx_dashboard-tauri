import Foundation
import AppKit
import WebKit

// ── Args ──
guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: html2escpos <input.html> <output.bin> [viewport_width] [printer_dots]\n", stderr)
    exit(1)
}

let htmlPath   = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
let viewportW: CGFloat = CommandLine.arguments.count >= 4
    ? CGFloat(Double(CommandLine.arguments[3]) ?? 272) : 272
let printerDots: Int = CommandLine.arguments.count >= 5
    ? Int(CommandLine.arguments[4]) ?? 576 : 576

let isDebug = ProcessInfo.processInfo.environment["SULTANA_DEBUG_PRINT"] != nil

func debugLog(_ msg: String) {
    if isDebug { fputs("[html2escpos] \(msg)\n", stderr) }
}

// ── App setup (headless) ──
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

// Start with a LARGE height so all content renders without overflow.
// This ensures WebKit computes full layout before we measure.
let initialH: CGFloat = 8000

let win = NSWindow(
    contentRect: NSRect(x: -10000, y: -10000, width: viewportW, height: initialH),
    styleMask: [.borderless], backing: .buffered, defer: false)
win.isReleasedWhenClosed = false

let webCfg = WKWebViewConfiguration()
let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: viewportW, height: initialH), configuration: webCfg)
win.contentView = wv

// ── Render single-page PDF to ESC/POS raster commands ──
// Uses createPDF() instead of takeSnapshot() — handles long receipts reliably.
// Renders at 2× printer resolution then downscales for sharp Arabic text.
func pdfToEscPos(_ pdfData: Data) -> Data? {
    guard let provider = CGDataProvider(data: pdfData as CFData),
          let pdf = CGPDFDocument(provider),
          let page = pdf.page(at: 1) else { return nil }

    let box = page.getBoxRect(.mediaBox)
    let w   = printerDots                                // 576
    let h   = Int(ceil(box.height * CGFloat(w) / box.width))

    debugLog("PDF page: \(box.width)×\(box.height) → bitmap: \(w)×\(h)")

    // ── Step 1: Render PDF at 2× printer resolution (~305 DPI) ──
    let ss   = 2                                         // supersampling factor
    let ssW  = w * ss                                    // 1152
    let ssH  = h * ss
    let ssSc = CGFloat(ssW) / box.width                  // ~4.24

    guard let ssCtx = CGContext(
        data: nil, width: ssW, height: ssH,
        bitsPerComponent: 8, bytesPerRow: ssW,
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else { return nil }

    ssCtx.setFillColor(gray: 1.0, alpha: 1.0)
    ssCtx.fill(CGRect(x: 0, y: 0, width: ssW, height: ssH))
    ssCtx.setShouldAntialias(true)
    ssCtx.setAllowsAntialiasing(true)
    ssCtx.scaleBy(x: ssSc, y: ssSc)
    ssCtx.drawPDFPage(page)

    guard let ssImage = ssCtx.makeImage() else { return nil }

    // ── Step 2: Downscale to printer resolution with high-quality interpolation ──
    guard let ctx = CGContext(
        data: nil, width: w, height: h,
        bitsPerComponent: 8, bytesPerRow: w,
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else { return nil }

    ctx.interpolationQuality = .high
    ctx.setFillColor(gray: 1.0, alpha: 1.0)
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.draw(ssImage, in: CGRect(x: 0, y: 0, width: w, height: h))

    guard let pixels = ctx.data?.bindMemory(to: UInt8.self, capacity: w * h)
    else { return nil }

    // ── Step 3: Floyd-Steinberg dithering to monochrome ──
    let bpl = (w + 7) / 8
    var bmp = [UInt8](repeating: 0, count: bpl * h)
    var errors = [Float](repeating: 0, count: w * h)
    for i in 0..<(w * h) { errors[i] = Float(pixels[i]) }

    for y in 0..<h {
        for x in 0..<w {
            let idx = y * w + x
            let oldVal = errors[idx]
            let newVal: Float = oldVal < 128 ? 0 : 255
            let err = oldVal - newVal

            if newVal == 0 {
                bmp[y * bpl + x / 8] |= UInt8(1 << (7 - x % 8))
            }

            if x + 1 < w            { errors[idx + 1]       += err * 7 / 16 }
            if y + 1 < h && x > 0   { errors[(y+1)*w + x-1] += err * 3 / 16 }
            if y + 1 < h            { errors[(y+1)*w + x]   += err * 5 / 16 }
            if y + 1 < h && x+1 < w { errors[(y+1)*w + x+1] += err * 1 / 16 }
        }
    }

    // ── Step 4: Build ESC/POS raster bands (256 lines each) ──
    let bandHeight = 256
    var cmd = Data()
    cmd.append(contentsOf: [0x1B, 0x40] as [UInt8])                     // ESC @  — initialize

    var row = 0
    while row < h {
        let lines  = min(bandHeight, h - row)
        let offset = row * bpl
        let count  = lines * bpl

        cmd.append(contentsOf: [0x1D, 0x76, 0x30, 0x00] as [UInt8])     // GS v 0 0
        cmd.append(UInt8(bpl & 0xFF));  cmd.append(UInt8((bpl >> 8) & 0xFF))
        cmd.append(UInt8(lines & 0xFF)); cmd.append(UInt8((lines >> 8) & 0xFF))
        cmd.append(contentsOf: bmp[offset..<(offset + count)])

        row += lines
    }

    cmd.append(contentsOf: [0x1B, 0x64, 0x06] as [UInt8])               // ESC d 6  — feed 6 lines (increased)
    cmd.append(contentsOf: [0x1D, 0x56, 0x00] as [UInt8])               // GS V 0   — cut

    debugLog("ESC/POS: \(cmd.count) bytes")
    return cmd
}

// ── Helpers ──

/// Measure content height using requestAnimationFrame to ensure paint is complete.
/// Returns the height via callback.
func measureAfterPaint(_ webView: WKWebView, callback: @escaping (CGFloat) -> Void) {
    // Use double-rAF pattern: after two animation frames, the layout is guaranteed settled.
    let js = """
    new Promise(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Force synchronous layout
                document.body.offsetHeight;
                resolve(document.body.scrollHeight);
            });
        });
    })
    """
    webView.evaluateJavaScript(js) { result, _ in
        let h = max(result as? CGFloat ?? 500, 50)
        callback(h)
    }
}

/// Resize webview, re-measure until height stabilizes, then create PDF
func finalizeAndExport(_ webView: WKWebView, attempts: Int = 0, lastH: CGFloat = 0) {
    measureAfterPaint(webView) { measuredH in
        debugLog("attempt \(attempts): measured=\(measuredH) last=\(lastH) frame=\(webView.frame.height)")

        // If height changed significantly, resize and re-measure (up to 15 times for very long receipts)
        if attempts < 15 && abs(measuredH - lastH) > 2 {
            webView.frame = NSRect(x: 0, y: 0, width: viewportW, height: measuredH)
            webView.window?.setContentSize(NSSize(width: viewportW, height: measuredH))
            // Give more time for long receipts (increases with attempts)
            let delay = 0.6 + Double(attempts) * 0.1
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                finalizeAndExport(webView, attempts: attempts + 1, lastH: measuredH)
            }
            return
        }

        let finalH = measuredH
        debugLog("stable at \(finalH), waiting before PDF capture...")

        // Resize to exact final height
        webView.frame = NSRect(x: 0, y: 0, width: viewportW, height: finalH)
        webView.window?.setContentSize(NSSize(width: viewportW, height: finalH))

        // Wait for layout to fully settle before PDF capture (longer for tall receipts)
        // For receipts taller than 2000px, give extra time
        let captureDelay = finalH > 2000 ? 3.0 : 2.0
        DispatchQueue.main.asyncAfter(deadline: .now() + captureDelay) {
            let cfg = WKPDFConfiguration()
            cfg.rect = CGRect(x: 0, y: 0, width: viewportW, height: finalH)

            debugLog("capturing PDF at \(viewportW)×\(finalH)")

            webView.createPDF(configuration: cfg) { result in
                switch result {
                case .success(let pdfData):
                    debugLog("PDF captured: \(pdfData.count) bytes")

                    if isDebug {
                        let pdfPath = outputPath.replacingOccurrences(of: ".bin", with: ".pdf")
                        try? pdfData.write(to: URL(fileURLWithPath: pdfPath))
                    }

                    guard let escpos = pdfToEscPos(pdfData) else {
                        debugLog("pdfToEscPos failed")
                        exit(1)
                    }

                    do {
                        try escpos.write(to: URL(fileURLWithPath: outputPath))
                        exit(0)
                    } catch {
                        debugLog("write failed: \(error)")
                        exit(1)
                    }

                case .failure(let err):
                    debugLog("createPDF failed: \(err)")
                    exit(1)
                }
            }
        }
    }
}

// ── Navigation delegate ──
class Del: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        debugLog("navigation finished")

        // 1. Wait for base64 fonts to parse
        webView.evaluateJavaScript("document.fonts.ready.then(() => 'ready')") { _, _ in
            debugLog("fonts ready")

            // 2. Measure content height after paint (webview is already large, so full layout computed)
            measureAfterPaint(webView) { contentH in
                debugLog("initial measure: \(contentH)")

                // 3. Resize webview to actual content height
                webView.frame = NSRect(x: 0, y: 0, width: viewportW, height: contentH)
                webView.window?.setContentSize(NSSize(width: viewportW, height: contentH))

                // 4. Wait for resize reflow, then stabilize and export (increased delay)
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                    finalizeAndExport(webView, lastH: contentH)
                }
            }
        }
    }

    func webView(_ wv: WKWebView, didFail nav: WKNavigation!, withError error: Error) {
        debugLog("navigation failed: \(error)")
        exit(1)
    }
    func webView(_ wv: WKWebView, didFailProvisionalNavigation nav: WKNavigation!, withError error: Error) {
        debugLog("provisional navigation failed: \(error)")
        exit(1)
    }
}

let del = Del()
wv.navigationDelegate = del
wv.loadFileURL(URL(fileURLWithPath: htmlPath), allowingReadAccessTo: URL(fileURLWithPath: "/"))

// Timeout: 90 seconds (increased for very long receipts with many items)
DispatchQueue.global().asyncAfter(deadline: .now() + 90) {
    debugLog("TIMEOUT — aborting")
    exit(1)
}
app.run()

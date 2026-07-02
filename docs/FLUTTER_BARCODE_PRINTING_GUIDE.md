# Flutter Barcode Printing — Complete Cross-Platform Guide
### (USB · LAN · Bluetooth · Serial · System Driver) — Windows & macOS desktop

This guide explains how to build barcode/label printing in a **Flutter desktop
app**, covering **every connection type**, modeled on how the SellX (Tauri/Rust)
app does it. The core idea is the same as SellX:

> **Dart builds the printer command bytes (TSPL/ESC-POS/ZPL). A thin native
> transport layer pushes those raw bytes to the printer.** Dart alone cannot do
> raw USB or raw spooler I/O — exactly why SellX needed Rust. In Flutter the
> native layer is a **platform channel** (or a plugin that wraps one).

---

## 0. Mental model (read this first)

```
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. DATA          barcode value (= product SKU), name, qty     │
 ├─────────────────────────────────────────────────────────────┤
 │ 2. COMMAND       build raw printer bytes (TSPL / ESC-POS / ZPL)│  ← pure Dart, portable
 │                  (+ render Arabic text → 1-bit BITMAP)         │
 ├─────────────────────────────────────────────────────────────┤
 │ 3. TRANSPORT     send those bytes over the chosen channel:     │  ← the part that differs
 │                  USB · LAN · Bluetooth · Serial · OS driver    │
 ├─────────────────────────────────────────────────────────────┤
 │ 4. PRINTER       firmware (TSPL mode) renders the label        │
 └─────────────────────────────────────────────────────────────┘
```

**Key principle:** layers 1–2 are **written once** and shared by all transports.
Only layer 3 changes per connection type. Design your code around a single
interface:

```dart
abstract class PrinterTransport {
  Future<void> connect();
  Future<void> sendBytes(List<int> bytes);
  Future<void> close();
}
```

Every connection type below is just a different `PrinterTransport`
implementation. The TSPL builder (layer 2) never changes.

---

## 1. Printer command languages (know which your printer speaks)

| Language | Used by | Notes |
|---|---|---|
| **TSPL / TSC** | TSC, Xprinter, Godex label printers (what SellX uses) | Best for **labels/barcodes** on sticky rolls |
| **ESC/POS** | Epson, most thermal **receipt** printers | Receipts; barcodes supported but layout is line-based |
| **ZPL** | Zebra | Industrial label standard |
| **CPCL/EPL** | Older Zebra/mobile | Legacy |

> Same as SellX: **set the printer firmware to TSPL mode** for label printing.
> The command bytes you build MUST match the printer's active language.

---

## 2. Layer 2 — Build the command bytes in Dart (portable, write once)

### 2a. Generate the barcode value
The barcode value is just a string (in SellX it's `product.sku`, a 5-digit
local barcode). You don't "draw" CODE128 yourself — the **printer firmware**
renders it from the TSPL `BARCODE` command.

### 2b. TSPL label builder (direct port of SellX's Rust `build_barcode_tspl`)

```dart
/// Build a 35×25mm TSPL label (203 DPI = 280×200 dots).
/// Mirrors SellX layout: company (top), product (mid), CODE128 (bottom).
List<int> buildBarcodeTspl({
  required String barcode,
  String? productName,
  String? companyName,
  String lineEnding = '\r\n', // '\r\n' = Windows-safe; '\n' ok on mac/linux USB
}) {
  final b = StringBuffer();
  void w(String s) => b.write('$s$lineEnding');

  w('SIZE 35 mm,25 mm');
  w('GAP 3 mm,0');
  w('OFFSET 0');
  w('DIRECTION 1');
  w('SET TEAR ON');
  w('CLS');

  // Latin text path (for Arabic, use the BITMAP path in §2c instead)
  if (companyName != null && companyName.isNotEmpty) {
    w('TEXT 10,5,"2",0,1,1,"${_esc(companyName)}"');
  }
  if (productName != null && productName.isNotEmpty) {
    w('TEXT 10,32,"3",0,1,1,"${_esc(productName)}"');
  }

  // CODE128 barcode: x,y,"type",height,human-readable,rotation,narrow,wide,"data"
  w('BARCODE 20,72,"128",70,1,0,2,2,"${_esc(barcode)}"');

  w('PRINT 1');
  return b.toString().codeUnits;
}

String _esc(String s) => s.replaceAll('"', r'\"');
```

### 2c. Arabic text → 1-bit BITMAP (same strategy as SellX)
TSPL printers have **no Arabic font**, so SellX renders Arabic to a 1-bit bitmap
in a canvas and sends it via TSPL `BITMAP`. In Flutter, render with `dart:ui`:

```dart
import 'dart:ui' as ui;
import 'dart:typed_data';

/// Render text to a 1-bit (MSB-first) bitmap for TSPL `BITMAP`.
/// Returns (bytes, widthBytes, heightPx).
Future<(List<int>, int, int)> renderTextBitmap(
  String text, { int maxWidth = 260, int fontSize = 22 }) async {
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);

  final para = (ui.ParagraphBuilder(ui.ParagraphStyle(
        textDirection: ui.TextDirection.rtl, fontSize: fontSize.toDouble(),
        fontWeight: ui.FontWeight.bold))
      ..pushStyle(ui.TextStyle(color: const ui.Color(0xFF000000)))
      ..addText(text))
      .build()
    ..layout(ui.ParagraphConstraints(width: maxWidth.toDouble()));

  final wPx = maxWidth;
  final hPx = para.height.ceil();
  canvas.drawColor(const ui.Color(0xFFFFFFFF), ui.BlendMode.src);
  canvas.drawParagraph(para, ui.Offset.zero);

  final img = await recorder.endRecording().toImage(wPx, hPx);
  final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
  final rgba = data!.buffer.asUint8List();

  // RGBA → 1-bit MSB-first (1 = black), exactly like SellX's renderTextBitmap
  final widthBytes = (wPx + 7) >> 3;
  final out = Uint8List(widthBytes * hPx);
  for (var y = 0; y < hPx; y++) {
    for (var x = 0; x < wPx; x++) {
      final i = (y * wPx + x) * 4;
      final luma = (rgba[i] + rgba[i + 1] + rgba[i + 2]) ~/ 3;
      if (rgba[i + 3] > 128 && luma < 128) {
        out[y * widthBytes + (x >> 3)] |= 1 << (7 - (x & 7));
      }
    }
  }
  return (out, widthBytes, hPx);
}
```
Then emit `BITMAP x,y,widthBytes,heightPx,0,<raw bytes>` before the `PRINT`.

---

## 3. Layer 3 — TRANSPORTS (one per connection type)

> Implement the `PrinterTransport` interface from §0 for each. Your UI picks
> which one based on a saved "connection type" setting (like SellX's
> `printerConfigStore`).

### 3.1 — LAN / Wi-Fi (TCP :9100)  ★ EASIEST, pure Dart, no native code
Works identically on Windows + macOS. (Your printer lacks LAN, but include it —
many future printers have it.)

```dart
import 'dart:io';

class LanTransport implements PrinterTransport {
  final String ip; final int port;
  Socket? _s;
  LanTransport(this.ip, {this.port = 9100});
  @override Future<void> connect() async => _s = await Socket.connect(ip, port);
  @override Future<void> sendBytes(List<int> b) async { _s!.add(b); await _s!.flush(); }
  @override Future<void> close() async => await _s?.close();
}
```
**Dependencies:** none (`dart:io`).

---

### 3.2 — USB (raw)  ★ YOUR CASE
Dart can't do raw USB. Two options:

**Option A — plugin (try first):**
- `flutter_thermal_printer` (desktop USB support), or
- `usb_serial` if the printer exposes a USB-CDC serial interface.

```dart
// pubspec.yaml:  flutter_thermal_printer: ^x.y.z
final printers = await FlutterThermalPrinter.instance.getPrinters([ConnectionType.USB]);
await FlutterThermalPrinter.instance.connect(printers.first);
await FlutterThermalPrinter.instance.printData(tsplBytes); // raw bytes
```

**Option B — platform channel (full SellX parity, if no plugin reaches your printer):**

`MethodChannel` on the Dart side:
```dart
class UsbTransport implements PrinterTransport {
  static const _ch = MethodChannel('barcode_printer');
  final int vendorId, productId;       // mac/linux
  final String? windowsPrinterName;    // windows
  UsbTransport({required this.vendorId, required this.productId, this.windowsPrinterName});
  @override Future<void> connect() async {}
  @override Future<void> sendBytes(List<int> b) async {
    await _ch.invokeMethod('printRaw', {
      'bytes': b, 'vendorId': vendorId, 'productId': productId,
      'printerName': windowsPrinterName,
    });
  }
  @override Future<void> close() async {}
}
```

**Native side — Windows (raw spooler, same as SellX winspool):**
In `windows/runner` (C++) or a bundled C# helper, call:
`OpenPrinter` → `StartDocPrinter(level 1, datatype "RAW")` → `WritePrinter` →
`EndDocPrinter` → `ClosePrinter`. Wire it to the `printRaw` channel method.

**Native side — macOS (two choices):**
- **Simplest: CUPS raw** (no libusb) — shell out:
  `lp -d <PrinterName> -o raw <tempfile>` (write bytes to a temp file, send raw).
- **Or libusb** (matches SellX's `rusb`): bundle libusb, open device by
  VID/PID, `claim_interface`, `bulk_transfer` the bytes. More control, more setup.

**Dependencies:** plugin OR (platform channel + winspool on Win / CUPS|libusb on mac).

---

### 3.3 — Bluetooth (BLE / Classic SPP)
For mobile + some desktop printers.
- Package: `flutter_blue_plus` (BLE) or `flutter_bluetooth_serial` (Android classic).
- Connect → discover the write characteristic → write the same TSPL bytes.
- Desktop BT support is patchy; mainly an Android/iOS path.

```dart
class BleTransport implements PrinterTransport {
  final BluetoothCharacteristic ch;
  BleTransport(this.ch);
  @override Future<void> connect() async {}
  @override Future<void> sendBytes(List<int> b) async {
    const chunk = 180; // BLE MTU-safe chunks
    for (var i = 0; i < b.length; i += chunk) {
      await ch.write(b.sublist(i, (i + chunk).clamp(0, b.length)), withoutResponse: true);
    }
  }
  @override Future<void> close() async {}
}
```
**Dependencies:** `flutter_blue_plus`.

---

### 3.4 — Serial / COM (USB-to-serial printers)
Some label printers appear as a virtual COM port (Windows) or `/dev/tty.usb*` (mac).
- Package: `flutter_libserialport` (cross-platform, libserialport).

```dart
import 'package:flutter_libserialport/flutter_libserialport.dart';

class SerialTransport implements PrinterTransport {
  final String portName; final int baud;
  SerialPort? _p;
  SerialTransport(this.portName, {this.baud = 9600});
  @override Future<void> connect() async {
    _p = SerialPort(portName);
    _p!.openWrite();
    _p!.config = SerialPortConfig()..baudRate = baud;
  }
  @override Future<void> sendBytes(List<int> b) async => _p!.write(Uint8List.fromList(b));
  @override Future<void> close() async => _p?.close();
}
```
**Dependencies:** `flutter_libserialport`.

---

### 3.5 — System driver / OS print dialog (fallback)
Send to a normally-installed printer through the OS. Good as a fallback, but you
lose raw control (driver may reinterpret bytes).
- Package: `printing` / `pdf` (renders a PDF and prints via OS) — note this is
  the **document** path, NOT raw TSPL. Use only if the printer has a real driver
  and you're OK printing a rendered label image instead of raw commands.

---

## 4. Putting it together (transport-agnostic print function)

```dart
enum ConnType { lan, usb, bluetooth, serial }

PrinterTransport makeTransport(ConnType type, Map<String, dynamic> cfg) {
  switch (type) {
    case ConnType.lan:  return LanTransport(cfg['ip'], port: cfg['port'] ?? 9100);
    case ConnType.usb:  return UsbTransport(
        vendorId: cfg['vid'], productId: cfg['pid'], windowsPrinterName: cfg['name']);
    case ConnType.serial: return SerialTransport(cfg['port'], baud: cfg['baud'] ?? 9600);
    case ConnType.bluetooth: return BleTransport(cfg['char']);
  }
}

Future<void> printBarcodeLabel({
  required ConnType type,
  required Map<String, dynamic> cfg,
  required String barcode,
  String? productName,
  String? companyName,
  int quantity = 1,
}) async {
  final bytes = buildBarcodeTspl(
    barcode: barcode, productName: productName, companyName: companyName,
    lineEnding: type == ConnType.usb && Platform.isWindows ? '\r\n' : '\n',
  );
  final t = makeTransport(type, cfg);
  await t.connect();
  try {
    for (var i = 0; i < quantity; i++) await t.sendBytes(bytes);
  } finally {
    await t.close();
  }
}
```

This mirrors SellX's `smartPrintService.printBarcode()` — guard, build, loop ×qty,
send — but the transport is swappable.

---

## 5. Recommended package set (pubspec.yaml)

```yaml
dependencies:
  barcode: ^2.2.9                 # generate barcode images if needed
  flutter_libserialport: ^0.4.0   # serial / COM
  flutter_blue_plus: ^1.32.0      # bluetooth (mobile mainly)
  flutter_thermal_printer: ^x.y.z # try first for USB desktop
  printing: ^5.12.0               # OS-driver fallback (renders PDF)
```
For raw USB without a working plugin: add a **platform channel** + native code
(winspool on Windows, CUPS-raw or libusb on macOS).

---

## 6. Decision guide — which transport for your situation

| Your printer has… | Use | Effort |
|---|---|---|
| Ethernet/Wi-Fi | **3.1 LAN (:9100)** | ⭐ trivial |
| USB + a working Flutter plugin | **3.2 Option A** | ⭐⭐ easy |
| **USB only, no plugin works** ← your case | **3.2 Option B** platform channel (winspool / CUPS-raw) | ⭐⭐⭐ moderate |
| USB-serial / COM port | **3.4 Serial** | ⭐⭐ easy |
| Bluetooth | **3.3 BLE** | ⭐⭐ (mobile) |
| Has a real OS driver, raw not needed | **3.5 OS print** | ⭐ easy but less control |

**For your USB-only printer:** start with **3.2 Option A** (`flutter_thermal_printer`).
If it can't reach your model, drop to **3.2 Option B** — and on macOS prefer
**CUPS-raw (`lp -o raw`)** over libusb (far less setup, no driver hassles).

---

## 7. Gotchas (learned from the SellX implementation)

1. **Firmware mode matters** — emit TSPL only if the printer is in TSPL mode
   (not ESC/POS). Wrong language = blank or garbage labels.
2. **Line endings** — Windows thermal printers often need `\r\n`; mac/linux USB
   tolerates `\n`. SellX switches per platform.
3. **Arabic/RTL** — no printer font; render to BITMAP (see §2c). Latin can use
   TSPL `TEXT` directly (faster).
4. **Label size is hardcoded** in the commands (`SIZE 35 mm,25 mm`). Different
   roll = change the SIZE/GAP and all X/Y coordinates.
5. **USB permissions** — macOS may need the device claimed (libusb) or a CUPS
   queue; Windows needs the printer installed so winspool sees it by name.
6. **Quantity** — loop the send (SellX sends the label N times), or use a TSPL
   `PRINT N` count.
```

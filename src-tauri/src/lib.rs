
mod config;
mod network;

use std::io::Write;
use std::process::Command;
use std::time::Duration;
use tauri::Manager;

#[cfg(target_os = "macos")]
fn render_html_to_escpos_with_size(html_path: &str, escpos_path: &str, viewport_width: &str, printer_dots: &str) -> bool {
    let swift_src = include_str!("../resources/html2escpos.swift");

    // Hash the Swift source so the binary auto-recompiles when the source changes
    let hash: u64 = swift_src.bytes().fold(0u64, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u64));
    let binary_name = format!("html2escpos_{:016x}", hash);

    let cache_dir = dirs::cache_dir()
        .map(|d| d.join("com.sellx.pos"))  // Changed from sultana to sellx
        .unwrap_or_else(|| std::env::temp_dir().join("sellx_tools"));
    let binary = cache_dir.join(&binary_name);

    // Compile Swift helper once and cache (keyed by source hash)
    if !binary.exists() {
        if std::fs::create_dir_all(&cache_dir).is_err() {
            return false;
        }

        if let Ok(entries) = std::fs::read_dir(&cache_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("html2escpos_") && !name.ends_with(".swift") && name != binary_name {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }

        let src = cache_dir.join("html2escpos.swift");
        if std::fs::write(&src, swift_src).is_err() {
            return false;
        }
        match Command::new("swiftc")
            .args([
                "-O",
                "-o",
                binary.to_str().unwrap_or_default(),
                src.to_str().unwrap_or_default(),
            ])
            .output()
        {
            Ok(out) if out.status.success() => {}
            _ => return false,
        }
    }

    // html2escpos <input.html> <output.bin> <viewport_width> <printer_dots>
    match Command::new(&binary)
        .args([html_path, escpos_path, viewport_width, printer_dots])
        .output()
    {
        Ok(out) => out.status.success() && std::path::Path::new(escpos_path).exists(),
        _ => false,
    }
}

/// Windows: hide the console window for spawned processes
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn run_powershell_hidden(script: &str) -> std::io::Result<std::process::Output> {
    use std::os::windows::process::CommandExt;
    Command::new("powershell")
        .args(["-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
}

/// List all available system printers
#[tauri::command]
fn list_printers() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let output = run_powershell_hidden(
            "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"
        );
        match output {
            Ok(out) => {
                String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect()
            }
            Err(_) => Vec::new(),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        match Command::new("lpstat").arg("-p").output() {
            Ok(out) => {
                String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .filter_map(|line| {
                        let trimmed = line.trim();
                        if trimmed.starts_with("printer ") {
                            let rest = &trimmed[8..];
                            rest.split_whitespace().next().map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
                    .collect()
            }
            Err(_) => Vec::new(),
        }
    }
}

///
/// TODO: Future Feature - Direct IP Printing
/// Currently uses system printer names (including network printers installed in OS).
/// Future enhancement: Direct TCP/IP printing to send ESC/POS commands to IP:Port
/// without requiring system printer installation. Would require:
/// - TCP socket connection to printer (e.g., 192.168.1.50:9100)
/// - Direct ESC/POS raster transmission
/// - See ConnectionTab settings (ipAddress, port, connectionType) reserved for this
#[tauri::command]
fn print_receipt(printer_name: String, html: String) -> Result<String, String> {
    // DEBUG: Write to file to confirm function is called
    let debug_path = std::env::temp_dir().join("SELLX_PRINT_DEBUG.txt");
    let debug_msg = format!("PRINT CALLED: printer={}, html_len={}\n", printer_name, html.len());
    let _ = std::fs::write(&debug_path, debug_msg);

    let mut path = std::env::temp_dir();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    path.push(format!("sellx_receipt_{}.html", ts));  // Changed from sultana to sellx

    // Write HTML to temp file
    let mut file =
        std::fs::File::create(&path).map_err(|e| format!("Failed to create temp file: {}", e))?;
    file.write_all(html.as_bytes())
        .map_err(|e| format!("Failed to write HTML: {}", e))?;
    drop(file);

    let path_str = path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    let result = {
        // Render at PRINTER DPI, not screen DPI. The WebBrowser used to render at
        // 96dpi screen resolution (272px for 80mm) and then BitmapToEscPos bicubic-
        // upscaled to 576 printer dots — that upscale blurred Arabic text. Rendering
        // at the final 576 dots means the bitmap maps 1:1 to the printer and text
        // keeps the sharpness of the browser's own font rasterizer.
        //
        // The CSS in the HTML is written for 80mm viewport (272px at 96dpi). We
        // counter-scale by setting $viewportWidth = printer_dots and injecting a
        // zoom factor so the layout still fits the label width.
        let (logical_width, printer_dots) = if html.contains("barcode-label") {
            // Barcode label: 38mm logical = 144px, printer = 304 dots (≈2x)
            (144, 304)
        } else {
            // Receipt: 80mm logical = 272px, printer = 576 dots (≈2.1x)
            (272, 576)
        };

        // Render the WebBrowser at printer width — layout is scaled via body zoom.
        let viewport_width = printer_dots;
        let zoom_percent = (printer_dots * 100) / logical_width;

        // C# helpers: bitmap → ESC/POS raster + raw winspool printing
        let cs_helpers = include_str!("../resources/escpos_helpers.cs");

        // PowerShell script: render HTML → bitmap → ESC/POS raster → raw print
        let script = format!(
            r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$htmlPath = '{html_path}'
$printerName = '{printer}'
$viewportWidth = {viewport_width}
$printerDots = {printer_dots}
$zoomPercent = {zoom_percent}

# Force IE11 rendering mode for WebBrowser control (supports flexbox)
$regPath = 'HKCU:\Software\Microsoft\Internet Explorer\Main\FeatureControl\FEATURE_BROWSER_EMULATION'
$hadKey = $false
if (-not (Test-Path $regPath)) {{
    New-Item -Path $regPath -Force | Out-Null
}} else {{
    $hadKey = (Get-ItemProperty -Path $regPath -Name 'powershell.exe' -ErrorAction SilentlyContinue) -ne $null
}}
Set-ItemProperty -Path $regPath -Name 'powershell.exe' -Value 11001 -Type DWord

try {{
    # Compile C# helpers for ESC/POS conversion and raw winspool printing
    $drawingAsm = [System.Drawing.Image].Assembly.Location
    $csCode = @'
{cs_helpers}
'@
    Add-Type -TypeDefinition $csCode -ReferencedAssemblies $drawingAsm

    # Render HTML in WebBrowser hosted on an offscreen form. Using a Form keeps the
    # native HWND alive so DrawToBitmap can rasterize ALL of the embedded content,
    # including regions below the visible client area.
    $form = New-Object System.Windows.Forms.Form
    $form.ShowInTaskbar = $false
    $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $form.Location = New-Object System.Drawing.Point(-32000, -32000)
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    # Oversize the host so the WebBrowser can fit even a very long receipt.
    $form.Size = New-Object System.Drawing.Size($viewportWidth, 32000)

    $wb = New-Object System.Windows.Forms.WebBrowser
    $wb.ScrollBarsEnabled = $false
    $wb.ScriptErrorsSuppressed = $true
    $wb.Dock = [System.Windows.Forms.DockStyle]::None
    $wb.Width = $viewportWidth
    $wb.Height = 32000
    $form.Controls.Add($wb)
    $form.Show()

    $wb.Navigate("file:///$($htmlPath -replace '\\','/')")

    $timeout = 0
    while ($wb.ReadyState -ne 'Complete' -and $timeout -lt 600) {{
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 50
        $timeout++
    }}
    Start-Sleep -Milliseconds 400

    function Measure-BodyHeight($web) {{
        try {{
            $doc = $web.Document
            $body = $doc.Body
            $html = $doc.DocumentElement
            $heights = @()
            try {{ $heights += [int]$body.ScrollRectangle.Height }} catch {{}}
            try {{ $heights += [int]$html.ScrollRectangle.Height }} catch {{}}
            try {{ $heights += [int]$body.OffsetRectangle.Height }} catch {{}}
            try {{ $heights += [int]$html.OffsetRectangle.Height }} catch {{}}
            if ($heights.Count -eq 0) {{ return 0 }}
            return ($heights | Measure-Object -Maximum).Maximum
        }} catch {{ return 0 }}
    }}

    # CRITICAL ORDER: measure the natural (pre-zoom) layout height first. IE11's
    # ScrollRectangle does NOT reliably report zoomed metrics, so we measure in the
    # CSS-authored coordinate system, then compute the final physical height as
    # naturalH * zoom. This is what was causing long receipts to clip.

    # Stabilize natural (pre-zoom) height.
    $lastH = 0
    $stable = 0
    for ($i = 0; $i -lt 30; $i++) {{
        [System.Windows.Forms.Application]::DoEvents()
        $h = Measure-BodyHeight $wb
        if ($h -gt 0 -and [Math]::Abs($h - $lastH) -le 2) {{
            $stable++
            if ($stable -ge 3) {{ break }}
        }} else {{ $stable = 0 }}
        $lastH = $h
        Start-Sleep -Milliseconds 200
    }}
    $naturalH = Measure-BodyHeight $wb
    if ($naturalH -lt 100) {{ $naturalH = 100 }}

    # Apply zoom now — this scales the rendered content to printer DPI.
    try {{
        $wb.Document.Body.Style = "zoom: $zoomPercent%"
    }} catch {{}}
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 500

    # Physical height after zoom (ceil — never undersize).
    $zoomedH = [int][Math]::Ceiling($naturalH * $zoomPercent / 100.0)
    # Add bottom padding so the footer/total and paper-cut command are never clipped.
    $bodyH = $zoomedH + 80

    # Make the WebBrowser physically as tall as the zoomed content — DrawToBitmap
    # only rasterizes the control's current client area. Anything below gets lost.
    $wb.Size = New-Object System.Drawing.Size($viewportWidth, $bodyH)

    # Final settle — longer for tall receipts (images/fonts still decoding).
    $settle = if ($bodyH -gt 3000) {{ 1800 }}
             elseif ($bodyH -gt 1500) {{ 1100 }}
             else {{ 600 }}
    Start-Sleep -Milliseconds $settle
    [System.Windows.Forms.Application]::DoEvents()

    $bmp = New-Object System.Drawing.Bitmap($viewportWidth, $bodyH)
    $wb.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $viewportWidth, $bodyH)))
    $wb.Dispose()
    $form.Close()
    $form.Dispose()

    # Convert bitmap → ESC/POS raster (dynamic dots based on label type)
    $escposData = [EscPosConverter]::BitmapToEscPos($bmp, $printerDots)
    $bmp.Dispose()

    if (-not [RawPrint]::SendRaw($printerName, $escposData)) {{
        throw "Failed to send raw data to printer"
    }}
}} finally {{
    # Clean up registry key
    if (-not $hadKey) {{
        Remove-ItemProperty -Path $regPath -Name 'powershell.exe' -ErrorAction SilentlyContinue
    }}
}}
"#,
            html_path = path_str.replace('\'', "''"),
            printer = printer_name.replace('\'', "''"),
            viewport_width = viewport_width,
            printer_dots = printer_dots,
            cs_helpers = cs_helpers
        );
        run_powershell_hidden(&script)
    };

    #[cfg(target_os = "macos")]
    let result = {
        // Fix printer name: Replace spaces/hyphens with underscores (CUPS naming)
        let printer_name = printer_name.replace(' ', "_").replace('-', "_");

        let mut escpos_path = path.clone();
        escpos_path.set_extension("bin");
        let escpos_str = escpos_path.to_string_lossy().to_string();

        // Detect barcode labels vs receipts by checking for label size in HTML
        // Barcode labels have fixed mm sizes like "38mm 30mm"
        // Receipts have "80mm auto" or "58mm auto"
        let (viewport_width, printer_dots) = if html.contains("barcode-label") {
            // Barcode label: Use smaller viewport matching label width
            // 38mm ≈ 143px at 96 DPI, but we use 38mm * 3.78 = ~144px
            // Printer dots for 38mm at 203 DPI = 38 * 8 ≈ 304 dots
            ("144", "304")
        } else {
            // Receipt: Standard 80mm = 272px viewport, 576 dots (72mm printable)
            ("272", "576")
        };

        let print_result = if render_html_to_escpos_with_size(&path_str, &escpos_str, viewport_width, printer_dots) {
            // Validate ESC/POS output before sending
            match std::fs::read(&escpos_path) {
                Ok(data) if data.len() >= 10 && data[0] == 0x1B && data[1] == 0x40 => {
                    // Valid ESC/POS: starts with ESC @ (initialize)
                }
                Ok(data) => {
                    let _ = std::fs::remove_file(&escpos_path);
                    let _ = std::fs::remove_file(&path);
                    return Err(format!(
                        "بيانات الطباعة تالفة (الحجم: {} بايت) — أعد المحاولة",
                        data.len()
                    ));
                }
                Err(e) => {
                    let _ = std::fs::remove_file(&escpos_path);
                    let _ = std::fs::remove_file(&path);
                    return Err(format!("فشل قراءة ملف الطباعة: {}", e));
                }
            }
            // Send raw ESC/POS data directly to USB device (bypasses CUPS)
            // Find the USB device path from CUPS
            let device_uri = Command::new("lpstat")
                .args(["-v"])
                .output()
                .ok()
                .and_then(|out| {
                    let output = String::from_utf8_lossy(&out.stdout);
                    output.lines()
                        .find(|line| line.contains(&printer_name))
                        .and_then(|line| line.split_whitespace().last())
                        .map(String::from)
                });

            if let Some(uri) = device_uri {
                if uri.starts_with("usb://") {
                    // Direct USB write for thermal printers
                    // Use cat to send raw data to the USB device
                    Command::new("sh")
                        .arg("-c")
                        .arg(format!("cat '{}' > /dev/usb/lp* 2>/dev/null || lp -d '{}' -o raw '{}'",
                            escpos_str, printer_name, escpos_str))
                        .output()
                } else {
                    // Network or other printer - use lp
                    Command::new("lp")
                        .args(["-d", &printer_name, "-o", "raw", &escpos_str])
                        .output()
                }
            } else {
                // Fallback to lp if device URI not found
                Command::new("lp")
                    .args(["-d", &printer_name, "-o", "raw", &escpos_str])
                    .output()
            }
        } else {
            let _ = std::fs::remove_file(&escpos_path);
            let _ = std::fs::remove_file(&path);
            return Err("فشل تحويل الإيصال إلى صورة — تأكد من تثبيت أدوات Xcode".to_string());
        };

        let _ = std::fs::remove_file(&escpos_path);
        print_result
    };

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let result = Command::new("lp")
        .args([
            "-d", &printer_name,
            "-o", "media=Custom.80x500mm",
            "-o", "page-left=0",
            "-o", "page-right=0",
            "-o", "page-top=0",
            "-o", "page-bottom=0",
            &path_str,
        ])
        .output();

    // Clean up temp file
    let _ = std::fs::remove_file(&path);

    match result {
        Ok(output) => {
            if output.status.success() {
                Ok("OK".to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                Err(format!("Print command failed: {}", stderr))
            }
        }
        Err(e) => Err(format!("Failed to execute print command: {}", e)),
    }
}

/// Windows-specific: Print barcode by submitting raw TSPL bytes to the Windows
/// print spooler (winspool.drv WritePrinter, RAW datatype). Uses the same
/// RawPrint.SendRaw C# helper as the receipt path — no printer sharing and no
/// SMB required; the printer just needs to be installed in Devices & Printers.
#[cfg(target_os = "windows")]
fn print_barcode_windows_raw(
    barcode_value: String,
    product_name: Option<String>,
    printer_name: Option<String>,
) -> Result<String, String> {
    log::info!("========== WINDOWS BARCODE PRINT START ==========");
    log::info!("[Barcode Windows] Using winspool RAW (RawPrint.SendRaw)");
    log::info!("[Barcode Windows] Barcode value: {}", barcode_value);
    log::info!("[Barcode Windows] Product name: {:?}", product_name);
    log::info!("[Barcode Windows] Printer name parameter: {:?}", printer_name);

    let target_printer = printer_name.ok_or_else(|| {
        log::error!("[Barcode Windows] No printer assigned for barcode printing");
        "لم يتم تعيين طابعة الباركود. افتح الإعدادات → الطابعات وعيّن طابعة باركود مثبّتة في Windows.".to_string()
    })?;

    if target_printer.trim().is_empty() {
        log::error!("[Barcode Windows] Empty printer name");
        return Err("اسم طابعة الباركود فارغ. أعد تعيينها من الإعدادات.".to_string());
    }

    log::info!("[Barcode Windows] Target printer: '{}'", target_printer);

    // Generate TSPL commands with \r\n (CRLF) line endings — required by thermal printers.
    let product_text = product_name.unwrap_or_default();
    let tspl_command = if product_text.is_empty() {
        format!(
            "SIZE 35 mm,25 mm\r\n\
             GAP 3 mm,0\r\n\
             OFFSET 0\r\n\
             DIRECTION 1\r\n\
             SET TEAR ON\r\n\
             CLS\r\n\
             BARCODE 60,60,\"128\",80,1,0,3,3,\"{}\"\r\n\
             PRINT 1,1\r\n",
            barcode_value
        )
    } else {
        format!(
            "SIZE 35 mm,25 mm\r\n\
             GAP 3 mm,0\r\n\
             OFFSET 0\r\n\
             DIRECTION 1\r\n\
             SET TEAR ON\r\n\
             CLS\r\n\
             TEXT 60,20,\"3\",0,1,1,\"{}\"\r\n\
             BARCODE 60,80,\"128\",80,1,0,3,3,\"{}\"\r\n\
             PRINT 1,1\r\n",
            product_text, barcode_value
        )
    };

    log::info!("[Barcode Windows] TSPL commands ({} bytes):\n{}", tspl_command.len(), tspl_command);

    // Stage TSPL bytes in a temp file so PowerShell can load them as a byte[] and
    // hand them to RawPrint.SendRaw unchanged (no encoding, no line-ending rewrites).
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let temp_path = std::env::temp_dir().join(format!("sellx_barcode_{}.tspl", ts));
    std::fs::write(&temp_path, tspl_command.as_bytes())
        .map_err(|e| {
            log::error!("[Barcode Windows] Failed to write temp file: {}", e);
            format!("Failed to create temp file: {}", e)
        })?;
    log::info!("[Barcode Windows] Temp file: {:?}", temp_path);

    let temp_path_str = temp_path.to_string_lossy().to_string();

    // Minimal inline helper: only uses winspool.drv — no System.Drawing dependency,
    // so it works on both Windows PowerShell 5.1 and PowerShell 7 (pwsh).
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$tsplPath    = '{tspl_path}'
$printerName = '{printer}'

$csCode = @'
using System;
using System.Runtime.InteropServices;

public class SellxRawPrint {{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DOCINFOA {{
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }}

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA di);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    public static int SendRaw(string printer, byte[] data) {{
        IntPtr hPrinter;
        if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero))
            return -1;
        try {{
            var di = new DOCINFOA {{ pDocName = "SellX Barcode", pDataType = "RAW" }};
            if (!StartDocPrinter(hPrinter, 1, ref di))
                return -2;
            try {{
                if (!StartPagePrinter(hPrinter))
                    return -3;
                IntPtr ptr = Marshal.AllocCoTaskMem(data.Length);
                int written = 0;
                try {{
                    Marshal.Copy(data, 0, ptr, data.Length);
                    if (!WritePrinter(hPrinter, ptr, data.Length, out written))
                        return -4;
                }} finally {{
                    Marshal.FreeCoTaskMem(ptr);
                }}
                EndPagePrinter(hPrinter);
                return written;
            }} finally {{
                EndDocPrinter(hPrinter);
            }}
        }} finally {{
            ClosePrinter(hPrinter);
        }}
    }}
}}
'@

Add-Type -TypeDefinition $csCode

$bytes = [System.IO.File]::ReadAllBytes($tsplPath)
$written = [SellxRawPrint]::SendRaw($printerName, $bytes)

switch ($written) {{
    -1 {{ throw "OpenPrinter failed for '$printerName'. Printer not installed or name mismatch." }}
    -2 {{ throw "StartDocPrinter failed for '$printerName'." }}
    -3 {{ throw "StartPagePrinter failed for '$printerName'." }}
    -4 {{ throw "WritePrinter failed for '$printerName'." }}
    default {{
        if ($written -lt $bytes.Length) {{
            throw "WritePrinter wrote $written of $($bytes.Length) bytes to '$printerName'."
        }}
        Write-Output ("SENT " + $written)
    }}
}}
"#,
        tspl_path = temp_path_str.replace('\'', "''"),
        printer = target_printer.replace('\'', "''")
    );

    let output = run_powershell_hidden(&script).map_err(|e| {
        log::error!("[Barcode Windows] Failed to spawn PowerShell: {}", e);
        let _ = std::fs::remove_file(&temp_path);
        format!("Failed to execute PowerShell: {}", e)
    })?;

    let _ = std::fs::remove_file(&temp_path);

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    log::info!("[Barcode Windows] PS exit code: {:?}", output.status.code());
    if !stdout.trim().is_empty() {
        log::info!("[Barcode Windows] PS stdout: {}", stdout.trim());
    }
    if !stderr.trim().is_empty() {
        log::warn!("[Barcode Windows] PS stderr: {}", stderr.trim());
    }

    if output.status.success() {
        log::info!("========== WINDOWS BARCODE PRINT SUCCESS ==========");
        Ok(format!("Barcode printed successfully to '{}'", target_printer))
    } else {
        log::error!("========== WINDOWS BARCODE PRINT FAILED ==========");
        Err(format!(
            "فشلت طباعة الباركود على الطابعة '{}'.\n\
            {}\n\n\
            الرجاء التحقق من:\n\
            1. الطابعة مثبّتة وظاهرة في Devices and Printers\n\
            2. الاسم في الإعدادات يطابق اسمها في Windows بالضبط\n\
            3. حالة الطابعة Ready (وليست Offline أو متوقفة)\n\
            4. الطابعة في وضع TSPL (ليست ESC/POS)",
            target_printer,
            stderr.trim()
        ))
    }
}

/// Print barcode directly via USB using TSPL commands (for Xprinter XP-Q361U)
/// This bypasses the OS print dialog and sends raw commands to the barcode printer
/// NOW SUPPORTS: macOS (via USB), Windows (via Raw Printing), Linux (via USB)
#[tauri::command]
fn print_barcode_native(
    barcode_value: String,
    product_name: Option<String>,
    printer_name: Option<String>,  // Windows: printer name; macOS/Linux: ignored
    vendor_id: Option<u16>,
    product_id: Option<u16>,
) -> Result<String, String> {
    log::info!("====================================================");
    log::info!("print_barcode_native called");
    log::info!("Platform: {}", std::env::consts::OS);
    log::info!("Parameters: barcode={}, product={:?}, printer={:?}, vid={:?}, pid={:?}",
        barcode_value, product_name, printer_name, vendor_id, product_id);

    // Windows uses Raw Printing API with manufacturer driver
    #[cfg(target_os = "windows")]
    {
        log::info!("Routing to Windows Raw Printing API");
        return print_barcode_windows_raw(barcode_value, product_name, printer_name);
    }

    // macOS and Linux use rusb (direct USB)
    #[cfg(not(target_os = "windows"))]
    {
        use rusb::{Context, UsbContext};
        use std::time::Duration;

        // Default Xprinter VID/PID (user can override via settings)
        let vid = vendor_id.unwrap_or(0x1EEA);
        let pid = product_id.unwrap_or(0x002C);

        log::info!("[Barcode] Attempting USB print - VID: 0x{:04X}, PID: 0x{:04X}", vid, pid);

        let context = Context::new().map_err(|e| format!("USB context error: {}", e))?;

        let handle = context
            .open_device_with_vid_pid(vid, pid)
            .ok_or_else(|| {
                format!(
                    "Barcode printer not found (VID: 0x{:04X}, PID: 0x{:04X}). Check USB connection and ensure printer is powered on.",
                    vid, pid
                )
            })?;

        // Claim interface 0 (standard for USB printers)
        handle.claim_interface(0).map_err(|e| {
            format!("Failed to claim USB interface: {}. Is another app using the printer?", e)
        })?;

        // Construct TSPL commands for barcode label
        // SIZE: 35mm x 25mm (1.36" x 0.98") - actual label size
        // GAP: 3mm gap between labels (standard for small labels)
        // OFFSET: 0 - precise stopping position
        // DIRECTION: 1 - print from top
        // TEXT: X, Y, Font, Rotation, X-multiplication, Y-multiplication, Content
        // BARCODE: X, Y, Type, Height, Human-Readable, Rotation, Narrow, Wide, Content
        //   At 203 DPI: 35mm ≈ 276 dots, 25mm ≈ 200 dots
        //   Centered X position: 60 dots (slightly left of center)
        //
        // Layout optimized for Xprinter XP-Q361U:
        // - X=60 positions content centered
        // - Product name at Y=20 (top)
        // - Barcode at Y=80 (centered vertically)
        let product_text = product_name.unwrap_or_default();

        let tspl_command = if product_text.is_empty() {
            // Barcode only - centered on label with wider bars
            format!(
                "SIZE 35 mm,25 mm\n\
                 GAP 3 mm,0\n\
                 OFFSET 0\n\
                 DIRECTION 1\n\
                 SET TEAR ON\n\
                 CLS\n\
                 BARCODE 60,60,\"128\",80,1,0,3,3,\"{}\"\n\
                 PRINT 1,1\n",
                barcode_value
            )
        } else {
            // Product name at top + barcode centered with wider bars
            format!(
                "SIZE 35 mm,25 mm\n\
                 GAP 3 mm,0\n\
                 OFFSET 0\n\
                 DIRECTION 1\n\
                 SET TEAR ON\n\
                 CLS\n\
                 TEXT 60,20,\"3\",0,1,1,\"{}\"\n\
                 BARCODE 60,80,\"128\",80,1,0,3,3,\"{}\"\n\
                 PRINT 1,1\n",
                product_text, barcode_value
            )
        };

        log::info!("[Barcode] Sending TSPL commands:\n{}", tspl_command);

        // Try different bulk endpoints (0x01, 0x02, 0x03)
        // Xprinters typically use 0x01 or 0x02
        let endpoints = [0x01, 0x02, 0x03];
        let mut last_error = String::new();

        for endpoint in endpoints.iter() {
            match handle.write_bulk(*endpoint, tspl_command.as_bytes(), Duration::from_secs(5)) {
                Ok(bytes_written) => {
                    log::info!("[Barcode] ✅ Successfully sent {} bytes to endpoint 0x{:02X}", bytes_written, endpoint);
                    return Ok(format!("Barcode printed successfully! ({} bytes sent)", bytes_written));
                }
                Err(e) => {
                    last_error = format!("Endpoint 0x{:02X}: {}", endpoint, e);
                    log::warn!("[Barcode] Failed on endpoint 0x{:02X}: {}", endpoint, e);
                }
            }
        }

        Err(format!("Failed to send to any USB endpoint. Last error: {}", last_error))
    }
}

/// List all USB devices to help find the barcode printer's VID/PID
/// NOW SUPPORTS: macOS/Linux (USB devices), Windows (installed printers)
#[tauri::command]
fn list_usb_devices() -> Result<Vec<String>, String> {
    // Windows: List installed printers (not USB devices)
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        log::info!("[USB] Listing Windows printers");

        let output = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg("Get-Printer | Where-Object {$_.Type -eq 'Local'} | Select-Object -ExpandProperty Name")
            .output()
            .map_err(|e| format!("Failed to list printers: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let printers: Vec<String> = stdout
                .lines()
                .filter(|line| !line.trim().is_empty())
                .map(|line| format!("Printer: {}", line.trim()))
                .collect();

            if printers.is_empty() {
                return Err(
                    "No printers found in Windows.\n\n\
                    Please install your barcode printer driver first:\n\
                    1. Connect the printer via USB\n\
                    2. Windows should automatically install the driver\n\
                    3. Or install from the manufacturer's CD/website\n\
                    4. Verify in Control Panel → Devices and Printers".to_string()
                );
            }

            log::info!("[USB] Found {} Windows printers", printers.len());
            return Ok(printers);
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to list printers: {}", stderr));
        }
    }

    // macOS/Linux: List USB devices
    #[cfg(not(target_os = "windows"))]
    {
        use rusb::{Context, UsbContext};
        use std::time::Duration;

        let context = Context::new().map_err(|e| format!("USB context error: {}", e))?;

        let devices = context.devices().map_err(|e| format!("Failed to list devices: {}", e))?;

        let mut device_list = Vec::new();

        for device in devices.iter() {
            let desc = match device.device_descriptor() {
                Ok(d) => d,
                Err(_) => continue,
            };

            let vid = desc.vendor_id();
            let pid = desc.product_id();

            // Try to get device name if available
            let name = match device.open() {
                Ok(h) => {
                    // Try to read product string
                    match h.read_languages(Duration::from_secs(1)) {
                        Ok(langs) => {
                            if let Some(lang) = langs.first() {
                                h.read_product_string(*lang, &desc, Duration::from_secs(1))
                                    .unwrap_or_else(|_| "Unknown Device".to_string())
                            } else {
                                "Unknown Device".to_string()
                            }
                        }
                        Err(_) => "Unknown Device".to_string(),
                    }
                }
                Err(_) => "Unknown Device".to_string(),
            };

            device_list.push(format!("VID: 0x{:04X}, PID: 0x{:04X} - {}", vid, pid, name));
        }

        if device_list.is_empty() {
            return Err("No USB devices found. Check USB connections.".to_string());
        }

        Ok(device_list)
    }
}

// ═══════════════════════════════════════════════════════════════════════
// TAURI APP SETUP
// ═══════════════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ── Plugins ────────────────────────────────────────
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        // ── Commands ───────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            // Config
            config::get_config,
            config::set_config,
            config::get_backend_url,
            config::set_backend_url,
            config::test_backend,
            config::reset_config,
            config::export_config,
            config::import_config,
            // Network
            network::get_network_status,
            network::check_network_now,
            // Printer (Sultana's simplified commands)
            list_printers,
            print_receipt,
            // Native USB barcode printing
            print_barcode_native,
            list_usb_devices,
        ])
        // ── Setup ──────────────────────────────────────────
        .setup(|app| {
            // Debug builds: auto-open DevTools. Release builds ship without DevTools.
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            // Start background network monitoring
            network::start_network_monitor(app.handle().clone());
            log::info!("SellX POS started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SellX POS");
}

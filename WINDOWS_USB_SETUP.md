# Windows Barcode Printer Setup Guide

## Overview

SellX POS supports **native barcode printing on Windows** using TSPL commands via raw binary transfer (`copy /b`). This bypasses the Windows Print Spooler and sends commands directly to the printer hardware.

## Prerequisites

- Windows 10/11
- USB barcode printer (Xprinter, TSC, Zebra, etc.)
- Manufacturer's printer driver installed
- **Printer must be shared** (one-time setup)

## Why This Works Better

SellX uses the **`copy /b` (Raw Binary Transfer)** method which:
- ✅ Bypasses Windows Print Spooler filtering
- ✅ Sends raw TSPL commands directly to hardware
- ✅ Works with all TSPL-compatible printers
- ✅ Uses CRLF (`\r\n`) line endings for thermal printers
- ✅ **No special USB drivers or PowerShell modules needed!**

## Installation Steps

### 1. Connect Your Barcode Printer

- Connect your barcode printer via USB
- Turn on the printer
- Windows will automatically detect and install the driver

### 2. Install Manufacturer Driver (if needed)

If Windows doesn't auto-install:

- Visit manufacturer's website:
  - **Xprinter:** http://www.xprintertech.com/download
  - **TSC:** https://www.tscprinters.com/EN/service/download.aspx
  - **Zebra:** https://www.zebra.com/support
- Download the driver for your printer model
- Run the installer
- Follow the on-screen instructions

### 3. Verify Printer Installation

- Open **Control Panel → Devices and Printers**
- You should see your printer listed (e.g., "Xprinter XP-360B")
- Right-click on the printer → **Printer properties**
- Click **"Print Test Page"** to verify it works

### 4. **CRITICAL: Share the Printer**

This is **required** for the `copy /b` method to work:

1. Right-click your printer → **Printer properties**
2. Go to the **"Sharing"** tab
3. Check **"Share this printer"**
4. **Share name:** Use a simple name like `Xprinter` (no spaces recommended)
5. Click **"OK"**

**Why?** The `copy /b` command sends data to `\\COMPUTERNAME\PrinterName`. Sharing creates this network path.

### 5. Configure in SellX App

- Open SellX application
- Go to **Settings → Printer Settings → USB Tab**
- Click **"Detect USB Devices"**
- Select your printer from the list
- **The printer will be automatically assigned to barcode printing**
- Native USB printing is auto-enabled

## Using Barcode Printing in SellX

### Print Test Barcode

1. Go to **Printer Settings → Test Tab**
2. Enter a test barcode value
3. Click **"Print Test Barcode"**
4. The barcode should print directly!

## Troubleshooting

### "Printer not found" Error

**Cause:** Printer driver not installed or printer offline

**Solution:**
- Verify printer appears in Control Panel → Devices and Printers
- Check printer is powered on
- Print a Windows test page to confirm driver works
- Restart SellX app

### "Failed to print" Error

**Cause:** Printer offline, out of labels, or driver issue

**Solution:**
- Check printer status in Windows (should show "Ready")
- Ensure labels are loaded
- Check USB cable connection
- Restart the printer
- Try printing from Windows Notepad first

### Printer prints blank labels

**Cause:** Wrong printer mode or TSPL not supported

**Solution:**
- Check printer is in TSPL mode (not ESC/POS mode)
- Verify printer supports TSPL commands (check manual)
- Update printer firmware if available
- Contact manufacturer support

### Wrong label size

**Cause:** Label size mismatch

**Solution:**
- Current setting: 35mm × 25mm labels
- Configure printer for this size in Windows printer preferences
- Or contact support to adjust TSPL commands for your label size

## Technical Details

### How It Works

1. **Raw Binary Transfer:** SellX uses `copy /b` command (CMD binary copy)
2. **Bypass Spooler:** Sends TSPL commands directly to printer hardware
3. **CRLF Line Endings:** Uses `\r\n` (Carriage Return + Line Feed) for thermal printers
4. **Network Path:** Printer sharing creates `\\COMPUTERNAME\PrinterName` path
5. **Printer:** Receives raw TSPL and prints the barcode label immediately

**Command Example:**
```cmd
copy /b "C:\Temp\barcode.tspl" "\\%COMPUTERNAME%\Xprinter"
```

### Supported Printers

Any thermal barcode printer that supports **TSPL** or **TSPL2** language:

- ✅ Xprinter (XP-360B, XP-Q361U, etc.)
- ✅ TSC (TTP-244, TTP-343, etc.)
- ✅ Zebra (GK420d, ZD410, etc.) - also supports ZPL
- ✅ Godex
- ✅ Argox

### Printing Method

- **macOS/Linux:** Direct USB communication via libusb
- **Windows:** Raw Binary Transfer via `copy /b` command
- **Protocol:** TSPL (Thermal Standard Printer Language)
- **Line Endings:** CRLF (`\r\n`) for Windows thermal printers
- **Label Size:** 35mm × 25mm (configurable in code)

## Support

If you encounter issues:

1. Check this guide first
2. Verify printer is in TSPL mode (not ESC/POS mode)
3. Print a Windows test page first to confirm driver works
4. Contact SellX support with:
   - Printer model
   - Windows version
   - Error message from SellX app
   - Screenshot from Devices and Printers

## FAQ

**Q: Do I need special software or drivers?**

A: No! Just install the manufacturer's driver that comes with your printer (or auto-installs via Windows Update).

**Q: Will this work with any TSPL printer?**

A: Yes, as long as the printer has a working Windows driver installed.

**Q: Can I use the printer with other applications?**

A: Yes! The printer remains fully functional in Windows. You can use it for both SellX and other applications.

**Q: What if my printer doesn't auto-install?**

A: Download the driver from the manufacturer's website. Links provided in step 2 above.

**Q: Do I need to configure the printer name?**

A: Currently, the printer name is hardcoded as "Xprinter XP-360B". Future updates will allow selecting from detected printers.

---

**Last Updated:** 2025-01-05
**Version:** 1.0.0
**Applies to:** SellX POS v1.0.0+

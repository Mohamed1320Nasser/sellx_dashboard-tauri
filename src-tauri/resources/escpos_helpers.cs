using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class EscPosConverter {
    public static byte[] BitmapToEscPos(Bitmap src, int printerDots) {
        int w = printerDots;
        float scale = (float)w / src.Width;
        int h = (int)(src.Height * scale);

        using (Bitmap scaled = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
            using (Graphics g = Graphics.FromImage(scaled)) {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.Clear(Color.White);
                g.DrawImage(src, 0, 0, w, h);
            }

            Rectangle rect = new Rectangle(0, 0, w, h);
            BitmapData bd = scaled.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            byte[] pixels = new byte[Math.Abs(bd.Stride) * h];
            Marshal.Copy(bd.Scan0, pixels, 0, pixels.Length);
            int stride = bd.Stride;
            scaled.UnlockBits(bd);

            // Floyd-Steinberg dithering to monochrome (preserves Arabic letterform detail)
            int bpl = (w + 7) / 8;
            byte[] mono = new byte[bpl * h];

            // Convert to grayscale float buffer for error diffusion
            float[] errors = new float[w * h];
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int idx = y * stride + x * 4; // BGRA format
                    errors[y * w + x] = (float)(0.299 * pixels[idx + 2] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx]);
                }
            }

            // Hybrid thresholding + Floyd-Steinberg: for near-black/near-white pixels
            // (glyph interiors and clear background) we threshold directly and skip
            // error diffusion — this keeps Arabic strokes solid instead of speckled.
            // Only the mid-gray edge pixels get dithered.
            const float DARK_EDGE = 80f;   // below this → solid black, no diffusion
            const float LIGHT_EDGE = 180f; // above this → solid white, no diffusion
            const float THRESHOLD = 140f;  // slightly darker threshold tightens text

            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int ei = y * w + x;
                    float oldVal = errors[ei];
                    float newVal;
                    bool diffuse;

                    if (oldVal <= DARK_EDGE) {
                        newVal = 0;
                        diffuse = false;
                    } else if (oldVal >= LIGHT_EDGE) {
                        newVal = 255;
                        diffuse = false;
                    } else {
                        newVal = oldVal < THRESHOLD ? 0 : 255;
                        diffuse = true;
                    }

                    if (newVal == 0) { // black dot
                        mono[y * bpl + x / 8] |= (byte)(1 << (7 - x % 8));
                    }

                    if (diffuse) {
                        float err = oldVal - newVal;
                        if (x + 1 < w)            errors[ei + 1]         += err * 7 / 16;
                        if (y + 1 < h && x > 0)   errors[(y+1)*w + x-1] += err * 3 / 16;
                        if (y + 1 < h)            errors[(y+1)*w + x]   += err * 5 / 16;
                        if (y + 1 < h && x+1 < w) errors[(y+1)*w + x+1] += err * 1 / 16;
                    }
                }
            }

            // Build ESC/POS command sequence (256-line bands to stay within printer limits)
            var cmd = new List<byte>();
            cmd.AddRange(new byte[] { 0x1B, 0x40 });               // ESC @     - initialize

            int bandHeight = 256;
            int row = 0;
            while (row < h) {
                int lines  = Math.Min(bandHeight, h - row);
                int offset = row * bpl;
                int count  = lines * bpl;

                cmd.AddRange(new byte[] { 0x1D, 0x76, 0x30, 0x00 }); // GS v 0 0
                cmd.Add((byte)(bpl & 0xFF));
                cmd.Add((byte)((bpl >> 8) & 0xFF));                   // xL xH (bytes per line)
                cmd.Add((byte)(lines & 0xFF));
                cmd.Add((byte)((lines >> 8) & 0xFF));                 // yL yH (lines in this band)

                byte[] band = new byte[count];
                Array.Copy(mono, offset, band, 0, count);
                cmd.AddRange(band);

                row += lines;
            }

            cmd.AddRange(new byte[] { 0x1B, 0x64, 0x04 });         // ESC d 4   - feed 4 lines
            cmd.AddRange(new byte[] { 0x1D, 0x56, 0x00 });         // GS V 0    - full cut

            return cmd.ToArray();
        }
    }
}

public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

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

    public static bool SendRaw(string printer, byte[] data) {
        IntPtr hPrinter;
        if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) return false;
        try {
            var di = new DOCINFOA { pDocName = "Sultana Receipt", pDataType = "RAW" };
            if (!StartDocPrinter(hPrinter, 1, ref di)) return false;
            try {
                StartPagePrinter(hPrinter);
                IntPtr ptr = Marshal.AllocCoTaskMem(data.Length);
                try {
                    Marshal.Copy(data, 0, ptr, data.Length);
                    int written;
                    WritePrinter(hPrinter, ptr, data.Length, out written);
                } finally {
                    Marshal.FreeCoTaskMem(ptr);
                }
                EndPagePrinter(hPrinter);
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
        return true;
    }
}

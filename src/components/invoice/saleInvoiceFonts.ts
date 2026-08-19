import { Font } from "@react-pdf/renderer";
import regularFont from "../../assets/fonts/IBMPlexSansArabic-Regular.woff";
import boldFont from "../../assets/fonts/IBMPlexSansArabic-Bold.woff";

let registered = false;

// Registers the Arabic-supporting font used across the app's print/receipt
// paths so the PDF has real, selectable Arabic text instead of a screenshot.
export function registerSaleInvoiceFonts() {
  if (registered) return;
  registered = true;

  Font.register({
    family: "IBM Plex Sans Arabic",
    fonts: [
      { src: regularFont, fontWeight: "normal" },
      { src: boldFont, fontWeight: "bold" },
    ],
  });

  // react-pdf's default hyphenation callback breaks Arabic words at
  // arbitrary points; disable it so words wrap as whole units.
  Font.registerHyphenationCallback((word) => [word]);
}

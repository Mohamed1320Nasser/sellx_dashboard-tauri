import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { readFileSync } from "fs";

// the app version shown to users = package.json (kept equal to the desktop version by release:version)
const appVersion: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => {
  const isTauri = !!process.env.TAURI_ENV_PLATFORM;
  const isProduction = mode === "production" || process.env.NODE_ENV === "production";

  return {
    plugins: [react()],
    base: isTauri ? "/" : "/",
    build: {
      outDir: "dist",
      minify: isProduction ? "terser" : false,
      sourcemap: !isProduction,
      target: "es2020",
      chunkSizeWarningLimit: 2000,
      terserOptions: isProduction
        ? {
            compress: {
              drop_console: false,
              drop_debugger: true,
              pure_funcs: ["console.debug"],
            },
            format: { comments: false },
          }
        : undefined,
      cssCodeSplit: true,
      cssMinify: isProduction,
      assetsInlineLimit: 4096,
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
        "@desktop": resolve(__dirname, "./src/desktop"),
        "@shared": resolve(__dirname, "./src/shared"),
      },
    },
    define: {
      "import.meta.env.VITE_TARGET": JSON.stringify(isTauri ? "desktop" : "web"),
      "import.meta.env.BUILD_TIME": JSON.stringify(new Date().toISOString()),
      "import.meta.env.APP_VERSION": JSON.stringify(appVersion),
    },
    envPrefix: ["VITE_", "TAURI_"],
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "@tanstack/react-query",
        "axios",
        "zustand",
      ],
    },
    server: {
      port: 5173,
      strictPort: true,
      host: host || "0.0.0.0",
      hmr: host
        ? { protocol: "ws", host, port: 5173 }
        : undefined,
    },
    preview: {
      port: 4173,
    },
    esbuild: {
      legalComments: isProduction ? "none" : "inline",
    },
  };
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(rootDir, "public"),
  plugins: [react()],
  publicDir: false,
  resolve: {
    alias: {
      "@lib": path.join(rootDir, "lib"),
    },
  },
  server: {
    middlewareMode: true,
  },
  build: {
    outDir: path.join(rootDir, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.join(rootDir, "public", "index.html"),
        webview: path.join(rootDir, "public", "scripture-web-view.html"),
      },
    },
  },
});

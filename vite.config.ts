import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves project sites from a subpath; dev uses root.
export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "/vested/",
  build: { target: "es2022" },
  plugins: [
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Vested",
        short_name: "Vested",
        description: "You don't get game time. You vest it.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: ".",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App-shell precache only. User data lives in IndexedDB, which
        // updates must never clear (docs/prd.md §5).
        navigateFallback: "index.html",
      },
    }),
  ],
}));

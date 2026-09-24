import { defineConfig } from "vite";

// GitHub Pages serves project sites from a subpath; dev uses root.
export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "/vested/",
  build: { target: "es2022" },
}));

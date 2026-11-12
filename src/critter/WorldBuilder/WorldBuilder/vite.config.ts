import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (/tiptap|prosemirror|markdown/.test(id)) return "editor";
            if (id.includes("leaflet")) return "maps";
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8767",
      "/media": "http://127.0.0.1:8767",
    },
  },
});

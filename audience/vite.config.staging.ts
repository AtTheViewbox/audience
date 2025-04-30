import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  base : '/audience/staging',
  plugins: [react(), wasm(), topLevelAwait()],
  envDir: '../',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
        // rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
    //hmr: {
    //  clientPort: 443,
    //},
  },
  worker: {
    // Not needed with vite-plugin-top-level-await >= 1.3.0
    // format: "es",
    plugins: [
      wasm(),
      topLevelAwait()
    ]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
       "@cornerstonejs/tools": "@cornerstonejs/tools/dist/umd/index.js"
    },
  },
})

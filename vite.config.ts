// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/features": path.resolve(__dirname, "./src/features"),
      "@/shared": path.resolve(__dirname, "./src/shared"),
      "@/app": path.resolve(__dirname, "./src/app"),
      "@/config": path.resolve(__dirname, "./src/config"),
      "@/pages": path.resolve(__dirname, "./src/pages"),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
}));
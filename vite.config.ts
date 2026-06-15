import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "github-pages" ? "/solar-system-sim-design/" : "/",
  plugins: [react()],
  // postprocessing renders R3F components, so React/three/fiber must resolve to a
  // single instance — otherwise the dev pre-bundle hands postprocessing its own React
  // copy and every hook throws "Invalid hook call".
  resolve: {
    dedupe: ["react", "react-dom", "@react-three/fiber", "three"],
  },
  optimizeDeps: {
    include: ["@react-three/postprocessing", "postprocessing"],
  },
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 35,
            },
            {
              name: "three-vendor",
              test: /node_modules[\\/]three[\\/]/,
              maxSize: 420_000,
              priority: 30,
            },
            {
              name: "react-three-vendor",
              test: /node_modules[\\/]@react-three[\\/]/,
              maxSize: 420_000,
              priority: 25,
            },
            {
              name: "ui-vendor",
              test: /node_modules[\\/](lucide-react|zustand)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
}));

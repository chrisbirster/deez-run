import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import stylex from "@stylexjs/unplugin/vite";

export default defineConfig({
  plugins: [
    stylex({
      unstable_moduleResolution: {
        type: "commonJS",
        rootDir: process.cwd(),
      },
    }),
    solid(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:5882",
    },
  },
});

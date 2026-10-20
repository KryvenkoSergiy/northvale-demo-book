import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // GitHub Pages project site: https://kryvenkosergiy.github.io/northvale-demo-book/
  base: "/northvale-demo-book/",
  plugins: [react(), tailwindcss()],
});

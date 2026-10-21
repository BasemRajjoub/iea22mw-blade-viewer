import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` inlines all JS, CSS and JSON into one standalone
// dist/index.html that also works when opened straight from disk (file://).
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    target: "es2020",
    reportCompressedSize: true,
  },
});

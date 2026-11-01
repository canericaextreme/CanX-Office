import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    {
      name: "offline-hours",
      enforce: "pre",
      resolveId(id) {
        if (
          ["@tanstack/react-start", "@/lib/owner-session", "@/lib/office-hours.functions"].includes(
            id,
          ) ||
          /\/lib\/(owner-session|office-hours\.functions)(\.tsx?)?$/.test(id)
        )
          return root + "tests/office-hours-visual/mocks.tsx";
      },
    },
    react(),
    tailwind(),
  ],
  resolve: { alias: { "@": root + "src" } },
  server: { host: "127.0.0.1", fs: { allow: [root] } },
});

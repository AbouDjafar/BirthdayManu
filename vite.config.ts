import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ command, mode, isPreview }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const url = env["VITE_SUPABASE_URL"];
  const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key?.startsWith("sb_publishable_")) {
    throw new Error("Renseigner VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY (clé publique).");
  }
  if (new URL(url).protocol !== "https:") throw new Error("L’URL Supabase doit utiliser HTTPS.");
  return {
    base: command === "serve" && !isPreview ? "/" : env["VITE_BASE_PATH"] || "/BirthdayManu/",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    build: { outDir: "dist", sourcemap: false },
  };
});

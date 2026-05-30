import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Die JSX-Hauptdatei liegt im Repo-Root (pv-rechner.jsx) und wird über
// src/main.jsx eingebunden. Vite mit React-Plugin transpiliert .jsx automatisch.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
});

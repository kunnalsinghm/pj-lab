import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// The dev server proxies /api to the backend so the login cookie is same-origin.
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { "/api": "http://localhost:4000" } } });

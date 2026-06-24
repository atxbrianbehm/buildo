import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createMaterialProviderVitePlugin } from "./server/building-family/viteMaterialProviderPlugin";

export default defineConfig({
  plugins: [react(), createMaterialProviderVitePlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});

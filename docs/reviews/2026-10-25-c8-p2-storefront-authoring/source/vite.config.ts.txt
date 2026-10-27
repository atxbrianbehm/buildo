import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createMaterialProviderVitePlugin } from "./server/building-family/viteMaterialProviderPlugin";
import { createPeriodReferenceStaticPlugin } from "./server/building-family/periodReferenceStaticPlugin";

export default defineConfig({
  plugins: [react(), createMaterialProviderVitePlugin(), createPeriodReferenceStaticPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});

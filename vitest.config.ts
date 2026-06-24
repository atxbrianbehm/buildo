import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"]
  }
});

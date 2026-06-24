import { chromium } from "@playwright/test";
import { createServer } from "vite";

let browser;
let server;

try {
  server = await createServer({
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: false
    }
  });

  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:5173/";

  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  await page.getByRole("heading", { name: "Buildo" }).waitFor({ state: "visible" });
  await page.getByLabel("Project setup status").waitFor({ state: "visible" });

  console.log(`E2E smoke passed at ${url}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}

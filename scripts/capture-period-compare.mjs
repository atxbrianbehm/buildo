/**
 * Capture kit-mode clay Assembly Hall + primary period refs for manual compare.
 * Usage: node scripts/capture-period-compare.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const outDir = path.resolve("docs/ref/comparisons/2026-07-12-first-pass");

async function main() {
  mkdirSync(outDir, { recursive: true });

  const server = await createServer({
    configFile: path.resolve("vite.config.ts"),
    server: { host: "127.0.0.1", port: 5199, strictPort: true }
  });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0] ?? "http://127.0.0.1:5199/";

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  try {
    await page.goto(`${url}#room=assemblyHall`);
    await page.getByRole("heading", { name: "Assembly Hall" }).waitFor({ state: "visible", timeout: 120_000 });
    await page.getByLabel("Generation run state").getByText("complete").waitFor({ state: "visible", timeout: 120_000 }).catch(() => {});
    // Fixture may already be ready when landing on Assembly Hall.
    await page.getByLabel("Assembly Hall Three.js canvas").waitFor({ state: "visible", timeout: 120_000 });
    await page.getByLabel("Presentation mode").selectOption("clay");
    // Allow a couple frames after clay switch.
    await page.waitForTimeout(800);

    const canvas = page.getByLabel("Assembly Hall Three.js canvas");
    await canvas.screenshot({ path: path.join(outDir, "assembly-hall-clay-default.png") });
    await page.screenshot({
      path: path.join(outDir, "assembly-hall-clay-page.png"),
      fullPage: false
    });

    // Mild orbit for a second angle if canvas is interactive via mouse on the application region.
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width * 0.55;
      const cy = box.y + box.height * 0.45;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 90, cy + 20, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      await canvas.screenshot({ path: path.join(outDir, "assembly-hall-clay-orbit.png") });
    }

    await page.goto(`${url}#room=periodRef`);
    await page.getByRole("heading", { name: /period references/i }).waitFor({ state: "visible", timeout: 60_000 });

    const primaryIds = [
      { id: "ref-marx-grocery-buffalo", label: "marx-grocery" },
      { id: "ref-brooklyn-vanderbilt-nara", label: "brooklyn-vanderbilt" },
      { id: "ref-boykin-school-facade", label: "boykin-stoop" },
      { id: "ref-holdout-116th", label: "holdout-116th" },
      { id: "habs-columbus-apartment-front", label: "habs-columbus" }
    ];

    // Ensure primary filter is on.
    await page.getByLabel("Period reference priority filter").selectOption("primary");
    await page.waitForTimeout(200);

    for (const target of primaryIds) {
      const buttons = page.getByLabel("Period reference list").getByRole("button");
      const count = await buttons.count();
      let clicked = false;
      for (let i = 0; i < count; i += 1) {
        const text = (await buttons.nth(i).innerText()).toLowerCase();
        if (
          (target.label === "marx-grocery" && text.includes("marx")) ||
          (target.label === "brooklyn-vanderbilt" && text.includes("vanderbilt")) ||
          (target.label === "boykin-stoop" && text.includes("stoop")) ||
          (target.label === "holdout-116th" && text.includes("116th")) ||
          (target.label === "habs-columbus" && text.includes("columbus"))
        ) {
          await buttons.nth(i).click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        console.warn(`Could not find list button for ${target.id}`);
        continue;
      }
      const img = page.locator(".period-ref-lab__image");
      await img.waitFor({ state: "visible" });
      // Wait for image load
      await page.waitForFunction(
        () => {
          const el = document.querySelector(".period-ref-lab__image");
          return el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0;
        },
        undefined,
        { timeout: 30_000 }
      );
      await img.screenshot({ path: path.join(outDir, `ref-${target.label}.jpg`) });
    }

    const meta = {
      capturedAt: new Date().toISOString(),
      url,
      outDir,
      notes: "First-pass clay capture for period comparison."
    };
    writeFileSync(path.join(outDir, "capture-meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`Wrote captures to ${outDir}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { expect, test } from "@playwright/test";

test("loads the Buildo shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Buildo" })).toBeVisible();
  await expect(page.getByLabel("Project setup status")).toBeVisible();
});


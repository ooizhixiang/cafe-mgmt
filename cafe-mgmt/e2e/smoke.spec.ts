import { test, expect } from "@playwright/test";

const TEST_USER = {
  name: "Smoke Tester",
  email: `smoke-${Date.now()}@test.com`,
  password: "testpass123",
};

test.describe("Full Smoke Test", () => {
  test("complete app walkthrough", async ({ page }) => {
    // ─── 1. Register ────────────────────────────────────────
    await page.goto("/register");
    await page.fill("#name", TEST_USER.name);
    await page.fill("#email", TEST_USER.email);
    await page.fill("#password", TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(setup)?$/, { timeout: 15000 });

    if (page.url().includes("/setup")) {
      await page.click('text="Start from scratch"');
      await page.waitForURL("**/setup/ingredients", { timeout: 10000 });
      await page.click('text="Looks good — go to my cafe"');
      await page.waitForURL("/", { timeout: 10000 });
    }

    // ─── 2. Dashboard loads ─────────────────────────────────
    await expect(page.locator("h1")).toContainText("Dashboard", { timeout: 10000 });
    await expect(page.getByText("Welcome back")).toBeVisible();

    // ─── 3. Navigate all tabs ───────────────────────────────
    await page.goto("/inventory");
    await expect(page.locator("h1")).toContainText("Inventory", { timeout: 10000 });

    await page.goto("/wastage");
    await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });

    await page.goto("/daily-report");
    await expect(page.locator("h1")).toContainText("Sales", { timeout: 10000 });

    await page.goto("/suppliers");
    await expect(page.locator("h1")).toContainText("Suppliers", { timeout: 10000 });

    await page.goto("/recipes");
    await expect(page.locator("h1")).toContainText("Recipes", { timeout: 10000 });

    await page.goto("/grab-and-go");
    await expect(page.locator("h1")).toContainText("Grab", { timeout: 10000 });

    await page.goto("/settings");
    await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });

    // ─── 4. Add ingredients via the spreadsheet ─────────────
    await page.goto("/ingredients");
    await page.waitForTimeout(2000);

    await page.getByLabel("New ingredient name").fill("Coffee Beans");
    await page.getByLabel("New ingredient unit").fill("gm");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.waitForTimeout(2000);
    // Wait for previous add to clear the name input before next fill
    await expect(page.getByLabel("New ingredient name")).toHaveValue("");

    await page.getByLabel("New ingredient name").fill("Milk");
    await page.getByLabel("New ingredient unit").fill("ml");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByLabel("New ingredient name")).toHaveValue("");

    await page.getByLabel("New ingredient name").fill("Sugar");
    await page.getByLabel("New ingredient unit").fill("gm");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.waitForTimeout(2000);

    // ─── 5. Create recipe with variation ────────────────────
    await page.goto("/recipes");
    await page.waitForTimeout(3000);
    await page.click('text="+ Create Recipe"');
    await page.fill('input[placeholder="Recipe name"]', "Cafe Latte");
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(3000);
    await expect(page.getByText("Cafe Latte").first()).toBeVisible({ timeout: 5000 });

    // Add ingredient to Original
    await page.click('text="+ Add ingredient"');
    await page.waitForTimeout(500);
    await page.selectOption("select", { label: "Coffee Beans (gm)" });
    await page.locator('input[type="number"][min="1"]').first().fill("18");
    await page.locator('button:has-text("Add"):not([disabled])').first().click();
    await page.waitForTimeout(2000);

    // Add variation
    await page.click('text="+ Add variation"');
    await page.fill('input[placeholder="Variation name (e.g. Vanilla, Large)"]', "Iced");
    await page.locator('button:has-text("Add"):not([disabled])').last().click();
    await page.waitForTimeout(2000);
    await expect(page.getByText("Iced")).toBeVisible();

    // ─── 6. Set category on recipe ──────────────────────────
    const categoryBtn = page.getByText("Category: None");
    if (await categoryBtn.isVisible()) {
      await categoryBtn.click();
      await page.fill('input[placeholder="e.g. Drinks, Pastries, Snacks"]', "Drinks");
      await page.locator('input[placeholder="e.g. Drinks, Pastries, Snacks"]').press("Enter");
      await page.waitForTimeout(1000);
    }

    // ─── 7. Add notes ───────────────────────────────────────
    const notesArea = page.getByText("Click to add notes...");
    if (await notesArea.isVisible()) {
      await notesArea.click();
      await page.fill("textarea", "Test notes for smoke test");
      await page.click('button:has-text("Save")');
      await page.waitForTimeout(1000);
      await expect(page.getByText("Test notes for smoke test")).toBeVisible();
    }

    // ─── 8. Search recipes ──────────────────────────────────
    await page.click('text="← Back to recipes"');
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="Search recipes..."]', "Cafe");
    await expect(page.getByText("Cafe Latte")).toBeVisible();
    await page.fill('input[placeholder="Search recipes..."]', "zzzzz");
    await expect(page.getByText("No recipes matching")).toBeVisible();
    await page.fill('input[placeholder="Search recipes..."]', "");

    // ─── 9. Rename recipe ───────────────────────────────────
    await page.getByText("Cafe Latte").click();
    await page.waitForTimeout(2000);
    const recipeName = page.locator("h3").filter({ hasText: "Cafe Latte" });
    if (await recipeName.isVisible()) {
      await recipeName.click();
      await page.waitForTimeout(500);
      const nameInput = page.locator("input.text-value");
      if (await nameInput.isVisible()) {
        await nameInput.fill("Cafe Latte Deluxe");
        await nameInput.press("Enter");
        await page.waitForTimeout(1000);
      }
    }

    // ─── 10. Grab & Go ─────────────────────────────────────
    await page.goto("/grab-and-go");
    await page.waitForTimeout(2000);

    // Add item
    await page.click('text="+ Add Item"');
    await page.fill('input[placeholder="Item name"]', "Cold Brew Bottle");
    await page.fill('input[placeholder="Price in RM (optional)"]', "8.00");
    await page.locator('button:has-text("Add"):not([disabled])').click();
    await page.waitForTimeout(2000);
    await expect(page.getByText("Cold Brew Bottle")).toBeVisible();

    // Set stock
    const stockInput = page.locator('input[inputmode="numeric"]').first();
    if (await stockInput.isVisible()) {
      await stockInput.fill("10");
      await stockInput.blur();
      await page.waitForTimeout(1000);
    }

    // ─── 11. Submit sales report ────────────────────────────
    await page.goto("/daily-report");
    await page.waitForTimeout(3000);

    // Find any recipe/item and set quantity
    const salesInputs = page.locator('input[type="number"][min="0"]');
    const inputCount = await salesInputs.count();
    if (inputCount > 0) {
      await salesInputs.first().fill("2");
    }

    const submitBtn = page.getByRole("button", { name: /Submit Report/ });
    if (await submitBtn.isEnabled()) {
      await submitBtn.click();
      await expect(page.getByText("Sales report submitted")).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("Inventory Deductions")).toBeVisible();
    }

    // ─── 12. Analysis tab ───────────────────────────────────
    await page.click('text="Submit Another Report"');
    await page.click('button:has-text("Analysis")');
    await page.waitForURL("**/daily-report?tab=analysis", { timeout: 5000 });
    await expect(page.getByText("items sold")).toBeVisible({ timeout: 10000 });

    // Day/Week/Month toggle
    await page.click('button:has-text("Week")');
    await expect(page.getByText("Last 7 days", { exact: true })).toBeVisible({ timeout: 5000 });
    await page.click('button:has-text("Month")');
    await expect(page.getByText("Last 30 days", { exact: true })).toBeVisible({ timeout: 5000 });

    // Print button
    await expect(page.getByText("Print Report")).toBeVisible();

    // ─── 13. Supplier management ────────────────────────────
    await page.goto("/suppliers");
    await page.waitForTimeout(2000);
    await page.click('text="+ Add Supplier"');
    await page.fill('input[placeholder="Supplier name"]', "Test Supplier");
    await page.fill('input[placeholder="Phone number"]', "0123456789");
    await page.locator('button:has-text("Add"):not([disabled])').click();
    await page.waitForTimeout(2000);
    await expect(page.getByText("Test Supplier")).toBeVisible();

    // ─── 14. Forgot password page ───────────────────────────
    await page.goto("/forgot-password");
    await expect(page.locator("h1")).toContainText("Forgot password");

    // ─── 15. Reset password page ────────────────────────────
    await page.goto("/reset-password/invalid-token");
    await expect(page.getByText("Invalid reset link")).toBeVisible({ timeout: 10000 });
  });
});

import { test, expect } from "@playwright/test";

const TEST_USER = {
  name: "Sales Tester",
  email: `sales-${Date.now()}@test.com`,
  password: "testpass123",
};

test.describe("Sales Report Feature", () => {
  test("full sales flow: register → setup → create recipe → submit sales → check analysis", async ({
    page,
  }) => {
    // ─── 1. Register a fresh account ────────────────────────
    await page.goto("/register");
    await expect(page.locator("h1")).toContainText("Create Account");

    await page.fill("#name", TEST_USER.name);
    await page.fill("#email", TEST_USER.email);
    await page.fill("#password", TEST_USER.password);
    await page.click('button[type="submit"]');

    // Wait for redirect — could go to /setup or / depending on template state
    await page.waitForURL(/\/(setup)?$/, { timeout: 15000 });

    // If we're on /setup, complete it
    if (page.url().includes("/setup")) {
      await page.click('text="Start from scratch"');
      await page.waitForURL("**/setup/ingredients", { timeout: 10000 });

      // Add Espresso ingredient
      await page.click('text="+ Add ingredient"');
      await page.fill('input[placeholder="Name"]', "Espresso");
      await page.fill('input[placeholder="Unit (e.g. lbs, oz, bags)"]', "shots");
      await page.locator("button.text-\\[var\\(--color-success\\)\\]").first().click();
      await page.waitForTimeout(2000);

      // Add Milk ingredient
      await page.click('text="+ Add ingredient"');
      await page.fill('input[placeholder="Name"]', "Milk");
      await page.fill('input[placeholder="Unit (e.g. lbs, oz, bags)"]', "oz");
      await page.locator("button.text-\\[var\\(--color-success\\)\\]").first().click();
      await page.waitForTimeout(2000);

      // Finish setup
      await page.click('text="Looks good — go to my cafe"');
      await page.waitForURL("/", { timeout: 10000 });
    } else {
      // Already on main page — add ingredients via the spreadsheet at /ingredients
      await page.goto("/ingredients");
      await page.waitForTimeout(2000);

      // Add Espresso via the sticky add-row at the bottom of the spreadsheet
      await page.getByLabel("New ingredient name").fill("Espresso");
      await page.getByLabel("New ingredient unit").fill("shots");
      await page.getByRole("button", { name: "Add ingredient" }).click();
      await page.waitForTimeout(2000);
      // Wait for first add to complete (name input clears) before starting second
      await expect(page.getByLabel("New ingredient name")).toHaveValue("");

      // Add Milk
      await page.getByLabel("New ingredient name").fill("Milk");
      await page.getByLabel("New ingredient unit").fill("oz");
      await page.getByRole("button", { name: "Add ingredient" }).click();
      await page.waitForTimeout(2000);
    }

    // ─── 2. Create a recipe with ingredients ────────────────
    await page.goto("/recipes");
    await page.waitForTimeout(3000);

    await page.click('text="+ Create Recipe"');
    await page.fill('input[placeholder="Recipe name"]', "Latte");
    await page.fill('input[placeholder="Description (optional)"]', "Classic cafe latte");
    await page.click('button:has-text("Create")');

    // Wait for recipe detail to load
    await page.waitForTimeout(3000);
    await expect(page.locator("h3").filter({ hasText: "Latte" })).toBeVisible({ timeout: 5000 });

    // Add Espresso (2 shots per serving)
    await page.click('text="+ Add ingredient"');
    await page.waitForTimeout(500);
    await page.selectOption("select", { label: "Espresso (shots)" });
    await page.locator('input[type="number"][min="1"]').fill("2");
    await page.click('button:has-text("Add"):not([disabled])');
    await page.waitForTimeout(2000);

    // Add Milk (8 oz per serving)
    await page.click('text="+ Add ingredient"');
    await page.waitForTimeout(500);
    await page.selectOption("select", { label: "Milk (oz)" });
    await page.locator('input[type="number"][min="1"]').fill("8");
    await page.click('button:has-text("Add"):not([disabled])');
    await page.waitForTimeout(2000);

    // Verify ingredients are listed
    await expect(page.getByText("Espresso").first()).toBeVisible();
    await expect(page.getByText("Milk").first()).toBeVisible();

    // ─── 3. Navigate to Sales tab ───────────────────────────
    await page.goto("/daily-report");
    await expect(page.locator("h1")).toContainText("Sales", { timeout: 10000 });

    // Should see the Latte recipe
    await expect(page.getByText("Latte").first()).toBeVisible({ timeout: 10000 });

    // ─── 4. Submit a sales report ───────────────────────────
    // Set quantity to 5 using the input
    const salesInput = page.locator('input[type="number"][min="0"]').first();
    await salesInput.fill("5");

    // Submit button should show item count
    const submitBtn = page.getByRole("button", { name: /Submit Report/ });
    await expect(submitBtn).toContainText("5 items sold");
    await submitBtn.click();

    // Should see success toast
    await expect(page.getByText("Sales report submitted")).toBeVisible({
      timeout: 5000,
    });

    // Should see deductions summary
    await expect(page.getByText("Inventory Deductions")).toBeVisible();
    // Espresso: 2 shots × 5 = -10
    await expect(page.getByText("-10 shots")).toBeVisible();
    // Milk: 8 oz × 5 = -40
    await expect(page.getByText("-40 oz")).toBeVisible();
    // Both should show "no count today" since we didn't set inventory
    await expect(page.getByText("(no count today)").first()).toBeVisible();

    // ─── 5. Submit another report to test reset ─────────────
    await page.click('text="Submit Another Report"');

    // Quantities should be reset to 0
    await expect(salesInput).toHaveValue("0");

    // Submit 3 more lattes
    await salesInput.fill("3");
    await page.getByRole("button", { name: /Submit Report/ }).click();
    await expect(page.getByText("Sales report submitted")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("-6 shots")).toBeVisible();
    await expect(page.getByText("-24 oz")).toBeVisible();

    // ─── 6. Check Analysis tab — Today ──────────────────────
    await page.click('text="Submit Another Report"');
    await page.click('button:has-text("Analysis")');
    await page.waitForURL("**/daily-report?tab=analysis", { timeout: 5000 });

    // Should show total: 5 + 3 = 8 items sold today
    await expect(page.getByText("items sold")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("p.text-\\[2rem\\]")).toContainText("8");

    // Recipe breakdown
    await expect(page.getByText("Recipes Sold")).toBeVisible();
    await expect(page.getByText("Latte")).toBeVisible();

    // Ingredient breakdown
    await expect(page.getByText("Ingredients Used")).toBeVisible();
    // Espresso: (2×5) + (2×3) = 16 shots
    await expect(page.getByText("16 shots")).toBeVisible();
    // Milk: (8×5) + (8×3) = 64 oz
    await expect(page.getByText("64 oz")).toBeVisible();

    // ─── 7. Check Week view ─────────────────────────────────
    await page.click('button:has-text("Week")');
    await page.waitForTimeout(1500);
    await expect(page.getByText("Last 7 days")).toBeVisible();
    await expect(page.getByText("Latte")).toBeVisible();
    await expect(page.locator("p.text-\\[2rem\\]")).toContainText("8");

    // ─── 8. Check Month view ────────────────────────────────
    await page.click('button:has-text("Month")');
    await page.waitForTimeout(1500);
    await expect(page.getByText("Last 30 days")).toBeVisible();
    await expect(page.getByText("Latte")).toBeVisible();

    // ─── 9. Go back to Report tab ───────────────────────────
    await page.click('button:has-text("Report")');
    await page.waitForURL(/\/daily-report(?:\?|$)/);
    await expect(page.getByText("Latte").first()).toBeVisible();
  });
});

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const builderStorageKey = "agentic-grocery-cart-builder:v2";
const recommendedActiveCartHeading = /Active Cart .+\(Recommended\)/;
const recommendedOptionHeading = /.+ \(Recommended\)$/;

test.describe("agentic grocery cart MVP", () => {
  test("builds a shawarma cart from mock model profile inference", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("shawarma");
    await buildCurrentCart(page);

    await expect(page.getByText("Inferred from your cart")).toBeVisible();
    await expect(page.getByText("mock model meal profile")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ground Lamb" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pita Bread, 6 Count" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shawarma Seasoning Blend" })).toBeVisible();

    const startingTotal = await page.getByTestId("cart-total").innerText();
    await page.getByRole("button", { name: "Increase Lamb" }).click();
    await expect(page.getByText("3 pkg", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("cart-total")).not.toHaveText(startingTotal);
  });

  test("handles typo-tolerant meal search and alias add-item search", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("shwarma");
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: "Ground Lamb" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pita Bread, 6 Count" })).toBeVisible();

    await page.locator("#add-cart-item").fill("flatbread");
    await expect(page.getByRole("option", { name: "Pita Bread", exact: true })).toBeVisible();
  });

  test("keeps the current cart after a browser refresh", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("shawarma");
    await buildCurrentCart(page);

    const startingTotal = await page.getByTestId("cart-total").innerText();
    await page.waitForFunction(() => window.localStorage.getItem("agentic-grocery-cart-builder:v2")?.includes("shawarma"));
    await page.reload();

    await expect(page.locator("#grocery-input")).toHaveValue("shawarma");
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ground Lamb" })).toBeVisible();
    await expect(page.getByTestId("cart-total")).toHaveText(startingTotal);
  });

  test("shows an uncertainty state for unsupported meals", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("surprise feast from saturn");
    await buildCurrentCart(page);

    await expect(page.getByText("I could not build a reliable cart yet")).toBeVisible();
    await expect(page.getByText("No mock model meal profile matched this request")).toBeVisible();
  });

  test("uses a typewriter introduction for empty cart states", async ({ page }, testInfo) => {
    await openApp(page);

    const mealTypewriter = page.getByTestId("empty-state-typewriter");
    await expect(mealTypewriter).toHaveText("Build your grocery cart, your way");
    await expect(mealTypewriter).toBeVisible();
    await expect(page.getByText("Build your cart to see available options")).toBeVisible();

    const typewriterAnimation = await mealTypewriter.evaluate((element) => {
      const beforeStyle = window.getComputedStyle(element, "::before");
      const afterStyle = window.getComputedStyle(element, "::after");

      return {
        afterAnimation: afterStyle.animationName,
        afterIterations: afterStyle.animationIterationCount,
        beforeAnimation: beforeStyle.animationName,
      };
    });

    expect(typewriterAnimation.beforeAnimation).toContain("typewriter-mask");
    expect(typewriterAnimation.afterAnimation).toContain("typewriter-mask");
    expect(typewriterAnimation.afterAnimation).toContain("typewriter-cursor");
    expect(typewriterAnimation.afterIterations).toContain("3");

    await page.waitForTimeout(3_900);
    await expect(mealTypewriter).toHaveText("Build your grocery cart, your way");
    const completedCursorOpacity = await mealTypewriter.evaluate((element) =>
      window.getComputedStyle(element, "::after").opacity,
    );
    expect(completedCursorOpacity).toBe("0");

    await page.getByRole("button", { name: "Grocery list", exact: true }).click();
    const listTypewriter = page.getByTestId("empty-state-typewriter");
    await expect(listTypewriter).toHaveText("Build your grocery cart, your way");
    await expect(page.getByRole("heading", { name: "What's on your list?" })).toBeVisible();

    if (testInfo.project.name === "desktop") {
      await buildCurrentCart(page);
      await expect(page.getByRole("heading", { name: /Active Cart/ })).toBeVisible();
      await page.getByRole("button", { name: "Clear Cart" }).click();
      await expect(page.getByTestId("empty-state-typewriter")).toHaveText("Build your grocery cart, your way");
    }
  });

  test("shows full empty cart copy immediately for reduced motion users", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openApp(page);

    const typewriter = page.getByTestId("empty-state-typewriter");
    await expect(typewriter).toHaveText("Build your grocery cart, your way");
    await expect(typewriter).toBeVisible();

    const reducedMotionStyles = await typewriter.evaluate((element) => {
      const beforeStyle = window.getComputedStyle(element, "::before");
      const afterStyle = window.getComputedStyle(element, "::after");

      return {
        afterAnimation: afterStyle.animationName,
        afterContent: afterStyle.content,
        beforeAnimation: beforeStyle.animationName,
        beforeContent: beforeStyle.content,
      };
    });

    expect(reducedMotionStyles.beforeAnimation).toBe("none");
    expect(reducedMotionStyles.afterAnimation).toBe("none");
    expect(reducedMotionStyles.beforeContent).toBe("none");
    expect(reducedMotionStyles.afterContent).toBe("none");
  });

  test("happy path: build, edit, add, change quantity, swap, and remove", async ({ page }) => {
    await openApp(page);

    await expect(page.getByText("Build your grocery cart, your way")).toBeVisible();
    await expect(page.getByText("Build your cart to see available options")).toBeVisible();
    await expect(page.getByText("Build a cart to compare grocery cost, fees, and store choices.")).not.toBeVisible();

    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Boneless Skinless Chicken Breast" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Romaine Lettuce Hearts" })).toBeVisible();

    const startingTotal = await page.getByTestId("cart-total").innerText();

    await page.getByLabel("Active cart").locator("article").first().locator("button").filter({ hasText: "Swap" }).first().click();
    await expect(page.getByTestId("cart-total")).not.toHaveText(startingTotal);

    await page.getByRole("button", { name: "Increase Romaine lettuce" }).click();
    await expect(page.getByText("2 pack", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Decrease Romaine lettuce" }).click();
    await expect(page.getByText("1 pack", { exact: true })).toBeVisible();

    await page.locator("#add-cart-item").fill("milk");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByText("Whole Milk")).toBeVisible();

    const totalBeforeAlternative = await page.getByTestId("cart-total").innerText();
    await page.getByText("Swap").first().click();
    await expect(page.getByTestId("cart-total")).not.toHaveText(totalBeforeAlternative);
    await expect(page.getByText("after your cart edits")).toBeVisible();

    const cartRows = page.getByLabel("Active cart").locator("article");
    const firstRowBox = await cartRows.nth(0).boundingBox();
    const secondRowBox = await cartRows.nth(1).boundingBox();
    const removeButtons = page.getByRole("button", { name: "Remove item" });
    const countBeforeRemove = await removeButtons.count();
    expect(firstRowBox).not.toBeNull();
    expect(secondRowBox).not.toBeNull();
    await removeButtons.first().click();
    await expect(page.getByRole("button", { name: "Remove item" })).toHaveCount(countBeforeRemove - 1);
    const newFirstRowBox = await cartRows.nth(0).boundingBox();
    expect(newFirstRowBox).not.toBeNull();

    if (firstRowBox && newFirstRowBox) {
      expect(Math.abs(newFirstRowBox.y - firstRowBox.y)).toBeLessThan(48);
    }
  });

  test("shows a deliberate loading moment for meal and grocery builds", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("shawarma");
    await page.getByRole("button", { name: "Build cart" }).click();

    await expect(page.getByTestId("cart-loading-status")).toHaveCount(0);
    await expect(page.getByTestId("cart-loading-blocker")).toBeVisible();
    await expect(page.getByTestId("cart-build-loading-canvas")).toContainText("Building cart");
    await expect(page.getByTestId("cart-options-loading-canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Build cart" })).toBeDisabled();
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).not.toBeVisible();

    const blockingElement = await page.evaluate(() =>
      document.elementFromPoint(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2))?.getAttribute(
        "data-testid",
      ),
    );
    expect(blockingElement).toBe("cart-loading-blocker");

    await expect(page.getByTestId("cart-build-loading-canvas")).toBeHidden({
      timeout: 4_000,
    });
    await expect(page.getByTestId("cart-loading-blocker")).toBeHidden();
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByTestId("cart-result-reveal").first()).toHaveCSS("animation-duration", /0\.9s|900ms/);
    await expect(page.getByRole("heading", { name: "Ground Lamb" })).toBeVisible();

    await page.locator("#grocery-input").fill("chicken curry");
    await page.locator("#grocery-input").press("Enter");

    await expect(page.getByTestId("cart-loading-status")).toHaveCount(0);
    await expect(page.getByTestId("cart-build-loading-canvas")).toBeVisible();
    await expect(page.getByTestId("cart-options-loading-canvas")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ground Lamb" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).not.toBeVisible();

    await expect(page.getByTestId("cart-build-loading-canvas")).toBeHidden({
      timeout: 4_000,
    });
    await expect(page.getByRole("heading", { name: "Boneless Chicken Thighs" })).toBeVisible();

    await page.getByRole("button", { name: "Grocery list", exact: true }).click();
    await page.locator("#grocery-input").fill("milk, eggs, bananas");
    await page.locator("#grocery-input").press("Enter");

    await expect(page.getByTestId("cart-loading-status")).toHaveCount(0);
    await expect(page.getByTestId("cart-build-loading-canvas")).toBeVisible();
    await expect(page.getByTestId("cart-build-loading-canvas")).toBeHidden({
      timeout: 4_000,
    });
    await expect(page.getByRole("heading", { name: "Whole Milk" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Large Eggs, 12 Count" })).toBeVisible();
  });

  test("quantity picker updates package count, line price, and cart total on every click", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    const startingTotal = await page.getByTestId("cart-total").innerText();
    await page.getByRole("button", { name: "Increase Chicken breast" }).click();
    const secondTotal = await page.getByTestId("cart-total").innerText();

    await expect(page.getByText("2 pkg", { exact: true }).first()).toBeVisible();
    expect(secondTotal).not.toBe(startingTotal);

    await page.getByRole("button", { name: "Increase Chicken breast" }).click();
    await expect(page.getByText("3 pkg", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("cart-total")).not.toHaveText(secondTotal);
  });

  test("product images render once per cart line and do not multiply with quantity", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    const startingLineCount = await page.getByRole("button", { name: "Remove item" }).count();
    await expect(page.getByTestId("selected-product-image")).toHaveCount(startingLineCount);

    await page.locator("#add-cart-item").fill("avocado");
    await page.getByRole("option", { name: "Avocado", exact: true }).click();
    await page.locator("#add-cart-item").fill("avocado");
    await page.getByRole("option", { name: "Avocado", exact: true }).click();

    await expect(page.getByRole("button", { name: "Remove item" })).toHaveCount(startingLineCount);
    await expect(page.getByTestId("selected-product-image")).toHaveCount(startingLineCount);
    await expect(page.getByText("3 pkg", { exact: true }).first()).toBeVisible();
  });

  test("added items appear in the active cart and change totals immediately", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    const startingTotal = await page.getByTestId("cart-total").innerText();
    const startingLineCount = await page.getByRole("button", { name: "Remove item" }).count();

    await page.locator("#add-cart-item").fill("milk");
    await page.getByRole("button", { name: "Add to cart" }).click();

    await expect(page.getByRole("heading", { name: "Whole Milk" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove item" })).toHaveCount(startingLineCount + 1);
    await expect(page.getByTestId("cart-total")).not.toHaveText(startingTotal);
  });

  test("add-item search uses an ecommerce dropdown with images and keyboard selection", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    const input = page.locator("#add-cart-item");
    const dropdown = page.getByTestId("add-item-search-dropdown");

    await input.fill("beef");
    await expect(dropdown).toBeVisible();
    await expect(input).toHaveAttribute("role", "combobox");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("add-item-option-ground-beef")).toBeVisible();
    await expect(page.getByTestId("add-item-option-ground-beef")).toContainText("Ground Beef");
    await expect(page.getByTestId("add-item-option-ground-beef")).toContainText(/\d+ stores?/);
    await expect(page.getByTestId("add-item-option-ground-beef").getByTestId("add-item-product-image")).toBeVisible();
    const groundBeefTitleBox = await page.getByTestId("add-item-option-ground-beef").getByText("Ground Beef").boundingBox();
    const groundBeefStoreBox = await page
      .getByTestId("add-item-option-ground-beef")
      .getByTestId("add-item-option-store-count")
      .boundingBox();
    const groundBeefOptionBox = await page.getByTestId("add-item-option-ground-beef").boundingBox();

    expect(groundBeefTitleBox).not.toBeNull();
    expect(groundBeefStoreBox).not.toBeNull();
    expect(groundBeefOptionBox).not.toBeNull();

    if (groundBeefTitleBox && groundBeefStoreBox && groundBeefOptionBox) {
      expect(Math.abs(groundBeefTitleBox.y - groundBeefStoreBox.y)).toBeLessThanOrEqual(4);
      expect(groundBeefStoreBox.x + groundBeefStoreBox.width).toBeGreaterThan(
        groundBeefOptionBox.x + groundBeefOptionBox.width - 24,
      );
    }

    const cartHeading = page.getByRole("heading", { name: /Active Cart/ });
    await cartHeading.click();
    await expect(dropdown).toBeHidden();

    await input.fill("beef");
    await page.getByRole("option", { name: "Ground Beef", exact: true }).click();

    await expect(dropdown).toBeHidden();
    await expect(page.getByRole("heading", { name: "Ground Beef" })).toBeVisible();

    await input.fill("milk");
    await expect(dropdown.getByRole("option", { name: "Milk", exact: true })).toBeVisible();
    const firstOption = dropdown.getByRole("option").first();
    const secondOption = dropdown.getByRole("option").nth(1);
    await expect(firstOption).toHaveAttribute("aria-selected", "true");
    await input.press("ArrowDown");
    await expect(secondOption).toHaveAttribute("aria-selected", "true");
    await input.press("ArrowUp");
    await expect(firstOption).toHaveAttribute("aria-selected", "true");
    await input.press("Enter");

    await expect(dropdown).toBeHidden();
    await expect(page.getByRole("heading", { name: "Whole Milk" })).toBeVisible();

    await input.fill("interstellar kids snack");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText("No matches");
    await input.press("Escape");

    await expect(dropdown).toBeHidden();
    await expect(input).toHaveAttribute("aria-expanded", "false");
  });

  test("uses a cart-centered UX with widened shopping brief and compact cart options", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: "Gini, Your AI Grocery Shopper" })).toBeVisible();
    const headerLogo = page.getByTestId("app-header-logo");
    await expect(headerLogo).toBeVisible();
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 640) {
      await expect(page.getByRole("button", { name: "Clear Cart" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Export Grocery List" })).toBeVisible();

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export Grocery List" }).click();
      const download = await downloadPromise;
      const downloadPath = await download.path();

      expect(downloadPath).not.toBeNull();
      const exportedText = await readFile(downloadPath ?? "", "utf-8");

      expect(exportedText).toContain("Plan:");
      expect(exportedText).not.toContain("(Recommended)");
    }
    await expect(page.getByText("Agentic grocery cart builder")).not.toBeVisible();
    await expect(page.getByText("Your AI shopping assistant")).not.toBeVisible();
    await expect(page.getByText("All changes saved")).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Catalog" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "What would you like to make?" })).toBeVisible();
    await expect(page.getByText("Shopping brief", { exact: true })).not.toBeVisible();
    await expect(page.getByText("AI", { exact: true })).not.toBeVisible();
    await expect(page.getByText("Describe what you want to make or what you need.")).not.toBeVisible();
    await expect(page.getByText("Paste the items you want to shop.")).not.toBeVisible();
    await expect(page.getByText("Inferred from your cart")).toBeVisible();
    await expect(page.getByText("Inferred from your meal")).not.toBeVisible();
    await expect(page.getByText("Here's what's included based on your request.")).not.toBeVisible();
    await expect(page.getByText("Active:")).not.toBeVisible();
    await expect(page.getByText("Live OpenAI inference is planned")).not.toBeVisible();
    await expect(page.getByLabel("Active cart")).toBeVisible();
    await expect(page.getByLabel("Compare cart options")).toBeVisible();
    await expect(page.getByText("Compare cart plans")).not.toBeVisible();
    await expect(page.getByText("Choose the cart tradeoff that fits this trip.")).not.toBeVisible();
    const budgetHelper = page.getByText("Budget is a soft target which informs recommendations", { exact: true });
    await expect(budgetHelper).toBeVisible();
    const budgetHelperContainer = page.getByTestId("budget-helper");
    const budgetHelperBox = await budgetHelperContainer.boundingBox();
    expect(budgetHelperBox).not.toBeNull();
    expect(budgetHelperBox?.height).toBeLessThanOrEqual(40);
    await expect(page.getByText("Budget is a soft target which informs our recommendations")).not.toBeVisible();
    await expect(page.getByText("Budget is a soft target which informs our recommendations.")).not.toBeVisible();
    await expect(page.getByText("Budget is a soft target. It informs our recommendations.")).not.toBeVisible();
    await expect(page.getByText("Budget is a soft target. We use it to explain cost tradeoffs and guide value-aware recommendations.")).not.toBeVisible();
    await expect(page.getByLabel("Top cart totals").getByText("Subtotal")).toBeVisible();
    await expect(page.getByLabel("Top cart totals").getByText("Est. Fees")).toBeVisible();
    await expect(page.getByLabel("Top cart totals").getByText("Est. Total")).toBeVisible();
    await expect(page.getByTestId("cart-total")).toHaveCount(1);
    await expect(page.getByText("Lowest cost option").first()).toBeVisible();
    await expect(page.getByText(/\+\$\d+\.\d{2} vs lowest cost/).first()).toBeVisible();
    await expect(page.getByText(/more than lowest cost option/)).not.toBeVisible();
    await expect(page.getByText("Lowest estimated total among the current comparable plans.")).not.toBeVisible();
    await expect(page.getByText("Grocery cost").first()).toBeVisible();
    await expect(page.getByText("Fees").first()).toBeVisible();
    await expect(page.getByText("Est. total").first()).toBeVisible();
    await expect(page.getByTestId("preference-icon-strategy")).toBeVisible();
    await expect(page.getByTestId("preference-icon-stores")).toBeVisible();
    await expect(page.getByTestId("preference-icon-fulfillment")).toBeVisible();
    await expect(page.getByTestId("preference-icon-organic")).toBeVisible();
    await expect(page.getByTestId("preference-icon-brands")).toBeVisible();
    await expect(page.getByTestId("preference-icon-budget")).toBeVisible();
    await expect(page.getByTestId("preference-icon-reset")).toBeVisible();
    await expect(page.getByTestId("preference-icon-info")).toBeVisible();
    await expect(page.locator("#preference-cart-strategy option[value='fewest_stores']")).toHaveAttribute(
      "disabled",
      "",
    );
    await expect(page.locator("#preference-cart-strategy option[value='preferred_brands']")).toHaveCount(0);

    if (viewport && viewport.width >= 1000) {
      const groceryInputBox = await page.locator("#grocery-input").boundingBox();
      const strategySelectBox = await page.locator("#preference-cart-strategy").boundingBox();
      const budgetInputBox = await page.locator("#preference-budget-target").boundingBox();
      const budgetHelperContainerBox = await budgetHelperContainer.boundingBox();

      expect(groceryInputBox).not.toBeNull();
      expect(strategySelectBox).not.toBeNull();
      expect(budgetInputBox).not.toBeNull();
      expect(budgetHelperContainerBox).not.toBeNull();
      await expect(budgetHelperContainer).toHaveCSS("white-space", "nowrap");
      expect(
        await budgetHelperContainer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);

      if (groceryInputBox && strategySelectBox && budgetInputBox && budgetHelperContainerBox) {
        expect(
          Math.abs(groceryInputBox.x + groceryInputBox.width - (strategySelectBox.x + strategySelectBox.width)),
        ).toBeLessThanOrEqual(4);
        expect(
          Math.abs(groceryInputBox.x + groceryInputBox.width - (budgetInputBox.x + budgetInputBox.width)),
        ).toBeLessThanOrEqual(4);
        expect(Math.abs(groceryInputBox.x - budgetHelperContainerBox.x)).toBeLessThanOrEqual(4);
        expect(
          Math.abs(groceryInputBox.x + groceryInputBox.width - (budgetHelperContainerBox.x + budgetHelperContainerBox.width)),
        ).toBeLessThanOrEqual(4);
        expect(strategySelectBox.width).toBeLessThanOrEqual(190);
        expect(budgetInputBox.width).toBeLessThanOrEqual(190);
      }
    }

    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active cart", exact: true })).not.toBeVisible();
    await expect(page.getByText("Recommended cart")).not.toBeVisible();

    const buildButtonColor = await page
      .getByRole("button", { name: "Build cart" })
      .evaluate((element) => window.getComputedStyle(element).backgroundColor);
    expect(["rgb(122, 31, 43)", "rgb(101, 25, 35)"]).toContain(buildButtonColor);

    const recommendedPlan = page.getByLabel("Compare cart options").locator("[data-testid^='cart-plan-']").first();
    const recommendedPlanBox = await recommendedPlan.boundingBox();
    const recommendedPlanTitle = recommendedPlan.getByRole("heading", { name: recommendedOptionHeading });
    const planTitleBox = await recommendedPlanTitle.boundingBox();
    const costPillBox = await recommendedPlan.getByText("Lowest cost option").boundingBox();
    const storePillBox = await recommendedPlan.getByText(/Buy at/).first().boundingBox();
    const groceryCostBox = await recommendedPlan.getByText("Grocery cost").boundingBox();
    const feesBox = await recommendedPlan.getByText("Fees").boundingBox();
    const estimateBox = await recommendedPlan.getByText("Est. total").boundingBox();

    await expect(page.getByTestId("cart-plan-recommended")).toHaveCount(0);
    await expect(page.getByTestId("cart-plan-fewest-stores")).toHaveCount(0);
    await expect(page.getByTestId("cart-plan-preferred-brands")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Fewest stores/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Preferred brands/ })).toHaveCount(0);
    await expect(recommendedPlanTitle).toBeVisible();
    expect(planTitleBox).not.toBeNull();
    expect(recommendedPlanBox).not.toBeNull();
    expect(costPillBox).not.toBeNull();
    expect(storePillBox).not.toBeNull();
    expect(groceryCostBox).not.toBeNull();
    expect(feesBox).not.toBeNull();
    expect(estimateBox).not.toBeNull();
    expect(await recommendedPlanTitle.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

    if (planTitleBox && costPillBox) {
      expect(costPillBox.y).toBeGreaterThan(planTitleBox.y + planTitleBox.height - 1);
    }

    if (planTitleBox && storePillBox) {
      expect(storePillBox.y).toBeGreaterThan(planTitleBox.y + planTitleBox.height - 1);
    }

    if (planTitleBox && recommendedPlanBox) {
      expect(planTitleBox.width).toBeLessThanOrEqual(recommendedPlanBox.width);
    }

    if (groceryCostBox && feesBox && estimateBox) {
      expect(Math.abs(groceryCostBox.y - feesBox.y)).toBeLessThan(4);
      expect(Math.abs(groceryCostBox.y - estimateBox.y)).toBeLessThan(4);
      expect(groceryCostBox.height).toBeLessThan(16);
      expect(feesBox.height).toBeLessThan(16);
      expect(estimateBox.height).toBeLessThan(16);
    }
    await expect(page.getByText(/Buy at/).first()).toBeVisible();
    const selectedBreakdown = page.getByTestId("selected-option-breakdown");
    await expect(selectedBreakdown).toBeVisible();
    await expect(selectedBreakdown.getByText("Selected option")).toBeVisible();
    await expect(selectedBreakdown.getByText("Why")).toBeVisible();
    await expect(selectedBreakdown.getByText("Tradeoffs")).toBeVisible();
    await expect(selectedBreakdown.getByText("All items available")).toBeVisible();
    await expect(recommendedPlan.getByText(/^\d+ stores?$/)).not.toBeVisible();
    await expect(recommendedPlan.getByText(/store-brand/)).not.toBeVisible();
    await expect(page.getByTestId("cart-plan-cheapest-one-store").getByRole("heading", { name: "Cheapest single-store" })).toBeVisible();
    await expect(page.getByTestId("cart-plan-cheapest-split").getByRole("heading", { name: recommendedOptionHeading })).toBeVisible();
    await expect(page.getByText(/Buy at .+ \+ .+/).first()).toBeVisible();

    const briefBox = await page.getByLabel("Shopping brief").boundingBox();
    const cartBox = await page.getByLabel("Active cart").boundingBox();
    const planBox = await page.getByLabel("Compare cart options").boundingBox();
    const briefHeadingBox = await page.getByRole("heading", { name: "What would you like to make?" }).boundingBox();
    const brandHeadingBox = await page.getByRole("heading", { name: "Gini, Your AI Grocery Shopper" }).boundingBox();
    const headerLogoBox = await headerLogo.boundingBox();
    const inferenceHeadingBox = await page.getByRole("heading", { name: "Inferred from your cart" }).boundingBox();
    const compareHeadingBox = await page.getByRole("heading", { name: "Compare cart options" }).boundingBox();
    const activeHeadingBox = await page.getByRole("heading", { name: recommendedActiveCartHeading }).boundingBox();
    const activePlanTitleBox = await page.getByTestId("active-cart-plan-title").boundingBox();
    const firstCartLineBox = await page.getByTestId("cart-line-item").first().boundingBox();
    const inferenceChipBox = await page.getByTestId("inference-visible-chips").boundingBox();
    const activeStatusBox = await page.getByLabel("Active cart").getByText("All items available").first().boundingBox();

    expect(briefBox).not.toBeNull();
    expect(cartBox).not.toBeNull();
    expect(planBox).not.toBeNull();
    expect(briefHeadingBox).not.toBeNull();
    expect(brandHeadingBox).not.toBeNull();
    expect(headerLogoBox).not.toBeNull();
    expect(inferenceHeadingBox).not.toBeNull();
    expect(compareHeadingBox).not.toBeNull();
    expect(activeHeadingBox).not.toBeNull();
    expect(activePlanTitleBox).not.toBeNull();
    expect(firstCartLineBox).not.toBeNull();
    expect(inferenceChipBox).not.toBeNull();
    expect(activeStatusBox).not.toBeNull();

    const inferenceLayout = await page.getByTestId("inference-visible-chips").evaluate((chipRegion) => {
      const section = chipRegion.closest("section");
      const helper = section?.querySelector("[data-testid='inference-helper-copy']");
      const chips = Array.from(chipRegion.querySelectorAll("[data-testid='inference-chip'], [data-testid='inference-more-button']"));
      const chipRegionRect = chipRegion.getBoundingClientRect();
      const helperRect = helper?.getBoundingClientRect();
      const sectionRect = section?.getBoundingClientRect();
      const chipRects = chips.map((chip) => chip.getBoundingClientRect());
      const visibleChipBottom = Math.max(...chipRects.map((rect) => rect.bottom));
      const tallestChip = Math.max(...chipRects.map((rect) => rect.height));
      const clippedChipCount = chipRects.filter(
        (rect) =>
          rect.top < chipRegionRect.top - 1 ||
          rect.bottom > chipRegionRect.bottom + 1 ||
          rect.left < chipRegionRect.left - 1 ||
          rect.right > chipRegionRect.right + 1,
      ).length;
      const chipFontSize = chips.length > 0 ? window.getComputedStyle(chips[0]).fontSize : "";
      const truncatedChipCount = chips.filter((chip) => chip.scrollWidth > chip.clientWidth + 1).length;

      return {
        chipFontSize,
        clippedChipCount,
        helperTop: helperRect?.top ?? 0,
        panelBottom: sectionRect?.bottom ?? 0,
        regionBottom: chipRegionRect.bottom,
        tallestChip,
        truncatedChipCount,
        visibleChipBottom,
      };
    });

    expect(inferenceLayout.clippedChipCount).toBe(0);
    expect(inferenceLayout.truncatedChipCount).toBe(0);
    expect(inferenceLayout.tallestChip).toBeLessThanOrEqual(19);
    expect(parseFloat(inferenceLayout.chipFontSize)).toBe(10);
    expect(inferenceLayout.visibleChipBottom).toBeLessThanOrEqual(inferenceLayout.helperTop - 4);
    expect(inferenceLayout.regionBottom).toBeLessThan(inferenceLayout.panelBottom);

    if (
      viewport &&
      viewport.width >= 1000 &&
      briefBox &&
      cartBox &&
      planBox &&
      briefHeadingBox &&
      inferenceHeadingBox &&
      compareHeadingBox &&
      activeHeadingBox &&
      activePlanTitleBox &&
      firstCartLineBox &&
      inferenceChipBox &&
      activeStatusBox
    ) {
      expect(briefBox.width).toBeGreaterThanOrEqual(400);
      if (brandHeadingBox && headerLogoBox) {
        expect(brandHeadingBox.x).toBeGreaterThanOrEqual(headerLogoBox.x + headerLogoBox.width + 4);
        expect(Math.abs((brandHeadingBox.y + brandHeadingBox.height / 2) - (headerLogoBox.y + headerLogoBox.height / 2))).toBeLessThanOrEqual(4);
        expect(headerLogoBox.width).toBeGreaterThanOrEqual(56);
        expect(headerLogoBox.width).toBeLessThanOrEqual(66);
      }
      expect(cartBox.x).toBeGreaterThan(briefBox.x);
      expect(planBox.x).toBeGreaterThan(cartBox.x);
      expect(Math.abs(briefHeadingBox.y - inferenceHeadingBox.y)).toBeLessThanOrEqual(4);
      expect(Math.abs(compareHeadingBox.y - inferenceHeadingBox.y)).toBeLessThanOrEqual(4);
      expect(Math.abs(activeHeadingBox.height - inferenceHeadingBox.height)).toBeLessThanOrEqual(4);
      expect(Math.abs(activePlanTitleBox.y + activePlanTitleBox.height - (activeHeadingBox.y + activeHeadingBox.height))).toBeLessThanOrEqual(6);
      expect(firstCartLineBox.y).toBeLessThan(430);
      expect(inferenceChipBox.height).toBeLessThanOrEqual(38);
      expect(activeStatusBox.height).toBeLessThanOrEqual(20);

      const activeTitleStyles = await page.getByTestId("active-cart-plan-title").evaluate((element) => {
        const activeTitle = element.closest("[data-testid='active-cart-title']");
        const activeTitleStyle = activeTitle ? window.getComputedStyle(activeTitle) : null;
        const planTitleStyle = window.getComputedStyle(element);

        return {
          activeFontSize: activeTitleStyle?.fontSize ?? "",
          planColor: planTitleStyle.color,
          planFontSize: planTitleStyle.fontSize,
        };
      });

      expect(activeTitleStyles.planColor).toBe("rgb(122, 31, 43)");
      expect(parseFloat(activeTitleStyles.planFontSize)).toBeLessThan(parseFloat(activeTitleStyles.activeFontSize));

      const compareScrollBehavior = await page.getByTestId("cart-options-column").evaluate((scroller) => {
        const panel = scroller.querySelector("[aria-label='Compare cart options']");
        if (!panel) {
          throw new Error("Expected compare cart options panel");
        }
        const before = panel.getBoundingClientRect().top;
        const overflowY = window.getComputedStyle(scroller).overflowY;
        const maxHeight = window.getComputedStyle(scroller).maxHeight;

        window.scrollBy(0, 180);

        return new Promise<{ after: number; before: number; maxHeight: string; overflowY: string; scrollHeight: number; clientHeight: number }>((resolve) => {
          window.requestAnimationFrame(() => {
            resolve({
              after: panel.getBoundingClientRect().top,
              before,
              clientHeight: scroller.clientHeight,
              maxHeight,
              overflowY,
              scrollHeight: scroller.scrollHeight,
            });
          });
        });
      });

      expect(compareScrollBehavior.after).toBeLessThan(compareScrollBehavior.before - 40);
      expect(compareScrollBehavior.overflowY).toBe("auto");
      expect(compareScrollBehavior.maxHeight).not.toBe("none");
      expect(compareScrollBehavior.clientHeight).toBeGreaterThan(900);
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    if (viewport && viewport.width < 1000 && briefBox && cartBox && planBox) {
      expect(cartBox.y).toBeGreaterThan(briefBox.y);
      expect(planBox.y).toBeGreaterThan(cartBox.y);
    }

    const addItemForm = page.getByLabel("Active cart").locator("form");
    const addItemInputBox = await addItemForm.locator("#add-cart-item").boundingBox();
    const addItemButtonBox = await addItemForm.getByRole("button", { name: "Add to cart" }).boundingBox();

    expect(addItemInputBox).not.toBeNull();
    expect(addItemButtonBox).not.toBeNull();

    if (viewport && viewport.width >= 640 && addItemInputBox && addItemButtonBox) {
      expect(Math.abs(addItemInputBox.y - addItemButtonBox.y)).toBeLessThanOrEqual(2);
      expect(addItemButtonBox.x).toBeGreaterThan(addItemInputBox.x);
      expect(addItemButtonBox.width).toBeLessThanOrEqual(110);
      expect(addItemInputBox.width).toBeGreaterThan(addItemButtonBox.width * 2.5);
      expect(Math.abs(addItemInputBox.height - addItemButtonBox.height)).toBeLessThanOrEqual(2);
      expect(
        await addItemForm.getByRole("button", { name: "Add to cart" }).evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
    }
  });

  test("uses semantic pill colors for cart options and active cart metadata", async ({ page }) => {
    await openApp(page);
    await page.locator("#preference-organic").selectOption("prefer");
    await buildCurrentCart(page);

    const getTone = async (locator: Locator) =>
      locator.evaluate((element) => element.getAttribute("data-tone"));
    const getBackgroundColor = async (locator: Locator) =>
      locator.evaluate((element) => window.getComputedStyle(element).backgroundColor);

    const recommendedPlan = page.getByLabel("Compare cart options").locator("[data-testid^='cart-plan-']").first();
    const lowestCostPill = recommendedPlan.getByText("Lowest cost option");
    const storePill = recommendedPlan.getByText(/Buy at/).first();
    const availablePill = recommendedPlan.getByText("All items available").first();
    const storeBrandPill = page.getByLabel("Active cart").getByText("Store brand", { exact: true }).first();
    const valuePill = page.getByLabel("Active cart").getByText("Value").first();

    await expect(lowestCostPill).toBeVisible();
    await expect(storePill).toBeVisible();
    await expect(availablePill).toBeVisible();
    await expect(storeBrandPill).toBeVisible();
    await expect(valuePill).toBeVisible();

    expect(await getTone(lowestCostPill)).toBe("positive");
    expect(await getBackgroundColor(lowestCostPill)).toBe("rgb(230, 243, 234)");
    expect(await getTone(availablePill)).toBe("positive");
    expect(await getBackgroundColor(availablePill)).toBe("rgb(230, 243, 234)");
    expect(await getTone(valuePill)).toBe("positive");
    expect(await getTone(storePill)).toBe("store");
    expect(await getBackgroundColor(storePill)).toBe("rgb(231, 240, 251)");
    expect(await getTone(storeBrandPill)).toBe("neutral");
    expect(await getBackgroundColor(storeBrandPill)).toBe("rgb(243, 231, 216)");

    await page.locator("#preference-budget-target").fill("1");
    const overBudgetPill = page.getByLabel("Compare cart options").getByText("Over budget").first();

    await expect(overBudgetPill).toBeVisible();
    expect(await getTone(overBudgetPill)).toBe("negative");
    expect(await getBackgroundColor(overBudgetPill)).toBe("rgb(247, 232, 231)");

    const tradeoffPill = page.getByTestId("selected-option-breakdown").getByText("Store brands").first();

    await expect(tradeoffPill).toBeVisible();
    expect(await getTone(tradeoffPill)).toBe("neutral");
    expect(await getBackgroundColor(tradeoffPill)).toBe("rgb(243, 231, 216)");
  });

  test("inferred chips navigate to cart lines and hidden items", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByTestId("inference-chip").filter({ hasText: "Romaine lettuce" }).click();
    await expect(page.getByRole("heading", { name: "Romaine Lettuce Hearts" })).toBeVisible();

    await page.getByTestId("inference-more-button").click({ force: true });
    await expect(page.getByTestId("inference-more-menu")).toBeVisible();
    await page.getByTestId("inference-hidden-chip").filter({ hasText: "White rice" }).click();
    await expect(page.getByTestId("inference-more-menu")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Long Grain White Rice" })).toBeVisible();
  });

  test("renders compact option summary copy for persisted carts with stale saved copy", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);
    await page.waitForFunction((storageKey) => window.localStorage.getItem(storageKey)?.includes("Lowest cost option"), builderStorageKey);

    await page.evaluate((storageKey) => {
      const savedState = window.localStorage.getItem(storageKey);

      if (!savedState) {
        throw new Error("Expected saved builder state");
      }

      const parsedState = JSON.parse(savedState);
      const mealCart = parsedState.results?.meal?.cart;

      if (mealCart) {
        delete mealCart.stores;
        mealCart.planOptions?.forEach((plan: { stores?: unknown }) => {
          delete plan.stores;
        });
      }

      window.localStorage.setItem(
        storageKey,
        JSON.stringify(parsedState)
          .replaceAll("Lowest cost option", "Lowest estimated total among the current comparable plans.")
          .replaceAll("more than lowest cost option", "more than the lowest estimated plan."),
      );
    }, builderStorageKey);
    await page.reload({
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText("Lowest cost option").first()).toBeVisible();
    await expect(page.getByText(/\+\$\d+\.\d{2} vs lowest cost/).first()).toBeVisible();
    await expect(page.getByText("Lowest estimated total among the current comparable plans.")).not.toBeVisible();
    await expect(page.getByText(/more than the lowest estimated plan/)).not.toBeVisible();
    await expect(page.getByText(/more than lowest cost option/)).not.toBeVisible();
  });

  test("normalizes retired fewest-store preferences from saved carts", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "milk, sandwich bread, bananas");
    await page.waitForFunction((storageKey) => window.localStorage.getItem(storageKey)?.includes("fewest-stores"), builderStorageKey);

    await page.evaluate((storageKey) => {
      const savedState = window.localStorage.getItem(storageKey);

      if (!savedState) {
        throw new Error("Expected saved builder state");
      }

      const parsedState = JSON.parse(savedState);
      const listCart = parsedState.results?.list?.cart;

      if (!listCart) {
        throw new Error("Expected saved list cart");
      }

      parsedState.preferences = {
        ...parsedState.preferences,
        optimizationGoal: "fewest_stores",
      };
      listCart.activePlanId = "fewest-stores";
      listCart.planOptions?.forEach((plan: { id: string; isRecommended?: boolean }) => {
        plan.isRecommended = plan.id === "fewest-stores";
      });

      window.localStorage.setItem(storageKey, JSON.stringify(parsedState));
    }, builderStorageKey);
    await page.reload({
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator("#preference-cart-strategy")).toHaveValue("cheapest");
    await expect(page.locator("#preference-cart-strategy option[value='fewest_stores']")).toHaveAttribute(
      "disabled",
      "",
    );
    await expect(page.getByTestId("cart-plan-fewest-stores")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Fewest stores/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(
      page.getByLabel("Compare cart options").locator("[data-testid^='cart-plan-']").first().getByRole("heading", {
        name: recommendedOptionHeading,
      }),
    ).toBeVisible();
  });

  test("normalizes retired preferred-brand preferences from saved carts", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "blue cheese");
    await page.waitForFunction(
      (storageKey) => window.localStorage.getItem(storageKey)?.includes("preferred-brands"),
      builderStorageKey,
    );

    await page.evaluate((storageKey) => {
      const savedState = window.localStorage.getItem(storageKey);

      if (!savedState) {
        throw new Error("Expected saved builder state");
      }

      const parsedState = JSON.parse(savedState);
      const listCart = parsedState.results?.list?.cart;

      if (!listCart) {
        throw new Error("Expected saved list cart");
      }

      parsedState.preferences = {
        ...parsedState.preferences,
        optimizationGoal: "preferred_brands",
      };
      listCart.activePlanId = "preferred-brands";
      listCart.planOptions?.forEach((plan: { id: string; isRecommended?: boolean }) => {
        plan.isRecommended = plan.id === "preferred-brands";
      });

      window.localStorage.setItem(storageKey, JSON.stringify(parsedState));
    }, builderStorageKey);
    await page.reload({
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator("#preference-cart-strategy")).toHaveValue("cheapest");
    await expect(page.locator("#preference-cart-strategy option[value='preferred_brands']")).toHaveCount(0);
    await expect(page.getByTestId("cart-plan-preferred-brands")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Preferred brands/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(
      page.getByLabel("Compare cart options").locator("[data-testid^='cart-plan-']").first().getByRole("heading", {
        name: recommendedOptionHeading,
      }),
    ).toBeVisible();
  });

  test("active cart totals and alternative cards stay functional after UX refinements", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    const topTotals = page.getByLabel("Top cart totals");
    await expect(topTotals.getByText("Subtotal")).toBeVisible();
    await expect(topTotals.getByText("Est. Fees")).toBeVisible();
    await expect(topTotals.getByText("Est. Total")).toBeVisible();
    await expect(page.getByTestId("cart-total")).toHaveCount(1);

    const alternativeCards = page.getByLabel("Active cart").locator("button").filter({ hasText: "Swap" });
    await expect(alternativeCards.first()).toBeVisible();
    await expect(page.getByTestId("selected-product-image").first()).toBeVisible();
    await expect(page.getByTestId("substitute-product-image").first()).toBeVisible();

    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 1000 && (await alternativeCards.count()) >= 2) {
      const firstBox = await alternativeCards.nth(0).boundingBox();
      const secondBox = await alternativeCards.nth(1).boundingBox();
      const selectedImageBox = await page.getByTestId("selected-product-image").first().boundingBox();
      const substituteImageBox = await page.getByTestId("substitute-product-image").first().boundingBox();

      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();
      expect(selectedImageBox).not.toBeNull();
      expect(substituteImageBox).not.toBeNull();

      if (firstBox && secondBox) {
        expect(Math.abs(firstBox.y - secondBox.y)).toBeLessThan(16);
        expect(firstBox.width).toBeLessThan(260);
      }

      if (selectedImageBox && substituteImageBox) {
        expect(substituteImageBox.width).toBeLessThan(selectedImageBox.width);
        expect(substituteImageBox.height).toBeLessThan(selectedImageBox.height);
      }
    }

    const totalBeforeAlternative = await page.getByTestId("cart-total").innerText();
    await alternativeCards.first().click();
    await expect(page.getByTestId("cart-total")).not.toHaveText(totalBeforeAlternative);
  });

  test("shows compact item reasoning without overwhelming the cart", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await expect(page.getByText("Package fit").first()).toBeVisible();
    await expect(page.getByText("Why?")).not.toBeVisible();
    await expect(page.getByText("Package covers the requested quantity.")).not.toBeVisible();
    await expect(page.getByText("Why this item was selected")).not.toBeVisible();
  });

  test("shows partial-match needs for review and lets the user remove them", async ({ page }) => {
    await openApp(page);

    await page.getByRole("button", { name: "Grocery list", exact: true }).click();
    await page.locator("#preference-organic").selectOption("required");
    await page.locator("#grocery-input").fill("shawarma seasoning");
    await buildCurrentCart(page);

    const reviewPanel = page.getByLabel("Needs review");
    await expect(reviewPanel).toBeVisible();
    await expect(reviewPanel.getByText("Shawarma seasoning")).toBeVisible();
    await expect(reviewPanel.getByText("Constraint")).toBeVisible();
    await expect(page.getByText("0 items")).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).click();

    await expect(page.getByText("I could not build a reliable cart yet")).toBeVisible();
  });

  test("builds a partial cart and surfaces out-of-stock items as needs review", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "milk, sumac");

    await expect(page.getByRole("heading", { name: "Whole Milk" })).toBeVisible();
    await expect(page.getByText("Review", { exact: true }).first()).toBeVisible();

    const reviewPanel = page.getByLabel("Needs review");
    await expect(reviewPanel).toBeVisible();
    await expect(reviewPanel.getByText("Sumac")).toBeVisible();
    await expect(reviewPanel.getByText("Out of stock")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId("inference-chip").filter({ hasText: "Sumac" }).click();
    await expect(reviewPanel).toBeVisible();
    const recommendedPlan = page.getByLabel("Compare cart options").locator("[data-testid^='cart-plan-']").first();

    await expect(recommendedPlan.getByText("Review")).toBeVisible();
    await expect(recommendedPlan.getByText("Missing 1")).toBeVisible();
    await expect(recommendedPlan.getByText("Est. total")).toBeVisible();

    await reviewPanel.getByRole("button", { name: "Remove" }).click();

    await expect(page.getByLabel("Needs review")).not.toBeVisible();
    await expect(page.getByLabel("Active cart").getByText("All items available")).toBeVisible();
  });

  test("switching cart options preserves unmatched review state", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "milk, sumac");

    await expect(page.getByLabel("Needs review").getByText("Sumac")).toBeVisible();
    await expect(page.getByTestId("cart-plan-best-value").getByText("Missing 1")).toBeVisible();

    await page.getByTestId("cart-plan-best-value").getByRole("button", { name: "Select" }).click();

    await expect(page.getByTestId("selected-option-breakdown").getByText("Best value")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active Cart Best Value" })).toBeVisible();
    await expect(page.getByLabel("Needs review").getByText("Sumac")).toBeVisible();
    await expect(page.getByText("Review", { exact: true }).first()).toBeVisible();
  });

  test("blocks an impossible cart and lets the user search manually", async ({ page }) => {
    await openApp(page);

    await page.getByRole("button", { name: "Grocery list", exact: true }).click();
    await page.locator("#grocery-input").fill("sumac");
    await buildCurrentCart(page);

    await expect(page.getByText("Blocked")).toBeVisible();
    await expect(page.getByLabel("Needs review").getByText("Sumac")).toBeVisible();

    await page.getByLabel("Needs review").getByRole("button", { name: "Search" }).click();

    await expect(page.locator("#add-cart-item")).toHaveValue("Sumac");
  });

  test("relaxes a hard constraint and rebuilds the cart", async ({ page }) => {
    await openApp(page);

    await page.getByRole("button", { name: "Grocery list", exact: true }).click();
    await page.locator("#preference-organic").selectOption("required");
    await page.locator("#grocery-input").fill("shawarma seasoning");
    await buildCurrentCart(page);

    await expect(page.getByText("Blocked")).toBeVisible();
    await expect(page.getByLabel("Needs review").getByText("Constraint")).toBeVisible();

    await page.getByLabel("Needs review").getByRole("button", { name: "Relax" }).click();

    await expect(page.getByRole("heading", { name: "Shawarma Seasoning Blend" })).toBeVisible();
    await expect(page.getByLabel("Active cart").getByText("All items available")).toBeVisible();
    await expect(page.locator("#preference-organic")).toHaveValue("prefer");
  });

  test("recovers from a max-store conflict by increasing stores", async ({ page }) => {
    await openApp(page);

    await page.getByRole("button", { name: "Grocery list", exact: true }).click();
    await page.locator("#preference-max-stores").fill("1");
    await page.locator("#grocery-input").fill("organic bacon, shawarma seasoning");
    await buildCurrentCart(page);

    await expect(page.getByText("Blocked")).toBeVisible();
    await expect(page.getByLabel("Needs review").getByText("Max stores").first()).toBeVisible();

    await page.getByLabel("Needs review").getByRole("button", { name: "More stores" }).first().click();

    await expect(page.locator("#preference-max-stores")).toHaveValue("2");
    await expect(page.getByRole("heading", { name: "Organic Uncured Bacon" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shawarma Seasoning Blend" })).toBeVisible();
  });

  test("reports fulfillment conflicts without substituting the wrong item", async ({ page }) => {
    await openApp(page);

    await page.getByRole("button", { name: "Grocery list", exact: true }).click();
    await page.locator("#preference-fulfillment").selectOption("delivery");
    await page.locator("#grocery-input").fill("fresh dill");
    await buildCurrentCart(page);

    await expect(page.getByText("Blocked")).toBeVisible();
    await expect(page.getByLabel("Needs review").getByText("Fresh dill")).toBeVisible();
    await expect(page.getByLabel("Needs review").getByText("Fulfillment")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fresh Dill" })).not.toBeVisible();
  });

  test("preserves separate meal and grocery list state", async ({ page }) => {
    await openApp(page);

    await buildCurrentCart(page);
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();

    await page.getByRole("button", { name: "Grocery list", exact: true }).click();
    await expect(page.getByText("Build your grocery cart, your way")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What's on your list?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Milk, eggs, bananas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Oat milk" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chicken, rice, peppers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chicken curry" })).not.toBeVisible();

    await page.getByRole("button", { name: "Milk, eggs, bananas" }).click();
    await expect(page.locator("#grocery-input")).toHaveValue("Milk, eggs, bananas");

    await page.getByRole("button", { name: "Meal idea" }).click();
    await expect(page.getByRole("button", { name: "Chicken curry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tacos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pasta dinner" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Milk, eggs, bananas" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Boneless Skinless Chicken Breast" })).toBeVisible();
  });

  test("keeps the current cart while edited shopping brief awaits rebuild without technical warning", async ({ page }) => {
    await openApp(page);

    await buildCurrentCart(page);
    await page.locator("#grocery-input").fill("milk, bread, bananas");

    await expect(page.getByText("The prompt has changed since this cart was built")).not.toBeVisible();
    await expect(page.getByText("Press Enter or Build cart to regenerate")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Boneless Skinless Chicken Breast" })).toBeVisible();
  });

  test("handles unknown add item with a helpful error", async ({ page }) => {
    await openApp(page);

    await buildCurrentCart(page);
    await page.locator("#add-cart-item").fill("moon milk");
    await page.getByRole("button", { name: "Add to cart" }).click();

    await expect(page.getByText("Choose one of the available mock catalog items below.")).toBeVisible();
  });

  test("grocery list understands dairy-free and organic constraints", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "dairy free milk");

    await expect(page.getByRole("heading", { name: "Oat Milk" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Whole Milk" })).not.toBeVisible();

    await page.locator("#grocery-input").fill("organic eggs");
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: "Organic Large Brown Eggs, 12 Count" })).toBeVisible();
  });

  test("meal idea understands dietary and price constraint language", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("dairy free pasta dinner");
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: "Pasta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Marinara Sauce" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Parmesan Cheese" })).not.toBeVisible();

    await page.locator("#grocery-input").fill("cheap tacos");
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: "Ground Beef" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flour Tortillas" })).toBeVisible();
  });

  test("add-item search respects constraints and avoids misleading constrained matches", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.locator("#add-cart-item").fill("dairy free milk");
    await expect(page.getByRole("option", { name: "Oat Milk", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Coconut Milk", exact: true })).toBeVisible();

    const startingTotal = await page.getByTestId("cart-total").innerText();
    await page.getByRole("option", { name: "Oat Milk", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();

    await expect(page.getByRole("heading", { name: "Oat Milk" })).toBeVisible();
    await expect(page.getByTestId("cart-total")).not.toHaveText(startingTotal);

    await page.locator("#add-cart-item").fill("organic moon milk");
    await page.getByRole("button", { name: "Add to cart" }).click();

    await expect(page.getByText("Choose one of the available mock catalog items below.")).toBeVisible();
  });

  test("semantic typo intent works across grocery list and add-item search", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "dary free milk");

    await expect(page.getByRole("heading", { name: "Oat Milk" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Whole Milk" })).not.toBeVisible();

    const startingTotal = await page.getByTestId("cart-total").innerText();
    await page.locator("#add-cart-item").fill("lactose free milk");
    await expect(page.getByRole("option", { name: "Oat Milk", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Coconut Milk", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "Coconut Milk", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();

    await expect(page.getByRole("heading", { name: "Coconut Milk" })).toBeVisible();
    await expect(page.getByTestId("cart-total")).not.toHaveText(startingTotal);
  });

  test("semantic typo intent works in meal idea search", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("dary free pasta dinner");
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: "Pasta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Marinara Sauce" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Parmesan Cheese" })).not.toBeVisible();
  });

  test("typo-tolerant constraints work beyond dairy-free wording", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("organik cobb salad");
    await buildCurrentCart(page);
    await expect(page.getByRole("heading", { name: "Organic Romaine Hearts" })).toBeVisible();

    await page.getByRole("button", { name: "Grocery list", exact: true }).click();
    await page.locator("#grocery-input").fill("budjet rice");
    await buildCurrentCart(page);
    await expect(page.getByRole("heading", { name: "White Rice" })).toBeVisible();

    await page.locator("#add-cart-item").fill("glutn free pasta");
    await expect(page.getByRole("option", { name: "Pasta", exact: true })).toBeVisible();
  });

  test("rebuilds the current cart when fulfillment preference changes", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "milk, sandwich bread, bananas");

    const pickupTotal = await page.getByTestId("cart-total").innerText();
    await page.locator("#preference-fulfillment").selectOption("delivery");

    await expect(page.getByTestId("cart-total")).not.toHaveText(pickupTotal);
    await expect(page.getByText("Estimated delivery total", { exact: true })).toBeVisible();
  });

  test("enforces max stores when the preference changes", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "milk, sandwich bread, bananas");

    await page.locator("#preference-max-stores").fill("1");

    await expect(page.getByTestId("metric-stores")).toContainText("1");
    await expect(page.getByText("Built a cheapest cart across 1 store")).toBeVisible();
  });

  test("organic required rebuilds to organic products when available", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "milk, eggs, bananas");

    await page.locator("#preference-organic").selectOption("required");

    await expect(page.getByRole("heading", { name: "Organic Whole Milk" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Organic Large Brown Eggs, 12 Count" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Organic Bananas" })).toBeVisible();
  });

  test("compares cart options and lets the user switch options", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "eggs");

    await page.locator("#preference-organic").selectOption("prefer");
    await expect(page.getByRole("heading", { name: "Compare cart options" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Compare cart plans" })).not.toBeVisible();
    await expect(page.getByTestId("cart-plan-recommended")).toHaveCount(0);
    await expect(page.getByTestId("cart-plan-fewest-stores")).toHaveCount(0);
    await expect(page.getByLabel("Compare cart options").locator("[data-testid^='cart-plan-']").first().getByRole("heading", { name: recommendedOptionHeading })).toBeVisible();
    await expect(page.getByTestId("cart-plan-best-value")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Large Eggs, 12 Count" })).toBeVisible();

    await page.getByTestId("cart-plan-best-value").getByRole("button", { name: "Select" }).click();

    await expect(page.getByTestId("selected-option-breakdown").getByText("Best value")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Organic Large Brown Eggs, 12 Count" })).toBeVisible();
    await expect(page.getByTestId("selected-option-breakdown").getByText("Best value")).toBeVisible();
  });

  test("cart plan picker changes the active cart, title, and total", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    const recommendedTotal = await page.getByTestId("cart-total").innerText();
    const activeCartShell = page.getByTestId("active-cart-transition-shell");
    const getActiveCartOpacity = async () =>
      activeCartShell.evaluate((element) => Number(window.getComputedStyle(element).opacity));

    await expect(page.getByTestId("cart-plan-cheapest-split")).toBeVisible();
    await expect(page.getByTestId("cart-plan-cheapest-split").getByRole("heading", { name: recommendedOptionHeading })).toBeVisible();
    await expect(page.getByText(/Buy at .+ \+ .+/).first()).toBeVisible();

    await page.getByTestId("cart-plan-cheapest-one-store").getByRole("button", { name: "Select" }).click();

    await expect(page.getByTestId("cart-loading-status")).toHaveCount(0);
    await expect(page.getByTestId("cart-build-loading-canvas")).not.toBeVisible();
    await expect(activeCartShell).toHaveAttribute("data-transitioning", "true");
    await expect(activeCartShell).toHaveAttribute("data-switch-phase", "out", { timeout: 1_000 });
    await expect(activeCartShell).toHaveCSS("transition-duration", /1s|1000ms/);
    await page.waitForTimeout(250);
    await expect(activeCartShell).toHaveAttribute("data-transitioning", "true");
    await expect(activeCartShell).toHaveAttribute("data-switch-phase", "out");
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    const fadeOutOpacity = await getActiveCartOpacity();
    expect(fadeOutOpacity).toBeGreaterThanOrEqual(0);
    expect(fadeOutOpacity).toBeLessThanOrEqual(1);
    await page.waitForTimeout(550);
    await expect(activeCartShell).toHaveAttribute("data-transitioning", "true");
    await expect(activeCartShell).toHaveAttribute("data-switch-phase", "in");
    await expect(page.getByRole("heading", { name: "Active Cart Cheapest Single-store" })).toBeVisible();
    const fadeInOpacity = await getActiveCartOpacity();
    expect(fadeInOpacity).toBeGreaterThanOrEqual(0);
    expect(fadeInOpacity).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("selected-option-breakdown").getByText("Cheapest single-store")).toBeVisible();
    await expect(activeCartShell).toHaveAttribute("data-transitioning", "false", {
      timeout: 3_000,
    });
    await expect(activeCartShell).toHaveCSS("opacity", "1");
    await expect(page.getByRole("heading", { name: "Active Cart Cheapest Single-store" })).toBeVisible();
    await expect(page.getByTestId("cart-total")).not.toHaveText(recommendedTotal);

    const oneStoreTotal = await page.getByTestId("cart-total").innerText();
    await page.getByLabel("Compare cart options").locator("[data-testid^='cart-plan-']").first().getByRole("button", { name: "Select" }).click();

    await expect(page.getByTestId("cart-loading-status")).toHaveCount(0);
    await expect(activeCartShell).toHaveAttribute("data-transitioning", "true");
    await expect(activeCartShell).toHaveAttribute("data-switch-phase", "out", { timeout: 1_000 });
    await page.waitForTimeout(250);
    await expect(activeCartShell).toHaveAttribute("data-transitioning", "true");
    await expect(activeCartShell).toHaveAttribute("data-switch-phase", "out");
    await expect(page.getByRole("heading", { name: "Active Cart Cheapest Single-store" })).toBeVisible();
    const secondFadeOutOpacity = await getActiveCartOpacity();
    expect(secondFadeOutOpacity).toBeGreaterThanOrEqual(0);
    expect(secondFadeOutOpacity).toBeLessThanOrEqual(1);
    await page.waitForTimeout(550);
    await expect(activeCartShell).toHaveAttribute("data-transitioning", "true");
    await expect(activeCartShell).toHaveAttribute("data-switch-phase", "in");
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    const secondFadeInOpacity = await getActiveCartOpacity();
    expect(secondFadeInOpacity).toBeGreaterThanOrEqual(0);
    expect(secondFadeInOpacity).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("selected-option-breakdown").getByText(/\(Recommended\)$/)).toBeVisible();
    await expect(activeCartShell).toHaveAttribute("data-transitioning", "false", {
      timeout: 3_000,
    });
    await expect(activeCartShell).toHaveCSS("opacity", "1");
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByTestId("cart-total")).not.toHaveText(oneStoreTotal);
  });

  test("keeps brand flexibility available without exposing the retired preferred-brand strategy", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "blue cheese");

    await expect(page.getByRole("heading", { name: "Blue Cheese Crumbles" })).toBeVisible();
    await expect(page.locator("#preference-cart-strategy option[value='preferred_brands']")).toHaveCount(0);
    await page.locator("#preference-brands").selectOption("strict");

    await expect(page.locator("#preference-brands")).toHaveValue("strict");
    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByTestId("cart-plan-preferred-brands")).toHaveCount(0);
  });

  test("Phase 3.5 add-item search finds breakfast protein suggestions", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.locator("#add-cart-item").fill("breakfast protein");

    const addItemSuggestions = page.getByLabel("Active cart");
    await expect(addItemSuggestions.getByRole("option", { name: "Eggs", exact: true })).toBeVisible();
    await expect(addItemSuggestions.getByRole("option", { name: "Plain Yogurt", exact: true })).toBeVisible();
    await expect(addItemSuggestions.getByRole("option", { name: "Turkey Sausage", exact: true })).toBeVisible();
  });

  test("Phase 3.5 add-item search finds plant-based milk", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.locator("#add-cart-item").fill("plant based milk");

    await expect(page.getByRole("option", { name: "Oat Milk", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Almond Milk", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Coconut Milk", exact: true })).toBeVisible();
  });

  test("Phase 3.5 add-item search finds hydrating fruit", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.locator("#add-cart-item").fill("hydrating fruit");

    await expect(page.getByRole("option", { name: "Watermelon", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Oranges", exact: true })).toBeVisible();
  });

  test("Phase 3.5 add-item search finds sandwich ingredients", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.locator("#add-cart-item").fill("sandwich stuff");

    await expect(page.getByRole("option", { name: "Sandwich Bread", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Deli Turkey", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Sliced Cheese", exact: true })).toBeVisible();
  });

  test("Phase 3.5 add-item search finds kid snacks", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.locator("#add-cart-item").fill("snacks for kids");

    await expect(page.getByRole("option", { name: "Apples", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "String Cheese", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Crackers", exact: true })).toBeVisible();
  });

  test("Phase 3.5 grocery list builds plant-based milk", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "plant based milk");

    await expect(page.getByRole("heading", { name: "Original Oat Milk" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Whole Milk" })).not.toBeVisible();
  });

  test("Phase 3.5 grocery list builds a breakfast protein", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "breakfast protein");

    await expect(page.getByRole("heading", { name: "Turkey Sausage Links" })).toBeVisible();
  });

  test("Phase 3.5 grocery list builds hydrating fruit", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "hydrating fruit");

    await expect(page.getByRole("heading", { name: "Seedless Watermelon" })).toBeVisible();
  });

  test("Phase 3.5 grocery list builds sandwich ingredients", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "sandwich stuff");

    await expect(page.getByRole("heading", { name: "Sandwich Bread" })).toBeVisible();
  });

  test("Phase 3.5 grocery list builds kid snacks", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "snacks for kids");

    await expect(page.getByRole("heading", { name: "Gala Apples" })).toBeVisible();
  });

  test("Phase 3.5 add-item typo search finds almond milk", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.locator("#add-cart-item").fill("almnd milk");

    await expect(page.getByRole("option", { name: "Almond Milk", exact: true })).toBeVisible();
  });

  test("Phase 3.5 add-item typo search finds crackers", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.locator("#add-cart-item").fill("crakcers");

    await expect(page.getByRole("option", { name: "Crackers", exact: true })).toBeVisible();
  });

  test("Phase 3.5 unsupported semantic add-item query stays empty", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    await page.locator("#add-cart-item").fill("interstellar kids snack");

    await expect(page.getByText("No matches")).toBeVisible();
  });

  test("Phase 3.5 preserves Cobb salad meal inference", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("cobb salad");
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: "Romaine Lettuce Hearts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Boneless Skinless Chicken Breast" })).toBeVisible();
  });

  test("Phase 3.5 preserves typo meal inference", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("shwarma");
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: "Ground Lamb" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pita Bread, 6 Count" })).toBeVisible();
  });

  test("Phase 3.5 preserves dairy-free grocery-list behavior", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "dary free milk");

    await expect(page.getByRole("heading", { name: "Oat Milk" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Whole Milk" })).not.toBeVisible();
  });

  test("Phase 3.5 adds semantic items without breaking cart editing", async ({ page }) => {
    await openApp(page);
    await buildCurrentCart(page);

    const startingTotal = await page.getByTestId("cart-total").innerText();
    await page.locator("#add-cart-item").fill("plant based milk");
    await page.getByRole("option", { name: "Almond Milk", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();

    await expect(page.getByRole("heading", { name: "Unsweetened Almond Milk" })).toBeVisible();
    await expect(page.getByTestId("cart-total")).not.toHaveText(startingTotal);
  });

  test("Phase 3.5 grocery list honors organic semantic products", async ({ page }) => {
    await openApp(page);
    await buildListCart(page, "organic strawberries");

    await expect(page.getByRole("heading", { name: "Organic Strawberries, 1 lb" })).toBeVisible();
  });

  test("catalog table is readable and downloadable", async ({ page }) => {
    await page.goto("/catalog", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.getByRole("heading", { name: "Mock catalog" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Offers" })).toBeVisible();
    await expect(page.getByRole("img", { name: "oat milk product image" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "Original Oat Milk" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Products CSV" })).toHaveAttribute("href", "/catalog/products.csv");
    await expect(page.getByRole("link", { name: "Offers CSV" })).toHaveAttribute("href", "/catalog/offers.csv");

    const productsCsv = await page.request.get("/catalog/products.csv");
    const offersCsv = await page.request.get("/catalog/offers.csv");
    const productsCsvText = await productsCsv.text();
    const offersCsvText = await offersCsv.text();

    expect(productsCsv.ok()).toBe(true);
    expect(productsCsvText).toContain("imageSrc,imageAlt");
    expect(productsCsvText).toContain("oat-milk,oat milk,dairy");
    expect(offersCsv.ok()).toBe(true);
    expect(offersCsvText).toContain("imageSrc,imageAlt");
    expect(offersCsvText).toContain("wm-almond-milk,almond-milk,almond milk");
  });

  test("composes multiple meal ideas into one cart without changing item labels", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("chicken curry and shawarma");
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Boneless Chicken Thighs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Red Curry Paste" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ground Lamb" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shawarma Seasoning Blend" })).toBeVisible();
    await expect(page.getByText(/used by/)).not.toBeVisible();
  });

  test("composes a meal and grocery shorthand into one cart", async ({ page }) => {
    await openApp(page);

    await page.locator("#grocery-input").fill("salmon dinner, turkey");
    await buildCurrentCart(page);

    await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Atlantic Salmon Fillet" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Deli Turkey Slices" })).toBeVisible();
    await expect(page.getByText(/used by/)).not.toBeVisible();
  });

  for (const [mealInput, expectedHeading] of [
    ["turkey breakfast plate", "Turkey Sausage Links"],
    ["turkey sandwich lunch", "Deli Turkey Slices"],
    ["tuna salad sandwich", "Chunk Light Tuna"],
    ["salmon rice dinner", "Atlantic Salmon Fillet"],
    ["shrimp stir fry", "Raw Shrimp"],
    ["tofu veggie stir fry", "Extra Firm Tofu"],
    ["hummus snack plate", "Classic Hummus"],
    ["kids lunch box", "Mozzarella String Cheese"],
    ["oatmeal breakfast", "Old Fashioned Oats"],
    ["black bean taco bowl", "Black Beans"],
  ]) {
    test(`expanded meal profile builds a cart: ${mealInput}`, async ({ page }) => {
      await openApp(page);

      await page.locator("#grocery-input").fill(mealInput);
      await buildCurrentCart(page);

      await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
      await expect(page.getByRole("heading", { name: expectedHeading })).toBeVisible();
      await expect(page.getByText("I could not build a reliable cart yet")).not.toBeVisible();
    });
  }
});

async function openApp(page: Page) {
  await page.goto("/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, builderStorageKey);
  await page.reload({
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Gini, Your AI Grocery Shopper" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Build cart" })).toBeEnabled({
    timeout: 15_000,
  });
}

async function buildCurrentCart(page: Page) {
  const buildButton = page.getByRole("button", { name: "Build cart" });

  await expect(buildButton).toBeEnabled();
  await buildButton.click();
  await expect(page.getByTestId("cart-loading-status")).toHaveCount(0);

  try {
    await expect(page.getByTestId("cart-build-loading-canvas")).toContainText("Building cart", {
      timeout: 1_000,
    });
    await expect(page.getByTestId("cart-build-loading-canvas")).toBeHidden({
      timeout: 20_000,
    });
  } catch {
    await expect(buildButton).toBeEnabled({
      timeout: 20_000,
    });
  }
}

async function buildListCart(page: Page, list: string) {
  await page.getByRole("button", { name: "Grocery list", exact: true }).click();
  await page.locator("#grocery-input").fill(list);
  await buildCurrentCart(page);
  await expect(page.getByRole("heading", { name: recommendedActiveCartHeading })).toBeVisible();
}

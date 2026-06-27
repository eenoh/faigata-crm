import { expect, test } from "@playwright/test";

test.describe("recruiter-facing smoke checks", () => {
  test("homepage renders the core product pitch", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: "Faigata" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Run your Instagram setter pipeline, booked consults, and coaching sales in one place.",
      ),
    ).toBeVisible();

    const cta = page.getByRole("link", { name: "Open sales workspace" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/crm");
  });

  test("login page renders the expected auth form", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back to Faigata" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Business email" })).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Log in to your CRM" }),
    ).toBeVisible();
  });

  test("register page renders the expected onboarding form", async ({ page }) => {
    await page.goto("/register");

    await expect(page).toHaveURL(/\/register$/);
    await expect(
      page.getByRole("heading", { name: "Create your Faigata account" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "First name" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Last name" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Business email" })).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create your coaching account" }),
    ).toBeVisible();
  });

  test("logged-out users are redirected away from crm", async ({ page }) => {
    await page.goto("/crm");

    await expect(page).toHaveURL(/\/login\?next=%2Fcrm$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back to Faigata" }),
    ).toBeVisible();
  });

  test("logged-out users are redirected away from billing", async ({ page }) => {
    await page.goto("/billing");

    await expect(page).toHaveURL(/\/login\?next=%2Fbilling$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back to Faigata" }),
    ).toBeVisible();
  });
});

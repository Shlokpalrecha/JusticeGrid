import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email = "admin@justicegrid.test", password = "Admin@12345") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
}
async function openCase(page: Page, ref: string) {
  await page.getByRole("link", { name: "Cases", exact: true }).click();
  await page.getByPlaceholder("Search case ref or court...").fill(ref);
  await page.getByRole("link", { name: ref, exact: true }).click();
  await expect(page.getByRole("heading", { name: ref, exact: true })).toBeVisible();
}
test("protected lanes, filters and the replacement navigation", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Priority Queue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Action review queue" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Urgent referrals — response needed" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Critical legal / court actions" })).toBeVisible();
  await expect(page.getByRole("link", { name: "JG-2026-0001", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "JG-2026-0002", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/action-queue.png", fullPage: false });
  await page.getByLabel("Filter urgency").selectOption("U3");
  await expect(
    page
      .locator("main span")
      .filter({ hasText: /^U3 · Scheduled\/routine$/ })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Rules Admin/ })).toHaveCount(0);
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
});
test("referral acknowledgement keeps work open and can be corrected", async ({ page }) => {
  await login(page);
  await openCase(page, "JG-2026-0001");
  await page.getByRole("button", { name: "Workflow", exact: true }).click();
  await page
    .getByText("A01 · MEDICAL: record referral and response · OPEN", { exact: true })
    .click();
  await page
    .locator("details[open]")
    .getByLabel("Evidence / reason", { exact: true })
    .fill("Synthetic browser verification: response recorded");
  const next = new Date(Date.now() + 3600000 + 19800000).toISOString().slice(0, 16);
  await page
    .locator("details[open]")
    .getByLabel("Next review (India time)", { exact: true })
    .fill(next);
  await page
    .locator("details[open]")
    .getByRole("button", { name: "Record status", exact: true })
    .click();
  await expect(
    page.getByText("A01 · MEDICAL: record referral and response · ACKNOWLEDGED", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("A01 · MEDICAL: record referral and response · ACKNOWLEDGED", { exact: true })
    .click();
  await page
    .locator("details[open]")
    .getByLabel("Action status", { exact: true })
    .selectOption("OPEN");
  await page
    .locator("details[open]")
    .getByLabel("Evidence / reason", { exact: true })
    .fill("Synthetic verification complete: restore awaiting-response example");
  await page
    .locator("details[open]")
    .getByRole("button", { name: "Record status", exact: true })
    .click();
  await expect(
    page.getByText("A01 · MEDICAL: record referral and response · OPEN", { exact: true }),
  ).toBeVisible();
});
test("an additional action is saved, acknowledged and resolved with evidence", async ({ page }) => {
  await login(page);
  await openCase(page, "JG-2026-0005");
  await page.getByRole("button", { name: "Workflow", exact: true }).click();
  await page.getByRole("button", { name: "Record additional action", exact: true }).click();
  const title = "Synthetic browser lifecycle " + Date.now();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Source section or paragraph", { exact: true })
    .fill("Team validation target");
  await page
    .getByLabel("Evidence", { exact: true })
    .fill("Synthetic browser test; no legal conclusion");
  await page
    .getByLabel("Responsible owner", { exact: true })
    .selectOption({ label: "Coordinator (Demo)" });
  await page.getByRole("button", { name: "Create action", exact: true }).click();
  await expect(page.getByText(`A16 · ${title} · OPEN`, { exact: true })).toBeVisible();
  await page.getByText(`A16 · ${title} · OPEN`, { exact: true }).click();
  await page
    .locator("details[open]")
    .getByLabel("Evidence / reason", { exact: true })
    .fill("Synthetic acknowledgement");
  await page
    .locator("details[open]")
    .getByRole("button", { name: "Record status", exact: true })
    .click();
  await expect(page.getByText(`A16 · ${title} · ACKNOWLEDGED`, { exact: true })).toBeVisible();
  await page
    .locator("details[open]")
    .getByLabel("Action status", { exact: true })
    .selectOption("RESOLVED");
  await page
    .locator("details[open]")
    .getByLabel("Evidence / reason", { exact: true })
    .fill("Synthetic browser workflow completed");
  await page
    .locator("details[open]")
    .getByRole("button", { name: "Record status", exact: true })
    .click();
  await expect(page.getByText(`A16 · ${title} · RESOLVED`, { exact: true })).toBeVisible();
});
test("a policy preview authorizes only the simulated candidate", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Queue policy", exact: true }).click();
  await page.getByLabel("Policy change reason").fill("Synthetic preview; do not publish");
  const publish = page.getByRole("button", {
    name: "Publish complete policy snapshot",
    exact: true,
  });
  await expect(publish).toBeDisabled();
  await page.getByRole("button", { name: "Simulate all cases", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Simulation result" })).toBeVisible();
  await expect(publish).toBeEnabled();
  await page.getByLabel("Immediate Hours", { exact: true }).fill("25");
  await expect(publish).toBeDisabled();
});
test("auditors can inspect evidence and policy without mutation controls", async ({ page }) => {
  await login(page, "auditor@justicegrid.test", "Auditor@12345");
  await openCase(page, "JG-2026-0001");
  await page.getByRole("button", { name: "Workflow", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workflow evidence" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record additional action", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save evidence and update queue", exact: true }),
  ).toHaveCount(0);
  await page.goto("/queue-policy");
  await expect(page.getByRole("heading", { name: "Queue policy and sources" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish complete policy snapshot", exact: true }),
  ).toHaveCount(0);
});

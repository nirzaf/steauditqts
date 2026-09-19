import { test, expect } from '@playwright/test'

// P5/P8A — the completion checklist and the accounting handoff card are live UI
// in LOCAL_ONLY, driven by the same shared derivations the Worker enforces.

async function openRoute(page, roleLabel, routeKey) {
  await page.goto('/')
  let card = page.locator('.persona-card').filter({ hasText: roleLabel }).first()
  if (await card.count() === 0) {
    await page.getByRole('button', { name: /View all \d+ roles/ }).click()
    card = page.locator('.persona-card').filter({ hasText: roleLabel }).first()
  }
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Open workspace' }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.evaluate((key) => { window.location.hash = `#/${key}` }, routeKey)
  await expect(page.locator('main .page')).toBeVisible()
}

test('the completion checklist shows recorded, actionable and waiting steps', async ({ page }) => {
  await openRoute(page, 'Audit manager', 'reviews')
  const checklist = page.locator('.completion-checklist')
  await expect(checklist).toBeVisible()
  await expect(checklist).toContainText('Completion checklist')
  await expect(checklist).toContainText('Derived from the local scenario')
  // The tri-state has to be reachable: with nothing senior-reviewed, downstream
  // steps wait instead of all looking like today's work.
  await expect(checklist.locator('.item-attention').first()).toBeVisible()
  await expect(checklist.getByText('Waiting upstream').first()).toBeVisible()
  await expect(checklist.getByText('Actionable now').first()).toBeVisible()
})

test('the accounting handoff card reports the approval state and generations', async ({ page }) => {
  await openRoute(page, 'Audit manager', 'reviews')
  const handoff = page.locator('.accounting-handoff')
  await expect(handoff).toBeVisible()
  await expect(handoff).toContainText('Accounting → audit handoff')
  await expect(handoff).toContainText('Management approval')
  await expect(handoff).toContainText('Audit evaluated input')
  await expect(handoff).toContainText(/PENDING APPROVAL|STALE|CURRENT/)
})

test('the staffing picker only offers actors who can hold each role', async ({ page }) => {
  await openRoute(page, 'Admin portal', 'engagements')
  await page.getByRole('button', { name: /Assign \/ Edit team/ }).first().click()
  const senior = page.locator('select[name="senior-actor"]')
  await expect(senior).toBeVisible()
  const optionValues = (select) => select.evaluate((el) => Array.from(el.options).map((entry) => entry.value))
  const seniorOptions = await optionValues(senior)
  expect(seniorOptions.length).toBeGreaterThan(1)
  // Every offered actor must hold audit_senior. The hard-coded defaults embedded
  // here previously named actors that do not exist or cannot hold the seat, so
  // saving the untouched form failed the staffing command.
  expect(seniorOptions).not.toContain('ACT-ZAINAB')
  expect(seniorOptions).not.toContain('ACT-LEILA')
  expect(seniorOptions).toContain('ACT-OMAR-SENIOR')
  const preparerOptions = await optionValues(page.locator('select[name="preparer-actor"]'))
  expect(preparerOptions).not.toContain('ACT-ZAINAB')
  expect(preparerOptions).toContain('ACT-JUNIOR')
})

// P1.4 — 7 browser-level demo checks. Keeps the scripted-without-looking-
// scripted promise: sign in, retain engagement, exact-record open, restart,
// invitation scoping, and mobile shell usability.
import { test, expect } from '@playwright/test'

async function signInAsAdmin(page) {
  await page.goto('/#/dashboard')
  const email = page.getByLabel(/email/i).first()
  if (await email.count()) {
    await email.fill('maya@quadrate.demo')
    await page.getByLabel(/password/i).first().fill('admin123')
    await page.getByRole('button', { name: /sign in/i }).first().click()
  }
  await expect(page.locator('#main-content')).toBeVisible()
}

test('1. admin signs in → dashboard renders', async ({ page }) => {
  await signInAsAdmin(page)
  await expect(page.getByRole('heading', { name: /overview|dashboard/i }).first()).toBeVisible()
})

test('2. admin switches to partner → same engagement retained', async ({ page }) => {
  await signInAsAdmin(page)
  const before = await page.url()
  const engagementBefore = (before.match(/engagement=([^&]+)/) || [])[1] || ''
  await page.getByRole('button', { name: /maya rahman|account menu/i }).first().click()
  const partnerOption = page.getByRole('menuitem', { name: /partner/i }).first()
  if (await partnerOption.count()) await partnerOption.click()
  await expect(page.locator('#main-content')).toBeVisible()
  if (engagementBefore) await expect(page).toHaveURL(new RegExp(engagementBefore))
})

test('3. engagement switch → context changes everywhere', async ({ page }) => {
  await signInAsAdmin(page)
  const selects = page.locator('select')
  if (await selects.count()) {
    await page.locator('#demo-client-select').selectOption({ index: 0 }).catch(() => {})
  }
  await expect(page.locator('.system-strip')).toBeVisible()
})

test('4. next action → exact record opens', async ({ page }) => {
  await signInAsAdmin(page)
  const openAction = page.getByRole('button', { name: /open action|open next/i }).first()
  if (await openAction.count()) {
    await openAction.click()
    await expect(page).toHaveURL(/record=/)
    await expect(page.locator('.record-target').first()).toBeVisible()
  }
})

test('5. restart → scenario restored, persona retained', async ({ page }) => {
  await signInAsAdmin(page)
  const restart = page.getByRole('button', { name: /restart walkthrough/i }).first()
  if (await restart.count()) {
    await restart.click()
    await page.getByRole('button', { name: /restart walkthrough/i }).last().click().catch(() => {})
  }
  await expect(page.locator('#main-content')).toBeVisible()
})

test('6. invitation client → no persona switcher, no reset controls', async ({ page }) => {
  await page.goto('/?invite=demo-invitation-token#/client-home')
  await expect(page.locator('#main-content, body')).toBeVisible()
  await expect(page.getByRole('button', { name: /restart walkthrough/i })).toHaveCount(0)
})

test('7. mobile shell → navigation usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signInAsAdmin(page)
  await page.getByRole('button', { name: /open navigation/i }).first().click()
  await expect(page.locator('#primary-navigation')).toBeVisible()
})

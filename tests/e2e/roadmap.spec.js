import { test, expect } from '@playwright/test'

async function openRole(page, roleLabel) {
  await page.goto('/')
  const card = page.locator('.persona-card').filter({ hasText: roleLabel }).first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Open workspace' }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
}

test('admin opens a populated overview', async ({ page }) => {
  await openRole(page, 'Admin portal')
  await expect(page.locator('main')).toContainText('See the whole engagement at a glance')
  await expect(page.locator('.demo-navigator')).toBeVisible()
})

test('presenter role switch keeps the selected engagement', async ({ page }) => {
  await openRole(page, 'Admin portal')
  const contextId = await page.locator('.demo-nav-context-id').innerText()
  await page.getByRole('button', { name: 'Open account menu' }).click()
  await page.getByRole('menuitem', { name: 'Audit partner / signatory' }).click()
  await expect(page.locator('.top-user')).toContainText('Audit partner / signatory')
  await expect(page.locator('.demo-nav-context-id')).toHaveText(contextId)
})

test('switching client context updates the shell', async ({ page }) => {
  await openRole(page, 'Admin portal')
  await page.locator('#demo-client-select').selectOption('CLI-0009')
  await expect(page.locator('.demo-nav-context-id')).toHaveText('ENG-0009-ACC-2026')
})

test('next action opens an exact target route', async ({ page }) => {
  await openRole(page, 'Admin portal')
  await page.locator('.demo-nav-next .demo-nav-action').click()
  await expect(page).toHaveURL(/#\/clients\?[^#]*record=G1/)
  await expect(page.locator('main')).toContainText('Clients & acceptance')
})

test('restart restores the walkthrough without signing out', async ({ page }) => {
  await openRole(page, 'Admin portal')
  await page.getByRole('button', { name: 'Restart walkthrough' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Restore the starting workflow?' })).toBeVisible()
  await page.getByRole('button', { name: /Restart walkthrough/ }).last().click()
  await expect(page.locator('.top-user')).toContainText('Admin portal')
})

test('client invitation does not expose presenter controls', async ({ page }) => {
  await page.goto('/?invite=playwright-fixture')
  await page.locator('.persona-card').filter({ hasText: 'Client portal' }).getByRole('button', { name: 'Open workspace' }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await expect(page.getByText('Presentation mode')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Restart walkthrough' })).toHaveCount(0)
})

test('mobile shell has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openRole(page, 'Admin portal')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(overflow).toBe(false)
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
})

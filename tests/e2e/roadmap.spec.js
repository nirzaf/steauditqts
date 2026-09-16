import { test, expect } from '@playwright/test'

async function openRole(page, roleLabel) {
  await page.goto('/')
  let card = page.locator('.persona-card').filter({ hasText: roleLabel }).first()
  if (await card.count() === 0) {
    await page.getByRole('button', { name: /View all \d+ roles/ }).click()
    card = page.locator('.persona-card').filter({ hasText: roleLabel }).first()
  }
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Open workspace' }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
}

test('admin opens a populated overview', async ({ page }) => {
  await openRole(page, 'Admin portal')
  await expect(page.locator('main')).toContainText('See the whole engagement at a glance')
  await expect(page.locator('.demo-navigator')).toBeVisible()
})

test('landing page starts with recommended roles and can reveal the full directory', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.persona-card')).toHaveCount(3)
  await expect(page.locator('.persona-card').filter({ hasText: 'Audit manager' })).toHaveCount(0)
  await page.getByRole('button', { name: /View all 14 roles/ }).click()
  await expect(page.locator('.persona-card')).toHaveCount(14)
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

test('context details keep advanced controls discoverable without crowding the shell', async ({ page }) => {
  await openRole(page, 'Admin portal')
  const details = page.locator('.demo-nav-details')
  await expect(details).toBeVisible()
  await details.locator('summary').click()
  await expect(page.locator('#demo-persona-select')).toBeVisible()
  await details.locator('summary').click()
  await expect(page.locator('#demo-persona-select')).toBeHidden()
})

test('reference routes stay behind More workspace', async ({ page }) => {
  await openRole(page, 'Admin portal')
  await expect(page.getByRole('button', { name: 'Pipeline visualizer' })).toHaveCount(0)
  const more = page.locator('.more-workspace-nav')
  await expect(more).toBeVisible()
  await more.locator('summary').click()
  await expect(page.getByRole('button', { name: 'Pipeline visualizer' })).toBeVisible()
})

test('tablet shell contains navigation without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await openRole(page, 'Admin portal')
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth > window.innerWidth + 1,
    shell: document.querySelector('.app-shell')?.scrollWidth > document.querySelector('.app-shell')?.clientWidth + 1,
    navigator: document.querySelector('.demo-navigator')?.scrollWidth > document.querySelector('.demo-navigator')?.clientWidth + 1,
  }))
  expect(overflow.document).toBe(false)
  expect(overflow.shell).toBe(false)
  expect(overflow.navigator).toBe(false)
  await expect(page.locator('.demo-nav-next')).toBeVisible()
})

test('registered workspace routes render without clipped content', async ({ page }) => {
  await openRole(page, 'Admin portal')
  const routeKeys = [
    'dashboard', 'portfolio', 'clients', 'engagements', 'pbc', 'accounting', 'audit', 'reviews',
    'release', 'integration', 'architecture', 'blueprint', 'cycle', 'pipeline', 'shared-demo',
    'artifacts', 'readiness', 'client-home', 'client-details', 'client-communications',
    'accountant-home', 'accountant-client', 'client-architecture', 'accountant-architecture', 'admin-console',
  ]
  for (const routeKey of routeKeys) {
    await page.evaluate((key) => { window.location.hash = `#/${key}` }, routeKey)
    await expect(page.locator('main .page')).toBeVisible({ timeout: 8000 })
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth > window.innerWidth + 1,
      main: document.querySelector('main')?.scrollWidth > document.querySelector('main')?.clientWidth + 1,
    }))
    expect(overflow.document, `${routeKey} widened the document`).toBe(false)
    expect(overflow.main, `${routeKey} widened main`).toBe(false)
  }
})

test('client workspace hides presenter-only context controls', async ({ page }) => {
  await openRole(page, 'Client portal')
  await page.getByRole('button', { name: 'Portal overview' }).click()
  await expect(page.locator('.client-surface')).toBeVisible()
  await expect(page.locator('.demo-nav-details')).toHaveCount(0)
  await expect(page.getByText('Presentation mode')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Restart walkthrough' })).toHaveCount(0)
})

test('mobile navigation closes with Escape and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openRole(page, 'Admin portal')
  const menu = page.getByRole('button', { name: 'Open navigation' })
  await menu.click()
  await expect(page.locator('.sidebar.open')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.sidebar.open')).toHaveCount(0)
  await expect(menu).toBeFocused()
})

test('desktop sidebar collapse is persistent and reversible', async ({ page }) => {
  await openRole(page, 'Admin portal')
  const shell = page.locator('.app-shell')
  const collapse = page.getByRole('button', { name: 'Collapse navigation' })
  await collapse.click()
  await expect(shell).toHaveClass(/sidebar-collapsed/)
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/)
  await page.getByRole('button', { name: 'Expand navigation' }).click()
  await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-collapsed/)
})

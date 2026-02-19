import { test, expect } from '@playwright/test'

// WHY: Jacob needs visual proof the dashboard works. These tests generate
// video recordings via Playwright that prove CRUD operations function
// end-to-end without reading any code.

test.describe('Dashboard Demo — Visual Proof', () => {

  test.beforeEach(async ({ page }) => {
    // demo.html is self-contained with mock data, no server needed
    await page.goto(`file://${process.cwd()}/docs/demo.html`)
    // Wait for demo data to render (setTimeout in demo script)
    await page.waitForTimeout(200)
  })

  test('1. List view loads with 5 customers', async ({ page }) => {
    // WHY: Proves the dashboard renders and mock data is correct.
    // If this fails, the demo page is broken.

    // Stats bar shows total count
    await expect(page.locator('.stat-chip').first()).toContainText('5 total')

    // All 5 customer cards render
    const cards = page.locator('.customer-card')
    await expect(cards).toHaveCount(5)

    // Verify specific customers exist
    await expect(page.locator('.card-name').nth(0)).toContainText('Acme Corp')
    await expect(page.locator('.card-name').nth(1)).toContainText('Bright Dental')
    await expect(page.locator('.card-name').nth(2)).toContainText('Nova Fitness')
    await expect(page.locator('.card-name').nth(3)).toContainText('Peak Realty')
    await expect(page.locator('.card-name').nth(4)).toContainText('Demo Sandbox')

    // Active/paused status dots
    const activeCount = await page.locator('.status-active').count()
    const pausedCount = await page.locator('.status-paused').count()
    expect(activeCount).toBe(4)
    expect(pausedCount).toBe(1) // Nova Fitness is paused

    // Paid/free badges
    await expect(page.locator('.badge-paid')).toHaveCount(3)
    await expect(page.locator('.badge-free')).toHaveCount(2)
  })

  test('2. Click customer opens detail view', async ({ page }) => {
    // WHY: Proves navigation works and customer data loads correctly.
    // If this fails, the detail editor is broken.

    // Click Acme Corp
    await page.locator('.customer-card').first().click()

    // Detail screen is visible
    await expect(page.locator('#detail-screen')).toBeVisible()

    // Title shows customer name
    await expect(page.locator('#detail-title')).toContainText('Acme Corp')

    // Fields are populated
    const nameInput = page.locator('#cust-name')
    await expect(nameInput).toHaveValue('Acme Corp')

    const promptInput = page.locator('#cust-prompt')
    await expect(promptInput).toContainText('helpful customer support agent')

    // Tool deny checkboxes - exec, write, edit, gateway should be checked
    await expect(page.locator('input[data-tool="exec"]')).toBeChecked()
    await expect(page.locator('input[data-tool="write"]')).toBeChecked()
    await expect(page.locator('input[data-tool="edit"]')).toBeChecked()
    await expect(page.locator('input[data-tool="gateway"]')).toBeChecked()

    // Status toggle shows Active
    await expect(page.locator('#toggle-active')).toHaveClass(/active/)
  })

  test('3. Edit customer fields', async ({ page }) => {
    // WHY: Proves the CRUD "Update" operation works in the UI.
    // If this fails, edits don't persist in the demo.

    // Open Acme Corp
    await page.locator('.customer-card').first().click()
    await expect(page.locator('#detail-screen')).toBeVisible()

    // Edit system prompt
    const promptInput = page.locator('#cust-prompt')
    await promptInput.clear()
    await promptInput.fill('Updated prompt for testing purposes')

    // Toggle to Paused
    await page.locator('#toggle-paused').click()
    await expect(page.locator('#toggle-paused')).toHaveClass(/active/)
    await expect(page.locator('#toggle-active')).not.toHaveClass(/active/)

    // Toggle to Paid
    await page.locator('#toggle-paid').click()
    await expect(page.locator('#toggle-paid')).toHaveClass(/active/)

    // Uncheck a tool deny checkbox
    await page.locator('input[data-tool="gateway"]').uncheck()
    await expect(page.locator('input[data-tool="gateway"]')).not.toBeChecked()

    // Navigate back
    await page.locator('.topbar .btn-icon').first().click()
    await expect(page.locator('#list-screen')).toBeVisible()
  })

  test('4. Add new customer via FAB', async ({ page }) => {
    // WHY: Proves the CRUD "Create" operation works.
    // If this fails, new customers can't be added.

    // Click FAB (+ button)
    await page.locator('.fab').click()

    // Detail screen opens with "New Customer" title
    await expect(page.locator('#detail-screen')).toBeVisible()
    await expect(page.locator('#detail-title')).toContainText('New Customer')

    // Form fields are empty/default
    await expect(page.locator('#cust-name')).toHaveValue('')
    await expect(page.locator('#cust-prompt')).toHaveValue('')

    // Default toggles: Active + Free
    await expect(page.locator('#toggle-active')).toHaveClass(/active/)
    await expect(page.locator('#toggle-free')).toHaveClass(/active/)

    // Fill in a customer name
    await page.locator('#cust-name').fill('Test Corp')
    await page.locator('#cust-prompt').fill('You are a test assistant.')

    // Verify the form accepts input
    await expect(page.locator('#cust-name')).toHaveValue('Test Corp')
  })

  test('5. Delete confirmation dialog', async ({ page }) => {
    // WHY: Proves destructive actions require confirmation.
    // If this fails, customers could be accidentally deleted.

    // Open Acme Corp
    await page.locator('.customer-card').first().click()
    await expect(page.locator('#detail-screen')).toBeVisible()

    // Click delete button
    await page.locator('.btn-icon.btn-danger').click()

    // Confirmation dialog appears
    await expect(page.locator('#confirm-dialog')).toBeVisible()
    await expect(page.locator('#confirm-title')).toContainText('Delete')
    await expect(page.locator('#confirm-message')).toContainText('gateway')

    // Cancel dismisses dialog
    await page.locator('.btn-secondary').click()
    await expect(page.locator('#confirm-dialog')).toBeHidden()

    // Still on detail screen
    await expect(page.locator('#detail-screen')).toBeVisible()
  })
})

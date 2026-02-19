import { test, expect } from '@playwright/test'

test.describe('Customer Admin Dashboard', () => {
  test('list loads — page renders and shows customer entries', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/customer/i)
    // Verify the customer list container is visible
    const list = page.locator('[data-testid="customer-list"], .customer-list, table, ul')
    await expect(list.first()).toBeVisible()
    // Should have at least one customer entry from demo data
    const entries = page.locator('[data-testid="customer-entry"], .customer-entry, tr, li')
    await expect(entries.first()).toBeVisible()
  })

  test('detail view — click a customer and verify fields shown', async ({ page }) => {
    await page.goto('/')
    // Click the first customer entry
    const firstEntry = page.locator('[data-testid="customer-entry"], .customer-entry, tr, li').first()
    await firstEntry.click()
    // Verify detail fields are displayed
    await expect(page.locator('text=/name|Name/i').first()).toBeVisible()
    await expect(page.locator('text=/prompt|Prompt/i').first()).toBeVisible()
    await expect(page.locator('text=/status|Status|enabled/i').first()).toBeVisible()
  })

  test('edit flow — change prompt and toggle status', async ({ page }) => {
    await page.goto('/')
    // Open first customer
    const firstEntry = page.locator('[data-testid="customer-entry"], .customer-entry, tr, li').first()
    await firstEntry.click()
    // Click edit button
    const editBtn = page.locator('button:has-text("Edit"), [data-testid="edit-btn"]')
    await editBtn.first().click()
    // Modify system prompt
    const promptField = page.locator('textarea, input[name="systemPrompt"], [data-testid="prompt-input"]').first()
    await promptField.fill('Updated system prompt for E2E test')
    // Toggle enabled status
    const toggle = page.locator('input[type="checkbox"], [data-testid="enabled-toggle"]').first()
    await toggle.click()
    // Save
    const saveBtn = page.locator('button:has-text("Save"), [data-testid="save-btn"]')
    await saveBtn.first().click()
    // Verify update persisted
    await expect(page.locator('text=Updated system prompt for E2E test')).toBeVisible()
  })

  test('add customer — FAB opens form, fill and submit', async ({ page }) => {
    await page.goto('/')
    // Click the floating action button / add button
    const addBtn = page.locator('button:has-text("Add"), [data-testid="add-btn"], .fab')
    await addBtn.first().click()
    // Fill the form
    const nameField = page.locator('input[name="name"], [data-testid="name-input"]').first()
    await nameField.fill('E2E Test Customer')
    const idField = page.locator('input[name="id"], [data-testid="id-input"]').first()
    await idField.fill('e2e-test-customer')
    const promptField = page.locator('textarea, input[name="systemPrompt"], [data-testid="prompt-input"]').first()
    await promptField.fill('E2E test system prompt')
    // Submit
    const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Create"), button[type="submit"]')
    await submitBtn.first().click()
    // Verify new customer appears in list
    await expect(page.locator('text=E2E Test Customer')).toBeVisible()
  })

  test('delete confirmation — click delete and confirm dialog', async ({ page }) => {
    await page.goto('/')
    // Open first customer
    const firstEntry = page.locator('[data-testid="customer-entry"], .customer-entry, tr, li').first()
    await firstEntry.click()
    // Click delete button
    const deleteBtn = page.locator('button:has-text("Delete"), [data-testid="delete-btn"]')
    await deleteBtn.first().click()
    // Confirmation dialog should appear
    const confirmDialog = page.locator('[data-testid="confirm-dialog"], dialog, .modal, [role="dialog"]')
    await expect(confirmDialog.first()).toBeVisible()
    // Confirm deletion
    const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), [data-testid="confirm-btn"]')
    await confirmBtn.first().click()
    // Dialog should close
    await expect(confirmDialog.first()).not.toBeVisible()
  })
})

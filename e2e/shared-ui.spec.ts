import { test, expect } from '@playwright/test'

for (const width of [390, 1440]) {
  test(`shared controls and dialog work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/e2e/fixtures/shared-ui.html')
    await expect(page.locator('html')).toHaveClass('app-dark')
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(244, 244, 245)')
    await expect(page.getByLabel('Example field')).toHaveCSS('background-color', 'rgb(9, 9, 11)')
    await page.getByLabel('Example field').fill('Example')
    await expect(page.getByRole('button', { name: 'Disabled action' })).toBeDisabled()
    await expect(page.getByLabel('Invalid field')).toHaveAttribute('aria-invalid', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: `docs/ui/controls-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    })

    const opener = page.getByRole('button', { name: 'Open dialog' })
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Example dialog' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    const close = dialog.getByRole('button', { name: 'Close', exact: true })
    const cancel = dialog.getByRole('button', { name: 'Cancel' })
    await close.focus()
    await page.keyboard.press('Shift+Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Dialog field')).toBeFocused()
    await page.getByLabel('Dialog field').fill('Example content')
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({
      path: `docs/ui/dialog-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
    await opener.click()
    await cancel.click()
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
    await opener.click()
    await close.click()
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })
}

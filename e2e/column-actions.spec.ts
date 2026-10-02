import { test, expect } from '@playwright/test'

for (const width of [390, 1440]) {
  test(`rename and delete support keyboard use and confirmation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ json: { accessToken: 'token' } }),
    )
    await page.route('**/api/users/me', (route) =>
      route.fulfill({ json: { id: 1, name: 'Learner', email: 'test@example.com' } }),
    )
    await page.route('**/api/lists', (route) =>
      route.fulfill({ json: [{ id: 1, title: 'Todo', position: 0 }] }),
    )
    let patches = 0
    let patchBody: unknown
    let deletes = 0
    await page.route('**/api/lists/1', async (route) => {
      if (route.request().method() === 'PATCH') {
        patches++
        patchBody = route.request().postDataJSON()
        await route.fulfill({ json: { id: 1, title: 'In progress', position: 0 } })
      } else {
        deletes++
        await route.fulfill({ status: 204 })
      }
    })
    await page.goto('/login')
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('Example123!')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    const rename = page.getByRole('button', { name: 'Rename Todo', exact: true })
    await expect(rename).toBeVisible()
    await rename.focus()
    await page.keyboard.press('Enter')
    const title = page.getByLabel('Title', { exact: true })
    await expect(title).toBeFocused()
    await expect(title).toHaveValue('Todo')
    await title.fill('  ')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Title is required.')).toBeVisible()
    expect(patches).toBe(0)
    await page.keyboard.press('Escape')
    await expect(rename).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(title).toHaveValue('Todo')
    await title.fill('  In progress  ')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 3 })).toHaveText('In progress')
    expect(patches).toBe(1)
    expect(patchBody).toEqual({ title: 'In progress' })
    const remove = page.getByRole('button', { name: 'Delete In progress', exact: true })
    await remove.click()
    const dialog = page.getByRole('dialog', { name: 'Delete column', exact: true })
    await expect(dialog).toContainText(
      'Delete “In progress”? All its tasks will be permanently deleted.',
    )
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(remove).toBeFocused()
    expect(deletes).toBe(0)
    await page.keyboard.press('Enter')
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.getByRole('button', { name: 'Delete column', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('No columns yet.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New column', exact: true })).toBeFocused()
    expect(deletes).toBe(1)
  })
}

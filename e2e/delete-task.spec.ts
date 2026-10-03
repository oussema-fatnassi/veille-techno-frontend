import { test, expect } from '@playwright/test'

for (const width of [390, 1440]) {
  test(`delete confirmation supports cancellation and keyboard focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const task = { id: 1, title: 'Remove this task', description: '', position: 0, listId: 1 }
    const other = { ...task, id: 2, title: 'Keep this task', position: 1 }
    let deletions = 0
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ json: { accessToken: 'token' } }),
    )
    await page.route('**/api/users/me', (route) =>
      route.fulfill({ json: { id: 1, name: 'Learner', email: 'learner@example.com' } }),
    )
    await page.route('**/api/lists', (route) =>
      route.fulfill({ json: [{ id: 1, title: 'Todo', position: 0 }] }),
    )
    await page.route('**/api/lists/1/cards', (route) => route.fulfill({ json: [task, other] }))
    await page.route('**/api/cards/1', (route) => {
      if (route.request().method() === 'DELETE') {
        deletions++
        return route.fulfill({ status: 204 })
      }
      return route.fulfill({ json: task })
    })
    await page.goto('/login')
    await page.getByLabel('Email').fill('learner@example.com')
    await page.getByLabel('Password').fill('Example123!')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    const opener = page.getByRole('button', { name: task.title, exact: true })
    await opener.focus()
    await page.keyboard.press('Enter')
    await page.getByLabel('Title', { exact: true }).fill('Unsaved draft')
    await page.getByRole('button', { name: 'Delete task', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: 'Delete task', exact: true })
    await expect(confirmation).toContainText('Permanently delete “Remove this task”?')
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unsaved draft')
    expect(deletions).toBe(0)
    await page.getByRole('button', { name: 'Delete task', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(confirmation).toBeHidden()
    await expect(opener).toBeFocused()
    expect(deletions).toBe(0)
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Delete task', exact: true }).click()
    await expect(confirmation).toHaveCSS('opacity', '1')
    const box = await confirmation.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `docs/ui/delete-task-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Delete task', exact: true }).click()
    await expect(confirmation).toBeHidden()
    await expect(page.getByRole('listitem')).toHaveText([other.title])
    await expect(page.getByRole('region', { name: 'Tasks in Todo', exact: true })).toBeFocused()
    expect(deletions).toBe(1)
  })
}

import { test, expect } from '@playwright/test'

test.use({ hasTouch: true })
for (const width of [390, 1440]) {
  test(`moves tasks with keyboard and touch at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let task = {
      id: 1,
      title: 'Move me',
      description: 'Keep my description',
      position: 0,
      listId: 1,
    }
    const other = { ...task, id: 2, title: 'Existing task', position: 4, listId: 2 }
    const patches: unknown[] = []
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ json: { accessToken: 'token' } }),
    )
    await page.route('**/api/users/me', (route) =>
      route.fulfill({ json: { id: 1, name: 'Learner', email: 'learner@example.com' } }),
    )
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [
          { id: 1, title: 'Todo', position: 0 },
          { id: 2, title: 'Done', position: 1 },
        ],
      }),
    )
    await page.route('**/api/lists/*/cards', (route) => {
      const id = Number(route.request().url().split('/').at(-2))
      return route.fulfill({
        json: [...(id === 2 ? [other] : []), ...(task.listId === id ? [task] : [])],
      })
    })
    await page.route('**/api/cards/1', (route) => {
      if (route.request().method() === 'PATCH') {
        const changes = route.request().postDataJSON()
        patches.push(changes)
        task = { ...task, ...changes }
      }
      return route.fulfill({ json: task })
    })
    await page.goto('/login')
    await page.getByLabel('Email').fill('learner@example.com')
    await page.getByLabel('Password').fill('Example123!')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await page.getByRole('button', { name: 'Move me', exact: true }).tap()
    await page.getByRole('button', { name: 'Move to another column', exact: true }).tap()
    const selector = page.getByLabel('Destination column')
    await expect(selector).toBeFocused()
    await expect(selector).toHaveValue('1')
    await expect(page.getByRole('button', { name: 'Move task', exact: true })).toBeDisabled()
    // Native selects support finding an option by typing its first letter.
    await page.keyboard.press('d')
    await page.keyboard.press('Tab')
    await expect(selector).toHaveValue('2')
    await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
    expect(patches).toEqual([])
    await expect(page.getByLabel('Title', { exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Move to another column', exact: true }).tap()
    await selector.selectOption('2')
    const dialog = page.getByRole('dialog', { name: 'Move task', exact: true })
    await expect(dialog).toHaveCSS('opacity', '1')
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `docs/ui/move-task-${width}.png`, fullPage: true })
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Move task', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('region', { name: 'Tasks in Todo', exact: true })).toContainText(
      'No tasks yet.',
    )
    await expect(
      page.getByRole('region', { name: 'Tasks in Done', exact: true }).getByRole('listitem'),
    ).toHaveText(['Existing task', 'Move me'])
    expect(patches).toEqual([{ listId: 2, position: 5 }])
    await page.getByRole('button', { name: 'Move me', exact: true }).tap()
    await expect(page.getByLabel('Description (optional)', { exact: true })).toHaveValue(
      'Keep my description',
    )
  })
}

import { test, expect } from '@playwright/test'

test.use({ hasTouch: true })
for (const width of [390, 1440]) {
  test(`reorders columns using keyboard and touch at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const columns = [
      { id: 1, title: 'Todo', position: 0 },
      { id: 2, title: 'Doing', position: 1 },
      { id: 3, title: 'Done', position: 2 },
    ]
    const patches: unknown[] = []
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ json: { accessToken: 'token' } }),
    )
    await page.route('**/api/users/me', (route) =>
      route.fulfill({ json: { id: 1, name: 'Learner', email: 'learner@example.com' } }),
    )
    await page.route('**/api/lists', (route) => route.fulfill({ json: columns }))
    await page.route('**/api/lists/*/cards', (route) => {
      const id = Number(route.request().url().split('/').at(-2))
      return route.fulfill({ json: [{ id, title: `Task ${id}`, position: 0 }] })
    })
    await page.route(/\/api\/lists\/\d+$/, (route) => {
      const id = Number(route.request().url().split('/').at(-1))
      const changes = route.request().postDataJSON()
      patches.push({ id, ...changes })
      const column = columns.find((item) => item.id === id)!
      column.position = changes.position
      return route.fulfill({ json: column })
    })
    await page.goto('/login')
    await page.getByLabel('Email').fill('learner@example.com')
    await page.getByLabel('Password').fill('Example123!')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Move Todo left', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Move Done right', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Move Doing left', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Doing', 'Todo', 'Done'])
    await expect(page.getByRole('heading', { name: 'Doing', exact: true })).toBeFocused()
    await expect(page.getByRole('listitem')).toHaveText(['Task 2', 'Task 1', 'Task 3'])
    await page.getByRole('button', { name: 'Move Doing right', exact: true }).tap()
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Todo', 'Doing', 'Done'])
    await expect(page.getByRole('heading', { name: 'Doing', exact: true })).toBeFocused()
    await expect(page.getByRole('listitem')).toHaveText(['Task 1', 'Task 2', 'Task 3'])
    expect(patches).toEqual([
      { id: 2, position: 0 },
      { id: 1, position: 1 },
      { id: 1, position: 0 },
      { id: 2, position: 1 },
    ])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `docs/ui/reorder-columns-${width}.png`, fullPage: true })
  })
}

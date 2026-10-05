import { test, expect } from '@playwright/test'
import { drag, dragTouch } from './helpers/drag.js'

test.use({ hasTouch: true })
for (const [mode, gesture] of [
  ['mouse', drag],
  ['touch', dragTouch],
] as const) {
  test(`drags tasks and columns using ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const columns = [
      { id: 1, title: 'Todo', position: 0 },
      { id: 2, title: 'Doing', position: 1 },
      { id: 3, title: 'Done', position: 2 },
    ]
    let task = { id: 10, title: 'Move me', description: 'Keep this', position: 0, listId: 1 }
    let other = { id: 20, title: 'Existing', description: '', position: 7, listId: 2 }
    const writes: unknown[] = []
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ json: { accessToken: 'token' } }),
    )
    await page.route('**/api/users/me', (route) =>
      route.fulfill({ json: { id: 1, name: 'Learner', email: 'learner@example.com' } }),
    )
    await page.route('**/api/lists', (route) => route.fulfill({ json: columns }))
    await page.route('**/api/lists/*/cards', (route) => {
      const id = Number(route.request().url().split('/').at(-2))
      return route.fulfill({
        json: [...(id === 2 ? [other] : []), ...(task.listId === id ? [task] : [])],
      })
    })
    await page.route('**/api/cards/*', (route) => {
      const id = Number(route.request().url().split('/').at(-1))
      if (route.request().method() === 'PATCH') {
        const changes = route.request().postDataJSON()
        writes.push(changes)
        if (id === 10) task = { ...task, ...changes }
        else other = { ...other, ...changes }
      }
      return route.fulfill({ json: id === 10 ? task : other })
    })
    await page.route(/\/api\/lists\/\d+$/, (route) => {
      const id = Number(route.request().url().split('/').at(-1))
      const column = columns.find((item) => item.id === id)!
      column.position = route.request().postDataJSON().position
      return route.fulfill({ json: column })
    })
    async function login() {
      await page.getByLabel('Email').fill('learner@example.com')
      await page.getByLabel('Password').fill('Example123!')
      await page.getByRole('button', { name: 'Log in', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Todo', exact: true })).toBeVisible()
    }
    await page.goto('/login')
    await login()
    const card = page.getByRole('button', { name: 'Move me', exact: true })
    const doing = page.getByRole('region', { name: 'Tasks in Doing', exact: true })
    const done = page.getByRole('region', { name: 'Tasks in Done', exact: true })
    const targetList = doing.locator('ul')
    const targetBox = await targetList.boundingBox()
    await gesture(page, card, targetList, 30, targetBox!.height - 2)
    await expect(doing.getByRole('listitem')).toHaveText(['Existing', 'Move me'])
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // Sorting within the same column persists the chosen position too.
    await gesture(page, card, doing.getByRole('button', { name: 'Existing', exact: true }), 20, 2)
    await expect(doing.getByRole('listitem')).toHaveText(['Move me', 'Existing'])
    await gesture(page, card, done.locator('ul'), 30, 20)
    await expect(done.getByRole('listitem')).toHaveText(['Move me'])
    expect(writes).toContainEqual({ listId: 3, position: 0 })
    const todoHeading = page.getByRole('heading', { name: 'Todo', exact: true })
    const doneColumn = page.locator('section[aria-labelledby="column-3"]')
    await gesture(page, todoHeading, doneColumn, 270, 25)
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Doing', 'Done', 'Todo'])
    await expect(done.getByRole('listitem')).toHaveText(['Move me'])
    await page.screenshot({ path: 'docs/ui/drag-board.png', fullPage: true })
    // Reload and log back in: order and task location must come from the API.
    await page.reload()
    await login()
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Doing', 'Done', 'Todo'])
    await expect(done.getByRole('listitem')).toHaveText(['Move me'])
    await card.click()
    await expect(page.getByLabel('Description (optional)', { exact: true })).toHaveValue(
      'Keep this',
    )
  })
}

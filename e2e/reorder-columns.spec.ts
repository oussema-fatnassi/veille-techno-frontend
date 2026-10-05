import { test, expect, type Page } from '@playwright/test'
import { drag } from './helpers/drag.js'

async function openBoard(page: Page, columns: { id: number; title: string; position: number }[]) {
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
  await page.goto('/login')
  await page.getByLabel('Email').fill('learner@example.com')
  await page.getByLabel('Password').fill('Example123!')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

test('board controls stay compact on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await openBoard(page, [
    { id: 1, title: 'Todo', position: 0 },
    { id: 2, title: 'Doing', position: 1 },
    { id: 3, title: 'Done', position: 2 },
  ])
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New task in Todo', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/ui/reorder-columns-390.png', fullPage: true })
})

test('reorders columns by dragging on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const columns = [
    { id: 1, title: 'Todo', position: 0 },
    { id: 2, title: 'Doing', position: 1 },
    { id: 3, title: 'Done', position: 2 },
  ]
  const patches: unknown[] = []
  await page.route(/\/api\/lists\/\d+$/, (route) => {
    const id = Number(route.request().url().split('/').at(-1))
    const changes = route.request().postDataJSON()
    patches.push({ id, ...changes })
    const column = columns.find((item) => item.id === id)!
    column.position = changes.position
    return route.fulfill({ json: column })
  })
  await openBoard(page, columns)
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0)
  await drag(
    page,
    page.getByRole('heading', { name: 'Doing', exact: true }),
    page.locator('section[aria-labelledby="column-1"]'),
    1,
    25,
  )
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Doing', 'Todo', 'Done'])
  await expect(page.getByRole('listitem')).toHaveText(['Task 2', 'Task 1', 'Task 3'])
  await drag(
    page,
    page.getByRole('heading', { name: 'Doing', exact: true }),
    page.locator('section[aria-labelledby="column-1"]'),
    270,
    25,
  )
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Todo', 'Doing', 'Done'])
  await expect(page.getByRole('listitem')).toHaveText(['Task 1', 'Task 2', 'Task 3'])
  expect(patches).toEqual([
    { id: 2, position: 0 },
    { id: 1, position: 1 },
    { id: 1, position: 0 },
    { id: 2, position: 1 },
  ])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/ui/reorder-columns-1440.png', fullPage: true })
})

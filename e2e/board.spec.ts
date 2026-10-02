import { test, expect, type Page } from '@playwright/test'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('board@example.com')
  await page.getByLabel('Password').fill('Example123!')
  await page.getByRole('button', { name: 'Log in' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/lists/*/cards', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { accessToken: 'test-token' } }),
  )
  await page.route('**/api/users/me', (route) =>
    route.fulfill({ json: { id: 1, name: 'Board user', email: 'board@example.com' } }),
  )
})

for (const width of [390, 1440]) {
  test(`columns are ordered and scrolling stays inside the board at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [
          { id: 9, position: 2, title: 'Later' },
          { id: 3, position: 0, title: 'Second' },
          { id: 1, position: 0, title: 'First' },
          { id: 10, position: 3, title: 'Long title '.repeat(10) },
          { id: 11, position: 4, title: 'X'.repeat(100) },
        ],
      }),
    )
    await login(page)
    const board = page.getByRole('region', { name: 'Board columns', exact: true })
    await expect(board.getByRole('heading', { level: 3 })).toHaveText([
      'First',
      'Second',
      'Later',
      'Long title '.repeat(10).trim(),
      'X'.repeat(100),
    ])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await board.focus()
    await expect(board).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    await page.screenshot({ path: `docs/ui/board-columns-${width}.png`, fullPage: true })
  })
}

test('loading, failure, keyboard retry, and empty state are distinct', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/lists', async (route) => {
    await pending
    await route.fulfill({ status: 500, json: {} })
  })
  await login(page)
  try {
    await expect(page.getByText('Loading columns…')).toBeVisible()
    await expect(page.getByText('No columns yet.', { exact: false })).toHaveCount(0)
  } finally {
    release()
  }
  await expect(page.getByRole('alert')).toContainText('Cannot reach the service')
  await expect(page.getByText('No columns yet.', { exact: false })).toHaveCount(0)
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }))
  await page.getByRole('button', { name: 'Retry columns' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('No columns yet.', { exact: false })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('expired lists request removes the board and returns to login', async ({ page }) => {
  await page.route('**/api/lists', (route) => route.fulfill({ status: 401, json: {} }))
  await login(page)
  await expect(page.getByRole('alert')).toHaveText('Your session has expired. Please log in again.')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Columns', exact: true })).toHaveCount(0)
})

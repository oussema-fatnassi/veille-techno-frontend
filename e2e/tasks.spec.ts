import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email = 'a@example.com') {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('Example123!')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/board$/)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { accessToken: route.request().postDataJSON().email } }),
  )
  await page.route('**/api/users/me', (route) =>
    route.fulfill({
      json: {
        id: 1,
        name: 'Learner',
        email: route.request().headers().authorization?.slice(7),
      },
    }),
  )
})

for (const width of [390, 1440]) {
  test(`tasks show ordering, partial failure, empty state and keyboard retry at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const calls = { first: 0, second: 0, third: 0 }
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [
          { id: 1, title: 'Todo', position: 0 },
          { id: 2, title: 'Review', position: 1 },
          { id: 3, title: 'Done', position: 2 },
          { id: 4, title: 'Later', position: 3 },
          { id: 5, title: 'Archive', position: 4 },
        ],
      }),
    )
    await page.route('**/api/lists/*/cards', (route) => route.fulfill({ json: [] }))
    await page.route('**/api/lists/1/cards', (route) => {
      calls.first++
      return route.fulfill({
        json: [
          { id: 9, title: 'X'.repeat(100), position: 3 },
          { id: 3, title: 'Second task', position: 0 },
          { id: 1, title: '<img src=x onerror=alert(1)>', position: 0 },
        ],
      })
    })
    await page.route('**/api/lists/2/cards', async (route) => {
      calls.second++
      await pending
      await route.fulfill({ status: 500, json: {} })
    })
    await page.route('**/api/lists/3/cards', (route) => {
      calls.third++
      return route.fulfill({ json: [] })
    })
    await page.goto('/login')
    await login(page)
    const todo = page.getByRole('region', { name: 'Tasks in Todo', exact: true })
    const review = page.getByRole('region', { name: 'Tasks in Review', exact: true })
    try {
      await expect(review.getByRole('status')).toHaveText('Loading tasks…')
      await expect(review.getByText('No tasks yet.')).toHaveCount(0)
      await expect(todo.getByRole('listitem')).toHaveText([
        '<img src=x onerror=alert(1)>',
        'Second task',
        'X'.repeat(100),
      ])
      await expect(todo.locator('img')).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Tasks in Done', exact: true })).toContainText(
        'No tasks yet.',
      )
    } finally {
      release()
    }
    await expect(review.getByRole('alert')).toContainText('Cannot reach the service')
    await expect(review.getByText('No tasks yet.')).toHaveCount(0)
    await page.route('**/api/lists/2/cards', (route) => {
      calls.second++
      return route.fulfill({ json: [{ id: 4, title: 'Recovered task', position: 0 }] })
    })
    await review.getByRole('button', { name: 'Retry tasks in Review' }).focus()
    await page.keyboard.press('Enter')
    await expect(review.getByRole('listitem')).toHaveText(['Recovered task'])
    await expect(review).toBeFocused()
    expect(calls).toEqual({ first: 1, second: 2, third: 1 })
    await expect(todo.getByRole('listitem')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const board = page.getByRole('region', { name: 'Board columns', exact: true })
    await board.evaluate((element) => {
      element.scrollLeft = 0
    })
    await board.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    const fits = await todo
      .getByRole('listitem')
      .evaluateAll((items) => items.every((item) => item.scrollWidth <= item.clientWidth))
    expect(fits).toBe(true)
    await page.screenshot({ path: `docs/ui/board-tasks-${width}.png`, fullPage: true })
  })
}

test('a protected task 401 clears the board and returns to login', async ({ page }) => {
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: [{ id: 1, title: 'Todo', position: 0 }] }),
  )
  await page.route('**/api/lists/1/cards', (route) => route.fulfill({ status: 401, json: {} }))
  await page.goto('/login')
  await page.getByLabel('Email').fill('a@example.com')
  await page.getByLabel('Password').fill('Example123!')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Your session has expired. Please log in again.')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('region', { name: 'Board columns', exact: true })).toHaveCount(0)
})

for (const status of [200, 401]) {
  test(`late task response ${status} from A cannot affect account B`, async ({ page }) => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let returned = false
    await page.route('**/api/lists', (route) =>
      route.fulfill({
        json: [
          {
            id: route.request().headers().authorization === 'Bearer a@example.com' ? 1 : 2,
            title: 'Private column',
            position: 0,
          },
        ],
      }),
    )
    await page.route('**/api/lists/1/cards', async (route) => {
      await pending
      await route.fulfill({ status, json: [{ id: 1, title: 'Private A task', position: 0 }] })
      returned = true
    })
    await page.route('**/api/lists/2/cards', (route) =>
      route.fulfill({ json: [{ id: 2, title: 'Private B task', position: 0 }] }),
    )
    await page.goto('/login')
    await login(page)
    try {
      await expect(page.getByText('Loading tasks…')).toBeVisible()
      await page.getByRole('button', { name: 'Log out', exact: true }).click()
      await expect(page).toHaveURL(/\/login$/)
      await login(page, 'b@example.com')
      await expect(page.getByRole('listitem')).toHaveText(['Private B task'])
    } finally {
      release()
    }
    await expect.poll(() => returned).toBe(true)
    await expect(page.getByText('Private A task')).toHaveCount(0)
    await expect(page.getByRole('listitem')).toHaveText(['Private B task'])
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page).toHaveURL(/\/board$/)
  })
}

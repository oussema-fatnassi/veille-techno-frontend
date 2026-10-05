import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email = 'a@example.com') {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('Password123!')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/board$/)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      json: {
        accessToken: route.request().postDataJSON().email,
      },
    }),
  )
  await page.route('**/api/users/me', (route) =>
    route.fulfill({
      json: {
        id: 1,
        name: 'Current user',
        email: route.request().headers().authorization?.slice(7),
      },
    }),
  )
})

test('anonymous access and reload require login; logging in reloads the profile', async ({
  page,
}) => {
  await page.goto('/board')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'My board' })).toHaveCount(0)
  await login(page)
  await expect(page.getByText('a@example.com', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'My board' })).toHaveCount(0)
  await login(page)
  await expect(page.getByText('a@example.com', { exact: true })).toBeVisible()
})

test('logout clears account A, blocks Back, and loads account B', async ({ page }) => {
  await page.goto('/missing')
  await page.getByRole('link', { name: 'Back to login' }).click()
  await login(page)
  await expect(page.getByText('a@example.com', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'My board' })).toHaveCount(0)
  await page.goForward()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, 'b@example.com')
  await expect(page.getByText('b@example.com', { exact: true })).toBeVisible()
  await expect(page.getByText('a@example.com', { exact: false })).toHaveCount(0)
})

test('protected 401 returns to login with one expiration message', async ({ page }) => {
  await page.route('**/api/users/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.goto('/login')
  await page.getByLabel('Email').fill('a@example.com')
  await page.getByLabel('Password').fill('Password123!')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Your session has expired. Please log in again.')
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'My board' })).toHaveCount(0)
})

test('403 keeps the session and offers retry', async ({ page }) => {
  await page.route('**/api/users/me', (route) => route.fulfill({ status: 403, json: {} }))
  await page.goto('/login')
  await login(page)
  await expect(page.getByRole('alert')).toHaveText('You do not have access to this resource.')
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  await page.route('**/api/users/me', (route) =>
    route.fulfill({ json: { id: 1, name: 'Account A', email: 'a@example.com' } }),
  )
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('a@example.com', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('late profile data from account A cannot replace account B', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = false
  await page.route(
    '**/api/users/me',
    async (route) => {
      started = true
      await pending
      await route.fulfill({ json: { id: 1, name: 'Account A', email: 'a@example.com' } })
    },
    { times: 1 },
  )
  await page.goto('/login')
  await login(page)
  try {
    await expect.poll(() => started).toBe(true)
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await login(page, 'b@example.com')
    await expect(page.getByText('b@example.com', { exact: true })).toBeVisible()
  } finally {
    release()
  }
  await expect(page.getByText('b@example.com', { exact: true })).toBeVisible()
  await expect(page.getByText('a@example.com', { exact: false })).toHaveCount(0)
})

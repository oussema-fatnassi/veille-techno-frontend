import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }))
})

for (const width of [390, 1440]) {
  test(`registration and subsequent login work with the keyboard at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    let registrations = 0
    await page.route('**/api/auth/register', async (route) => {
      registrations++
      expect(route.request().postDataJSON()).toEqual({
        name: 'Learner',
        email: 'learner@example.com',
        password: 'Learning1!',
      })
      expect(route.request().headers().authorization).toBeUndefined()
      await route.fulfill({
        status: 202,
        json: { message: 'Accepted' },
      })
    })
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ json: { accessToken: 'test-token' } }),
    )
    await page.route('**/api/users/me', (route) =>
      route.fulfill({ json: { id: 1, name: 'Learner', email: 'learner@example.com' } }),
    )
    await page.goto('/register')
    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Create account' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused()
    await expect(page.getByText('Name is required.', { exact: true })).toBeVisible()
    await page.getByLabel('Name', { exact: true }).fill('Learner')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Email')).toBeFocused()
    await page.getByLabel('Email').fill('invalid')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await page.getByLabel('Email').fill('learner@example.com')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password')).toBeFocused()
    await page.getByLabel('Password').fill('weak')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(registrations).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByLabel('Password').fill('Learning1!')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Create account' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('status')).toHaveText('Accepted')
    await expect(page.getByLabel('Email')).toHaveValue('learner@example.com')
    await expect(page.getByLabel('Password')).toHaveValue('')
    expect(registrations).toBe(1)
    await page.getByLabel('Password').fill('Learning1!')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/board$/)
    await expect(page.getByText('Signed in as')).toContainText('learner@example.com')
  })
}

for (const [status, message] of [
  [429, 'Too many attempts. Try again in a minute.'],
  [400, 'Check the entered values.'],
  [500, 'Cannot reach the service.'],
  [0, 'Cannot reach the service.'],
] as const) {
  test(`registration recovers from ${status}`, async ({ page }) => {
    await page.route('**/api/auth/register', (route) =>
      status === 0 ? route.abort('failed') : route.fulfill({ status, json: { message } }),
    )
    await page.goto('/register')
    await page.getByLabel('Name', { exact: true }).fill('Learner')
    await page.getByLabel('Email').fill('learner@example.com')
    await page.getByLabel('Password').fill('Learning1!')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page).toHaveURL(/\/register$/)
    await expect(page.getByRole('button', { name: 'Create account' })).toBeEnabled()
    await expect(page.getByRole('status')).toHaveCount(0)
    await page.route('**/api/auth/register', (route) =>
      route.fulfill({ status: 202, json: { message: 'Accepted' } }),
    )
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('status')).toHaveText('Accepted')
  })
}

test('registration blocks repeated submissions while pending', async ({ page }) => {
  let calls = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/auth/register', async (route) => {
    calls++
    await pending
    await route.fulfill({ status: 202, json: { message: 'Accepted' } })
  })
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Learner')
  await page.getByLabel('Email').fill('learner@example.com')
  await page.getByLabel('Password').fill('Learning1!')
  try {
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect.poll(() => calls).toBe(1)
    await expect(page.getByRole('button', { name: 'Creating account…' })).toBeDisabled()
    await page.locator('form').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
  } finally {
    release()
  }
  await expect(page).toHaveURL(/\/login$/)
  expect(calls).toBe(1)
})

import { test, expect, type Route } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/users/me', (route) =>
    route.fulfill({
      json: {
        id: 1,
        name: 'Student',
        email: 'student@example.com',
      },
    }),
  )
})

for (const width of [390, 1440]) {
  test(`login supports keyboard validation and successful submission at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    let calls = 0
    await page.route('**/api/auth/login', async (route) => {
      calls++
      expect(route.request().postDataJSON()).toEqual({
        email: 'student@example.com',
        password: 'a',
      })
      await route.fulfill({ json: { accessToken: 'browser-token' } })
    })
    await page.goto('/login')
    await page.getByRole('button', { name: 'Log in' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Email')).toBeFocused()
    await expect(page.getByText('Email is required.', { exact: true })).toBeVisible()
    await page.getByLabel('Email').fill('invalid')
    await page.keyboard.press('Enter')
    await expect(
      page.getByText('Enter a valid email address, for example name@example.com.'),
    ).toBeVisible()
    expect(calls).toBe(0)
    await page.getByLabel('Email').fill('student@example.com')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Password')).toBeFocused()
    await expect(page.getByText('Password is required.', { exact: true })).toBeVisible()
    // Login accepts an existing password without enforcing registration strength rules.
    await page.getByLabel('Password').fill('a')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Log in' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/board$/)
    await expect(page.getByRole('heading', { name: 'My board' })).toBeVisible()
    expect(calls).toBe(1)
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByLabel('Password')).toHaveValue('')
  })
}

async function respondToLogin(route: Route, calls: number, failure: string) {
  if (calls > 1) {
    await route.fulfill({ json: { accessToken: 'retry-token' } })
  } else if (failure === 'network') {
    await route.abort('failed')
  } else {
    const status = failure === '400' ? 400 : failure === '500' ? 500 : 401
    await route.fulfill({
      status,
      json: { message: failure === '400' ? 'Check the entered values.' : failure },
    })
  }
}

for (const failure of ['unknown account', 'wrong password', '400', '500', 'network']) {
  const message =
    failure === '400'
      ? 'Check the entered values.'
      : ['network', '500'].includes(failure)
        ? 'Cannot reach the service.'
        : 'Invalid credentials.'

  test(`login recovers from ${failure}`, async ({ page }) => {
    let calls = 0
    await page.route('**/api/auth/login', async (route) => {
      calls++
      await respondToLogin(route, calls, failure)
    })
    await page.goto('/login')
    await page.getByLabel('Email').fill('student@example.com')
    await page.getByLabel('Password').fill('Example123!')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled()
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/board$/)
    expect(calls).toBe(2)
  })
}

test('login sends only one request while pending', async ({ page }) => {
  let calls = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/auth/login', async (route) => {
    calls++
    await pending
    await route.fulfill({ json: { accessToken: 'browser-token' } })
  })
  await page.goto('/login')
  await page.getByLabel('Email').fill('student@example.com')
  await page.getByLabel('Password').fill('Example123!')
  try {
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect.poll(() => calls).toBe(1)
    await expect(page.getByRole('button', { name: 'Logging in…' })).toBeDisabled()
    // Exercise the handler even if a second submit bypasses the disabled button.
    await page.locator('form').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await expect(page).toHaveURL(/\/login$/)
  } finally {
    release()
  }
  await expect(page).toHaveURL(/\/board$/)
  expect(calls).toBe(1)
})

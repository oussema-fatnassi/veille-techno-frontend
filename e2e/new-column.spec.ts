import { test, expect, type Page } from '@playwright/test'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('column@example.com')
  await page.getByLabel('Password').fill('Example123!')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('button', { name: 'New column', exact: true })).toBeEnabled()
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { accessToken: 'test-token' } }),
  )
  await page.route('**/api/users/me', (route) =>
    route.fulfill({ json: { id: 1, name: 'Learner', email: 'column@example.com' } }),
  )
})

for (const width of [390, 1440]) {
  test(`column creation supports validation, cancel, and keyboard focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    let posts = 0
    await page.route('**/api/lists', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: [{ id: 1, title: 'Existing', position: 8 }] })
        return
      }
      posts++
      expect(route.request().postDataJSON()).toEqual({ title: 'Review', position: 9 })
      await route.fulfill({ status: 201, json: { id: 42, title: 'Review', position: 9 } })
    })
    await login(page)
    const opener = page.getByRole('button', { name: 'New column', exact: true })
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'New column', exact: true })
    await expect(dialog).toBeVisible()
    await page.getByRole('button', { name: 'Create column', exact: true }).click()
    await expect(page.getByLabel('Title', { exact: true })).toBeFocused()
    await expect(page.getByText('Title is required.', { exact: true })).toBeVisible()
    await page.getByLabel('Title', { exact: true }).fill('x'.repeat(101))
    await expect(page.getByText('Title must be 100 characters or fewer.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
    expect(posts).toBe(0)
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(opener).toBeFocused()
    await page.keyboard.press('Enter')
    await page.getByLabel('Title', { exact: true }).fill('  Review  ')
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Existing', 'Review'])
    await expect(opener).toBeFocused()
    expect(posts).toBe(1)
  })
}

test('first column starts at zero and repeated submits send one request', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  await page.route('**/api/lists', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [] })
      return
    }
    calls++
    expect(route.request().postDataJSON()).toEqual({ title: 'First', position: 0 })
    await pending
    await route.fulfill({ status: 201, json: { id: 20, title: 'First', position: 0 } })
  })
  await login(page)
  await page.getByRole('button', { name: 'New column', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('First')
  try {
    await page.getByRole('button', { name: 'Create column', exact: true }).click()
    await expect.poll(() => calls).toBe(1)
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page
      .locator('#new-column-form')
      .evaluate((form) =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
      )
  } finally {
    release()
  }
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['First'])
  expect(calls).toBe(1)
})

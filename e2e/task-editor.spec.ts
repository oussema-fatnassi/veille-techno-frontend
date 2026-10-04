import { test, expect, type Page } from '@playwright/test'

const initial = {
  id: 1,
  title: 'Current title',
  description: null as string | null,
  position: 0,
  listId: 1,
}
async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('editor@example.com')
  await page.getByLabel('Password').fill('Example123!')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('listitem')).toHaveText(['Current title'])
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { accessToken: 'token' } }),
  )
  await page.route('**/api/users/me', (route) =>
    route.fulfill({ json: { id: 1, name: 'Learner', email: 'editor@example.com' } }),
  )
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: [{ id: 1, title: 'Todo', position: 0 }] }),
  )
  await page.route('**/api/lists/1/cards', (route) => route.fulfill({ json: [initial] }))
})

for (const width of [390, 1440]) {
  test(`task editing supports keyboard use, validation, plain text, and clearing at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    let saved = { ...initial }
    const patches: unknown[] = []
    await page.route('**/api/cards/1', async (route) => {
      if (route.request().method() === 'PATCH') {
        const changes = route.request().postDataJSON()
        patches.push(changes)
        saved = { ...saved, title: changes.title.trim(), description: changes.description.trim() }
      }
      await route.fulfill({ json: saved })
    })
    await login(page)
    const opener = page.getByRole('listitem').getByRole('button')
    const dialog = page.getByRole('dialog', { name: 'Edit task', exact: true })
    const title = page.getByLabel('Title', { exact: true })
    const description = page.getByLabel('Description (optional)', { exact: true })
    await opener.focus()
    await page.keyboard.press('Enter')
    await expect(title).toBeFocused()
    await expect(title).toHaveValue('Current title')
    await expect(description).toHaveValue('')
    await title.fill('Cancelled draft')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
    expect(patches).toEqual([])
    await page.keyboard.press('Enter')
    await expect(title).toHaveValue('Current title')
    await title.fill('   ')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Title is required.')).toBeVisible()
    await expect(title).toBeFocused()
    await title.fill('x'.repeat(101))
    await expect(page.getByText('Title must be 100 characters or fewer.')).toBeVisible()
    expect(patches).toEqual([])
    await title.fill('  Updated title  ')
    const markup = '<img src=x onerror=alert(1)><script>alert(1)</script>'
    await description.fill(`  ${markup}  `)
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `docs/ui/task-editor-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(opener).toHaveText('Updated title')
    await expect(opener).toBeFocused()
    expect(patches).toEqual([{ title: 'Updated title', description: `  ${markup}  ` }])
    await page.keyboard.press('Enter')
    await expect(description).toHaveValue(markup)
    await expect(dialog.locator('img, script')).toHaveCount(0)
    await description.fill('')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(patches[1]).toEqual({ title: 'Updated title', description: '' })
    await opener.click()
    await expect(title).toHaveValue('Updated title')
    await expect(description).toHaveValue('')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(opener).toBeFocused()
  })
}

for (const phase of ['GET', 'PATCH']) {
  test(`a task deleted elsewhere cannot be edited after ${phase} returns 404`, async ({ page }) => {
    await page.route('**/api/cards/1', (route) =>
      route.fulfill({
        status: route.request().method() === phase ? 404 : 200,
        json: initial,
      }),
    )
    await login(page)
    await page.getByRole('button', { name: 'Current title', exact: true }).click()
    // Only PATCH cases require a save to trigger the missing-task response.
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (phase === 'PATCH')
      await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('This task no longer exists.')
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Tasks in Todo', exact: true })).toBeFocused()
    await expect(page.getByRole('listitem')).toHaveCount(0)
  })
}

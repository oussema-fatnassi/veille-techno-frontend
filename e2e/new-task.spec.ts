import { test, expect, type Page } from '@playwright/test'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('tasks@example.com')
  await page.getByLabel('Password').fill('Example123!')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/board$/)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { accessToken: 'token' } }),
  )
  await page.route('**/api/users/me', (route) =>
    route.fulfill({ json: { id: 1, name: 'Learner', email: 'tasks@example.com' } }),
  )
  await page.route('**/api/lists', (route) =>
    route.fulfill({
      json: [
        { id: 1, title: 'Todo', position: 0 },
        { id: 2, title: 'Done', position: 1 },
      ],
    }),
  )
})

for (const width of [390, 1440]) {
  test(`creates tasks in two columns with validation and keyboard support at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const posts: { listId: number; body: unknown }[] = []
    await page.route('**/api/lists/*/cards', async (route) => {
      const listId = Number(route.request().url().split('/').at(-2))
      if (route.request().method() === 'GET') {
        if (listId === 1) await pending
        await route.fulfill({
          json: listId === 1 ? [{ id: 1, title: 'Existing', position: 8 }] : [],
        })
        return
      }
      const body = route.request().postDataJSON()
      posts.push({ listId, body })
      await route.fulfill({ status: 201, json: { id: 41 + listId, listId, ...body } })
    })
    await page.route('**/api/cards/43', (route) =>
      route.fulfill({
        json: {
          id: 43,
          listId: 2,
          title: 'Second task',
          description: 'Optional task details',
          position: 0,
        },
      }),
    )
    await login(page)
    const first = page.getByRole('button', { name: 'New task in Todo', exact: true })
    try {
      await expect(first).toBeDisabled()
      await expect(
        page.getByRole('button', { name: 'New task in Done', exact: true }),
      ).toBeEnabled()
    } finally {
      release()
    }
    await expect(first).toBeEnabled()
    await first.focus()
    await page.keyboard.press('Enter')
    const title = page.getByLabel('Title', { exact: true })
    const dialog = page.getByRole('dialog', { name: 'New task', exact: true })
    await expect(title).toBeFocused()
    await title.fill('Cancelled draft')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(first).toBeFocused()
    expect(posts).toEqual([])
    await page.keyboard.press('Enter')
    await expect(title).toHaveValue('')
    await title.fill('   ')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Title is required.')).toBeVisible()
    await title.fill('x'.repeat(101))
    await expect(page.getByText('Title must be 100 characters or fewer.')).toBeVisible()
    expect(posts).toEqual([])
    await title.fill('  First task  ')
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(first).toBeFocused()
    await expect(
      page.getByRole('region', { name: 'Tasks in Todo', exact: true }).getByRole('listitem'),
    ).toHaveText(['Existing', 'First task'])
    await page.getByRole('button', { name: 'New task in Done', exact: true }).click()
    await expect(dialog).toContainText('Column: Done')
    await title.fill('Second task')
    await page.getByLabel('Description (optional)', { exact: true }).fill('Optional task details')
    await expect(dialog).toHaveCSS('opacity', '1')
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `docs/ui/new-task-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Create task', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('region', { name: 'Tasks in Done', exact: true }).getByRole('listitem'),
    ).toHaveText(['Second task'])
    expect(posts).toEqual([
      { listId: 1, body: { title: 'First task', description: '', position: 9 } },
      {
        listId: 2,
        body: { title: 'Second task', description: 'Optional task details', position: 0 },
      },
    ])
    await page.getByRole('button', { name: 'Second task', exact: true }).click()
    await expect(page.getByLabel('Description (optional)', { exact: true })).toHaveValue(
      'Optional task details',
    )
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Second task', exact: true })).toBeFocused()
  })
}

test('a deleted column is removed from the board after creation returns 404', async ({ page }) => {
  await page.route('**/api/lists/*/cards', (route) => route.fulfill({ json: [] }))
  await login(page)
  await page.getByRole('button', { name: 'New task in Todo', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Draft')
  await page.route('**/api/lists/1/cards', (route) => route.fulfill({ status: 404, json: {} }))
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: [{ id: 2, title: 'Done', position: 1 }] }),
  )
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByText('The column “Todo” no longer exists.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Done'])
  await expect(page.getByRole('button', { name: 'New column', exact: true })).toBeFocused()
})

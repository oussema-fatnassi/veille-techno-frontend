import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'

const realApi = process.env.API_SMOKE_REAL === '1'
let backend: Server
const received: { path: string; authorization?: string }[] = []

test.beforeAll(async () => {
  if (realApi) return
  backend = createServer((request, response) => {
    received.push({ path: request.url!, authorization: request.headers.authorization })
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/auth/login') {
      response.end(JSON.stringify({ accessToken: 'browser-test-token' }))
    } else if (request.url === '/api/lists') {
      response.end('[]')
    } else if (request.url === '/api/users/me') {
      response.writeHead(request.headers.authorization === 'Bearer browser-test-token' ? 200 : 401)
      response.end(JSON.stringify({ id: 1, name: 'API test user', email: 'api@example.test' }))
    } else {
      response.writeHead(404)
      response.end('{}')
    }
  })
  await new Promise<void>((resolve, reject) => {
    backend.once('error', reject)
    backend.listen(43123, '127.0.0.1', resolve)
  })
})

test.afterAll(async () => {
  if (!backend) return
  backend.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    backend.close((error) => (error ? reject(error) : resolve())),
  )
})

async function prepareTestAccount(page: Page, credentials: { email: string; password: string }) {
  if (realApi && !process.env.API_TEST_EMAIL) {
    await page.evaluate(async (credentials) => {
      const modulePath = '/src/api/client.ts'
      const { createApiClient } = await import(modulePath)
      await createApiClient().post('/auth/register', { ...credentials, name: 'F07 API test' })
    }, credentials)
  }
}

test('browser login and protected request through the frontend proxy', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  const credentials = {
    email: process.env.API_TEST_EMAIL || `f07-${randomUUID()}@example.test`,
    password: process.env.API_TEST_PASSWORD || `T1!${randomUUID().slice(0, 12)}`,
  }
  await prepareTestAccount(page, credentials)
  await page.getByLabel('Email').fill(credentials.email)
  await page.getByLabel('Password').fill(credentials.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/board$/)

  await expect(page.getByText('Signed in as', { exact: false })).toBeVisible()
  expect(received.filter((request) => request.path !== '/api/lists')).toEqual(
    realApi
      ? []
      : [
          { path: '/api/auth/login', authorization: undefined },
          { path: '/api/users/me', authorization: 'Bearer browser-test-token' },
        ],
  )
})

test('real account A logout then account B keeps identities separate', async ({ page }) => {
  // The isolated runner creates disposable accounts; CI uses controlled responses.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!realApi, 'Requires the real backend')
  await page.goto('/login')
  const accounts = ['A', 'B'].map((name) => ({
    name: `F08 account ${name}`,
    email: `f08-${randomUUID()}@example.test`,
    password: `T1!${randomUUID().slice(0, 12)}`,
  }))
  await page.evaluate(async (accounts) => {
    const modulePath = '/src/api/client.ts'
    const { createApiClient } = await import(modulePath)
    for (const account of accounts) {
      await createApiClient().post('/auth/register', account)
      const { accessToken } = await createApiClient().post('/auth/login', {
        email: account.email,
        password: account.password,
      })
      const client = createApiClient({ getAccessToken: () => accessToken })
      const column = await client.post('/lists', {
        title: `${account.name} column`,
        position: 0,
      })
      await client.post(`/lists/${column.id}/cards`, {
        title: `${account.name} private task`,
        position: 0,
      })
    }
  }, accounts)
  for (const account of accounts) {
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/board$/)
    await expect(page.getByText('Signed in as')).toContainText(account.email)
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([`${account.name} column`])
    await expect(
      page.getByRole('region', { name: 'Board columns', exact: true }).getByRole('listitem'),
    ).toHaveText([`${account.name} private task`])
    await page.getByRole('button', { name: 'New column', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill(`Created by ${account.name}`)
    await page.getByRole('button', { name: 'Create column', exact: true }).click()
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      `${account.name} column`,
      `Created by ${account.name}`,
    ])
    // Dedicated task data verifies rename preservation and database cascade deletion.
    const seeded = await page.evaluate(async (account) => {
      const modulePath = '/src/api/client.ts'
      const { createApiClient } = await import(modulePath)
      const { accessToken } = await createApiClient().post('/auth/login', {
        email: account.email,
        password: account.password,
      })
      const client = createApiClient({ getAccessToken: () => accessToken })
      const columns = await client.get('/lists')
      const column = columns.find(
        (item: { title: string }) => item.title === `Created by ${account.name}`,
      )
      const card = await client.post(`/lists/${column.id}/cards`, {
        title: 'Keep this task during rename',
        description: 'F22 dedicated data',
        position: 0,
      })
      return { columnId: column.id as number, cardId: card.id as number, card }
    }, account)
    await page
      .getByRole('button', { name: `Rename Created by ${account.name}`, exact: true })
      .click()
    await page.getByLabel('Title', { exact: true }).fill(`Renamed by ${account.name}`)
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      `${account.name} column`,
      `Renamed by ${account.name}`,
    ])
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      `${account.name} column`,
      `Renamed by ${account.name}`,
    ])
    const preserved = await page.evaluate(
      async ({ account, seeded }) => {
        const modulePath = '/src/api/client.ts'
        const { createApiClient } = await import(modulePath)
        const { accessToken } = await createApiClient().post('/auth/login', {
          email: account.email,
          password: account.password,
        })
        return createApiClient({ getAccessToken: () => accessToken }).get(
          `/lists/${seeded.columnId}/cards`,
        )
      },
      { account, seeded },
    )
    expect(preserved).toEqual([seeded.card])
    await expect(
      page.getByRole('region', { name: 'Board columns', exact: true }).getByRole('listitem'),
    ).toHaveText([`${account.name} private task`, 'Keep this task during rename'])
    // F12: clear a description without changing the title, then edit and verify persistence.
    await page.getByRole('button', { name: 'Keep this task during rename', exact: true }).click()
    await expect(page.getByLabel('Description (optional)', { exact: true })).toHaveValue(
      'F22 dedicated data',
    )
    await page.getByLabel('Description (optional)', { exact: true }).fill('')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await page.getByRole('button', { name: 'Keep this task during rename', exact: true }).click()
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
      'Keep this task during rename',
    )
    await expect(page.getByLabel('Description (optional)', { exact: true })).toHaveValue('')
    await page.getByLabel('Title', { exact: true }).fill(`Edited by ${account.name}`)
    const description = '<img src=x onerror=alert(1)>\nPlain task description'
    await page.getByLabel('Description (optional)', { exact: true }).fill(description)
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(
      page.getByRole('button', { name: `Edited by ${account.name}`, exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await page.getByRole('button', { name: `Edited by ${account.name}`, exact: true }).click()
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(`Edited by ${account.name}`)
    await expect(page.getByLabel('Description (optional)', { exact: true })).toHaveValue(
      description,
    )
    await expect(page.getByRole('dialog').locator('img')).toHaveCount(0)
    await page.getByLabel('Title', { exact: true }).fill('Discarded edit')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await page.getByRole('button', { name: `Edited by ${account.name}`, exact: true }).click()
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(`Edited by ${account.name}`)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    // Keep the existing empty-column deletion check alongside populated columns.
    await page.getByRole('button', { name: 'New column', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill('Empty column')
    await page.getByRole('button', { name: 'Create column', exact: true }).click()
    await expect(
      page.getByRole('region', { name: 'Tasks in Empty column', exact: true }),
    ).toContainText('No tasks yet.')
    for (const title of [`Renamed by ${account.name}`, `${account.name} column`, 'Empty column']) {
      await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click()
      await expect(page.getByRole('dialog')).toContainText(
        'All its tasks will be permanently deleted.',
      )
      const deleted = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' && response.url().includes('/api/lists/'),
      )
      await page.getByRole('button', { name: 'Delete column', exact: true }).click()
      expect((await deleted).status()).toBe(204)
      await expect(page.getByRole('dialog')).toBeHidden()
    }
    await expect(page.getByText('No columns yet.', { exact: false })).toBeVisible()
    const removed = await page.evaluate(
      async ({ account, seeded }) => {
        const modulePath = '/src/api/client.ts'
        const { createApiClient } = await import(modulePath)
        const { accessToken } = await createApiClient().post('/auth/login', {
          email: account.email,
          password: account.password,
        })
        const client = createApiClient({ getAccessToken: () => accessToken })
        const cardResponse = await fetch(`/api/cards/${seeded.cardId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        return { columns: await client.get('/lists'), cardStatus: cardResponse.status }
      },
      { account, seeded },
    )
    expect(removed).toEqual({ columns: [], cardStatus: 404 })
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText(account.email, { exact: false })).toHaveCount(0)
    await expect(page.getByLabel('Password')).toHaveValue('')
  }
})

test('real UI registration followed by login, then a duplicate email gets the same answer', async ({
  page,
}) => {
  // CI uses controlled responses; the isolated runner creates a temporary account.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!realApi, 'Requires the real backend')
  const account = {
    name: 'F20 learner',
    email: `f20-${randomUUID()}@example.test`,
    password: `T1!${randomUUID().slice(0, 12)}`,
  }
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('status')).toHaveText(
    'If this email is available, your account has been created. You can now try to log in.',
  )
  await expect(page.getByLabel('Email')).toHaveValue(account.email)
  await expect(page.getByLabel('Password')).toHaveValue('')
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('Signed in as')).toContainText(account.email)
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Name', { exact: true }).fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('status')).toHaveText(
    'If this email is available, your account has been created. You can now try to log in.',
  )
})

test('a timed-out request releases loading and shows a useful error', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  await page.route('**/api/lists', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  const result = await page.evaluate(async () => {
    const clientPath = '/src/api/client.ts'
    const statePath = '/src/composables/useApiRequest.ts'
    const { createApiClient } = await import(clientPath)
    const { useApiRequest } = await import(statePath)
    const state = useApiRequest()
    const data = await state.execute(() => createApiClient({ timeout: 30 }).get('/lists'))
    return {
      loading: state.loading.value,
      kind: state.error.value?.kind,
      message: state.error.value?.message,
      noData: !data.ok,
    }
  })
  expect(result).toMatchObject({ loading: false, kind: 'unavailable', noData: true })
  expect(result.message).toContain('Check your connection')
})

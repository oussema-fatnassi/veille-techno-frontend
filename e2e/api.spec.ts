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
  expect(received).toEqual(
    realApi
      ? []
      : [
          { path: '/api/auth/login', authorization: undefined },
          { path: '/api/users/me', authorization: 'Bearer browser-test-token' },
        ],
  )
})

test('real account A logout then account B keeps identities separate', async ({ page }) => {
  // This opt-in check creates accounts in the local backend; CI uses controlled responses.
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
    for (const account of accounts) await createApiClient().post('/auth/register', account)
  }, accounts)
  for (const account of accounts) {
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/board$/)
    await expect(page.getByText('Signed in as')).toContainText(account.email)
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText(account.email, { exact: false })).toHaveCount(0)
    await expect(page.getByLabel('Password')).toHaveValue('')
  }
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

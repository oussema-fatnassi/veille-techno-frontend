import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { createApiClient } from '@/api/client'

const API = `${window.location.origin}/api`

describe('API client', () => {
  it('uses the API prefix once and sends the current token only on protected routes', async () => {
    let token = 'first-token'
    const authorizations: (string | null)[] = []
    server.use(
      http.all(`${API}/*`, ({ request }) => {
        authorizations.push(request.headers.get('Authorization'))
        return HttpResponse.json({ ok: true })
      }),
    )
    const client = createApiClient({ getAccessToken: () => token })
    await expect(client.get('/lists')).resolves.toEqual({ ok: true })
    token = 'second-token'
    await client.get('/users/me')
    await client.post('/auth/login', {})
    await client.post('/auth/register', {})
    expect(authorizations).toEqual(['Bearer first-token', 'Bearer second-token', null, null])
  })

  it('allows unauthenticated requests without inventing a token', async () => {
    server.use(
      http.get(`${API}/lists`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBeNull()
        return HttpResponse.json([])
      }),
    )
    await expect(createApiClient().get('/lists')).resolves.toEqual([])
  })

  it.each([
    'https://evil.test/lists',
    '//evil.test/lists',
    '/api/lists',
    '/api/api/lists',
    '/lists/../auth/login',
    '/lists?redirect=evil',
    '/lists%2f1',
    '/unknown',
    '/lists\\1',
  ])('rejects unsafe or unsupported destination %s', async (path) => {
    await expect(
      createApiClient({ getAccessToken: () => 'secret' }).get(path),
    ).rejects.toMatchObject({ kind: 'configuration' })
  })

  it('supports mutation bodies and empty 204 responses', async () => {
    server.use(
      http.post(`${API}/lists/1/cards`, async ({ request }) =>
        HttpResponse.json(await request.json(), { status: 201 }),
      ),
      http.patch(`${API}/cards/1`, async ({ request }) => HttpResponse.json(await request.json())),
      http.delete(`${API}/cards/1`, () => new HttpResponse(null, { status: 204 })),
    )
    const client = createApiClient()
    await expect(client.post('/lists/1/cards', { title: 'Task' })).resolves.toEqual({
      title: 'Task',
    })
    await expect(client.patch('/cards/1', { title: 'Updated' })).resolves.toEqual({
      title: 'Updated',
    })
    await expect(client.delete('/cards/1')).resolves.toBeUndefined()
  })

  it('notifies once for concurrent protected 401s and ignores public 401s and 403s', async () => {
    server.use(
      http.all(`${API}/*`, ({ request }) =>
        HttpResponse.json({}, { status: request.url.endsWith('/lists/1') ? 403 : 401 }),
      ),
    )
    const onUnauthorized = vi.fn<() => void>()
    let token = 'token-one'
    const client = createApiClient({ getAccessToken: () => token, onUnauthorized })
    await Promise.allSettled([client.get('/lists'), client.get('/users/me')])
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    await expect(client.post('/auth/login', {})).rejects.toMatchObject({
      message: 'Invalid credentials.',
    })
    await expect(client.get('/lists/1')).rejects.toMatchObject({ kind: 'forbidden' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    token = 'token-two'
    await expect(client.get('/lists')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalledTimes(2)
  })

  it('does not expire a newer session when an old request fails', async () => {
    let token = 'old-token'
    const onUnauthorized = vi.fn<() => void>()
    server.use(
      http.get(`${API}/lists`, () => {
        token = 'new-token'
        return HttpResponse.json({}, { status: 401 })
      }),
    )
    await expect(
      createApiClient({ getAccessToken: () => token, onUnauthorized }).get('/lists'),
    ).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('normalizes network failures and never retries a mutation', async () => {
    let calls = 0
    server.use(
      http.post(`${API}/lists`, () => {
        calls++
        return HttpResponse.error()
      }),
    )
    await expect(createApiClient().post('/lists', { title: 'Task' })).rejects.toMatchObject({
      kind: 'unavailable',
    })
    expect(calls).toBe(1)
  })

  it('rejects an HTML fallback page instead of presenting it as API data', async () => {
    server.use(http.get(`${API}/lists`, () => HttpResponse.html('<h1>App</h1>')))
    await expect(createApiClient().get('/lists')).rejects.toMatchObject({
      kind: 'configuration',
      message: expect.stringContaining('forwarded to the backend'),
    })
  })

  it('supports cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      createApiClient().get('/lists', { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
  })
})

import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { login } from '@/api/auth'

const API = `${window.location.origin}/api`

const credentials = {
  email: 'student@example.com',
  password: 'Example123!',
}

describe('login API', () => {
  it('sends the credentials and returns the token', async () => {
    let receivedBody: unknown

    server.use(
      http.post(`${API}/auth/login`, async ({ request }) => {
        receivedBody = await request.json()

        return HttpResponse.json({
          accessToken: 'test-token',
        })
      }),
    )

    const response = await login(credentials)

    expect(receivedBody).toEqual(credentials)
    expect(response).toEqual({ accessToken: 'test-token' })
  })

  it('returns a generic error for invalid credentials', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )

    await expect(login(credentials)).rejects.toMatchObject({
      kind: 'unauthorized',
      message: 'Invalid credentials.',
    })
  })

  it.each([
    {},
    { accessToken: null },
    { accessToken: 123 },
    { accessToken: '' },
    { accessToken: '   ' },
  ])('rejects an invalid login response: %j', async (body) => {
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.json(body)))

    await expect(login(credentials)).rejects.toMatchObject({
      kind: 'unknown',
      message: 'The login response is invalid. Please try again.',
    })
  })
})

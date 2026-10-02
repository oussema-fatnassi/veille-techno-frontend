import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { login, register } from '@/api/auth'

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

describe('registration API', () => {
  it('returns the message from a 202 response without expecting a user or token', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        HttpResponse.json({ message: 'Registration request accepted.' }, { status: 202 }),
      ),
    )
    await expect(register({ ...credentials, name: 'Learner' })).resolves.toEqual({
      message: 'Registration request accepted.',
    })
  })

  it.each([null, {}, { message: null }, { message: 123 }, { message: '' }, { message: '   ' }])(
    'rejects a malformed registration response: %j',
    async (body) => {
      server.use(http.post(`${API}/auth/register`, () => HttpResponse.json(body, { status: 202 })))
      await expect(register({ ...credentials, name: 'Learner' })).rejects.toMatchObject({
        kind: 'unknown',
        message: 'The registration response is invalid. Please try again.',
      })
    },
  )
})

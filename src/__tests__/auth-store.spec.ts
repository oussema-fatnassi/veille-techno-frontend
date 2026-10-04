import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { useAuthStore } from '@/stores/auth'

const API = `${window.location.origin}/api`

const credentials = {
  email: 'student@example.com',
  password: 'Example123!',
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts without an authenticated session', () => {
    const auth = useAuthStore()

    expect(auth.accessToken).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('saves the token after a successful login', async () => {
    server.use(
      http.post(`${API}/auth/login`, () => HttpResponse.json({ accessToken: 'test-token' })),
    )

    const auth = useAuthStore()

    await auth.signIn(credentials)

    expect(auth.accessToken).toBe('test-token')
    expect(auth.isAuthenticated).toBe(true)
  })

  it('stays unauthenticated when login fails', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )

    const auth = useAuthStore()

    await expect(auth.signIn(credentials)).rejects.toMatchObject({
      kind: 'unauthorized',
    })

    expect(auth.accessToken).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('removes the token when clearing the session', () => {
    const auth = useAuthStore()
    auth.accessToken = 'test-token'

    auth.clearSession()

    expect(auth.accessToken).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })
})

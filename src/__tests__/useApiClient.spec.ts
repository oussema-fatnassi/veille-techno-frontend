import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { useAuthStore } from '@/stores/auth'
import { useApiClient } from '@/composables/useApiClient'

const API = `${window.location.origin}/api`

describe('authenticated API client', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('uses the saved token and stops sending it after clearing the session', async () => {
    const authorizations: (string | null)[] = []

    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ accessToken: 'test-token' }),
      ),
      http.get(`${API}/users/me`, ({ request }) => {
        authorizations.push(request.headers.get('Authorization'))

        return HttpResponse.json({ id: 1 })
      }),
    )

    const auth = useAuthStore()
    const api = useApiClient()

    await api.get('/users/me')

    await auth.signIn({
      email: 'student@example.com',
      password: 'Example123!',
    })

    await api.get('/users/me')

    auth.clearSession()

    await api.get('/users/me')

    expect(authorizations).toEqual([
      null,
      'Bearer test-token',
      null,
    ])
  })
})

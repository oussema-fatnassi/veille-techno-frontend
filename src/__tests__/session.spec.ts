import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { useAuthStore } from '@/stores/auth'
import { useApiClient } from '@/composables/useApiClient'
import { routes } from '@/router'
import { installSessionNavigation } from '@/router/session'
import App from '@/App.vue'

const API = `${window.location.origin}/api`
const profile = { id: 1, name: 'Account A', email: 'a@example.com' }
const credentials = { email: 'a@example.com', password: 'Password123!' }
const cleanups: (() => void)[] = []

beforeEach(() => {
  setActivePinia(createPinia())
  server.use(
    http.post(`${API}/auth/login`, () => HttpResponse.json({ accessToken: 'token' })),
    http.get(`${API}/users/me`, () => HttpResponse.json(profile)),
  )
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

async function mountBoard() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'token'
  const router = createRouter({ history: createMemoryHistory(), routes })
  cleanups.push(installSessionNavigation(router, pinia))
  await router.push('/board')
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })
  return { auth, router, wrapper }
}

describe('session isolation', () => {
  it('loads identity and clears all stored private state on logout', async () => {
    const auth = useAuthStore()
    await auth.signIn(credentials)
    await auth.loadProfile()
    expect(auth.profile).toEqual(profile)
    const version = auth.sessionVersion
    auth.clearSession()
    expect(auth.profile).toBeNull()
    expect(auth.accessToken).toBeNull()
    expect(auth.sessionVersion).toBe(version + 1)
    expect(auth.sessionMessage).toBe('')
  })

  it('expires once for simultaneous protected 401s, even across clients', async () => {
    const auth = useAuthStore()
    await auth.signIn(credentials)
    await auth.loadProfile()
    server.use(http.get(`${API}/users/me`, () => HttpResponse.json({}, { status: 401 })))
    const version = auth.sessionVersion
    await Promise.allSettled([useApiClient().get('/users/me'), useApiClient().get('/users/me')])
    auth.expireSession()
    expect(auth.sessionVersion).toBe(version + 1)
    expect(auth.profile).toBeNull()
    expect(auth.accessToken).toBeNull()
    expect(auth.sessionMessage).toBe('Your session has expired. Please log in again.')
    await auth.signIn(credentials)
    expect(auth.sessionMessage).toBe('')
  })

  it('handles another expiration when a later session receives the same token', async () => {
    const auth = useAuthStore()
    const client = useApiClient()
    server.use(http.get(`${API}/users/me`, () => HttpResponse.json({}, { status: 401 })))
    await auth.signIn(credentials)
    await expect(client.get('/users/me')).rejects.toMatchObject({ status: 401 })
    await auth.signIn(credentials)
    await expect(client.get('/users/me')).rejects.toMatchObject({ status: 401 })
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.sessionMessage).toContain('expired')
  })

  it.each([200, 401, 500])('ignores a late %s response from a previous session', async (status) => {
    const auth = useAuthStore()
    auth.accessToken = 'same-token'
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    server.use(
      http.get(`${API}/users/me`, async () => {
        started = true
        await pending
        return HttpResponse.json(profile, { status })
      }),
    )
    const result = auth.loadProfile().catch((error: unknown) => error)
    try {
      await vi.waitFor(() => expect(started).toBe(true))
      auth.clearSession()
      // Even a reused token must not make an old request current again.
      auth.accessToken = 'same-token'
      auth.profile = { id: 2, name: 'Account B', email: 'b@example.com' }
    } finally {
      release()
    }
    expect(await result).toMatchObject({ kind: 'cancelled' })
    expect(auth.profile?.name).toBe('Account B')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.sessionMessage).toBe('')
  })

  it('does not restore a session when a login completes after logout', async () => {
    const auth = useAuthStore()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    server.use(
      http.post(`${API}/auth/login`, async () => {
        started = true
        await pending
        return HttpResponse.json({ accessToken: 'late-token' })
      }),
    )
    const result = auth.signIn(credentials).catch((error: unknown) => error)
    try {
      await vi.waitFor(() => expect(started).toBe(true))
      auth.clearSession()
    } finally {
      release()
    }
    expect(await result).toMatchObject({ kind: 'cancelled' })
    expect(auth.isAuthenticated).toBe(false)
  })
})

describe('protected screen', () => {
  it('loads the identity, logs out, and blocks Back navigation', async () => {
    const { wrapper, auth, router } = await mountBoard()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Account A'))
    await router.push('/missing')
    await router.push('/board')
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(auth.profile).toBeNull()
    expect(wrapper.text()).not.toContain('Account A')
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/missing'))
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(wrapper.text()).not.toContain('My board')
  })

  it('shows one expiration message and removes private content on 401', async () => {
    server.use(http.get(`${API}/users/me`, () => HttpResponse.json({}, { status: 401 })))
    const { wrapper, auth, router } = await mountBoard()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Your session has expired')
    expect(wrapper.text()).not.toContain('My board')
    expect(auth.isAuthenticated).toBe(false)
  })

  it('keeps the session after 403 and allows retry', async () => {
    server.use(http.get(`${API}/users/me`, () => HttpResponse.json({}, { status: 403 })))
    const { wrapper, auth, router } = await mountBoard()
    await vi.waitFor(() =>
      expect(wrapper.get('[role="alert"]').text()).toContain('do not have access'),
    )
    expect(auth.isAuthenticated).toBe(true)
    expect(router.currentRoute.value.name).toBe('board')
    server.use(http.get(`${API}/users/me`, () => HttpResponse.json(profile)))
    await wrapper.findAll('button')[0]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Account A'))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

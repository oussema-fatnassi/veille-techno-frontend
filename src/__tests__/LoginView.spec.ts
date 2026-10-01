import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { useAuthStore } from '@/stores/auth'
import LoginView from '../views/LoginView.vue'

const API = `${window.location.origin}/api`

async function mountLogin() {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/board', name: 'board', component: { template: '<h1>Board</h1>' } },
      { path: '/register', name: 'register', component: { template: '<h1>Register</h1>' } },
    ],
  })
  await router.push('/login')
  const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
  return { wrapper, router, auth: useAuthStore(pinia) }
}

// Validation tests stop at an API error so they can inspect the form after submission.
describe('login form validation', () => {
  beforeEach(() => {
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.json({}, { status: 401 })))
  })
  it('starts without errors and replaces browser popups with inline messages on submit', async () => {
    const { wrapper } = await mountLogin()
    expect(wrapper.get('form').attributes()).toHaveProperty('novalidate')
    expect(wrapper.get('#email-error').text()).toBe('')
    expect(wrapper.get('#password-error').text()).toBe('')

    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('#email-error').text()).toBe('Email is required.')
    expect(wrapper.get('#password-error').text()).toBe('Password is required.')
    expect(wrapper.get('#email').attributes('aria-describedby')).toBe('email-error')
    expect(wrapper.get('#password').attributes('aria-invalid')).toBe('true')
  })

  it('explains invalid email format and clears errors as fields are corrected', async () => {
    const { wrapper } = await mountLogin()
    await wrapper.get('#email').setValue('invalid-email')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#email-error').text()).toContain('name@example.com')

    await wrapper.get('#email').setValue('name@example.com')
    await wrapper.get('#password').setValue('existing-password')

    expect(wrapper.get('#email-error').text()).toBe('')
    expect(wrapper.get('#password-error').text()).toBe('')
    expect(wrapper.get('#email').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('#email').attributes('aria-describedby')).toBeUndefined()
  })

  it.each(['name@localhost', 'name@example.c', 'name..surname@example.com'])(
    'rejects %s using the backend email rules',
    async (email) => {
      const { wrapper } = await mountLogin()
      await wrapper.get('#email').setValue(email)
      await wrapper.get('form').trigger('submit')
      expect(wrapper.get('#email-error').text()).toContain('Enter a valid email address')
    },
  )

  it.each(['name+board@example.com', 'élise@example.com'])(
    'accepts %s using the backend email rules',
    async (email) => {
      const { wrapper } = await mountLogin()
      await wrapper.get('#email').setValue(email)
      await wrapper.get('#password').setValue('existing-password')
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
      expect(wrapper.get('#email-error').text()).toBe('')
    },
  )

  it('rejects blank email but does not apply registration strength rules to login passwords', async () => {
    const { wrapper } = await mountLogin()
    await wrapper.get('#email').setValue('   ')
    await wrapper.get('#password').setValue('a')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#email-error').text()).toBe('Email is required.')
    expect(wrapper.get('#password-error').text()).toBe('')

    await wrapper.get('#email').setValue('name@example.com')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.get('#email-error').text()).toBe('')
  })
})

async function fillCredentials(wrapper: Awaited<ReturnType<typeof mountLogin>>['wrapper']) {
  await wrapper.get('#email').setValue('student@example.com')
  await wrapper.get('#password').setValue('Example123!')
}

describe('login submission', () => {
  it('saves the token, clears the password, and replaces the login route on success', async () => {
    let receivedBody: unknown
    server.use(
      http.post(`${API}/auth/login`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ accessToken: 'test-token' })
      }),
    )
    const { wrapper, router, auth } = await mountLogin()
    const replace = vi.spyOn(router, 'replace')
    await fillCredentials(wrapper)
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('board'))
    expect(receivedBody).toEqual({ email: 'student@example.com', password: 'Example123!' })
    expect(auth.accessToken).toBe('test-token')
    expect((wrapper.get('#password').element as HTMLInputElement).value).toBe('')
    expect(replace).toHaveBeenCalledWith({ name: 'board' })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it.each([
    ['unknown account', 401, 'User not found', 'Invalid credentials.'],
    ['wrong password', 401, 'Wrong password', 'Invalid credentials.'],
    ['invalid request', 400, 'Check the entered values.', 'Check the entered values.'],
    ['server failure', 500, 'Internal error', 'Cannot reach the service.'],
    ['network failure', 0, '', 'Cannot reach the service.'],
  ])('shows an error and allows retry after %s', async (_label, status, message, expected) => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        status === 0 ? HttpResponse.error() : HttpResponse.json({ message }, { status }),
      ),
    )
    const { wrapper, router, auth } = await mountLogin()
    await fillCredentials(wrapper)
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain(expected))
    expect(router.currentRoute.value.name).toBe('login')
    expect(auth.isAuthenticated).toBe(false)
    expect((wrapper.get('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(false)

    server.use(
      http.post(`${API}/auth/login`, () => HttpResponse.json({ accessToken: 'retry-token' })),
    )
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('board'))
    expect(auth.accessToken).toBe('retry-token')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('does not send a request when fields are invalid', async () => {
    const request = vi.fn<() => Response>(() => HttpResponse.json({ accessToken: 'unexpected' }))
    server.use(http.post(`${API}/auth/login`, request))
    const { wrapper, router, auth } = await mountLogin()
    await wrapper.get('form').trigger('submit')
    await wrapper.get('#email').setValue('invalid-email')
    await wrapper.get('#password').setValue('Example123!')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('#email-error').text()).toContain('Enter a valid email')
    expect(request).not.toHaveBeenCalled()
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('disables the button and ignores repeated submissions while login is pending', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const request = vi.fn<() => Promise<Response>>(async () => {
      await pending
      return HttpResponse.json({ accessToken: 'test-token' })
    })
    server.use(http.post(`${API}/auth/login`, request))
    const { wrapper, router } = await mountLogin()
    await fillCredentials(wrapper)
    try {
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
      expect(wrapper.get('button[type="submit"]').text()).toContain('Logging in')
      expect((wrapper.get('button[type="submit"]').element as HTMLButtonElement).disabled).toBe(
        true,
      )
      await wrapper.get('form').trigger('submit')
      await wrapper.get('form').trigger('submit')
      expect(router.currentRoute.value.name).toBe('login')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('board'))
    expect(request).toHaveBeenCalledTimes(1)
  })
})

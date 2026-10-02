import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { useAuthStore } from '@/stores/auth'
import { routes } from '@/router'
import App from '@/App.vue'

const API = `${window.location.origin}/api`
const credentials = { name: 'Learner', email: 'learner@example.com', password: 'Learning1!' }

async function mountRegistration() {
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/register')
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  return { wrapper, router, auth: useAuthStore(pinia) }
}

async function fillForm(wrapper: Awaited<ReturnType<typeof mountRegistration>>['wrapper']) {
  await wrapper.get('#name').setValue(credentials.name)
  await wrapper.get('#email').setValue(credentials.email)
  await wrapper.get('#password').setValue(credentials.password)
}

describe('registration form', () => {
  it('shows missing fields, checks invalid values, and clears corrected errors', async () => {
    const { wrapper } = await mountRegistration()
    await wrapper.get('#name').setValue('Draft')
    await wrapper.get('#email').setValue('draft')
    await wrapper.get('#password').setValue('draft')
    expect(wrapper.get('#name-error').text()).toBe('')
    expect(wrapper.get('#email-error').text()).toBe('')
    expect(wrapper.get('#password-error').text()).toBe('')
    await wrapper.get('#name').setValue('')
    await wrapper.get('#email').setValue('')
    await wrapper.get('#password').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#name-error').text()).toBe('Name is required.')
    expect(wrapper.get('#email-error').text()).toBe('Email is required.')
    expect(wrapper.get('#password-error').text()).toBe('Password is required.')
    expect(document.activeElement?.id).toBe('name')
    await wrapper.get('#name').setValue('a'.repeat(33))
    expect(wrapper.get('#name-error').text()).toContain('32')
    await wrapper.get('#name').setValue('Learner')
    await wrapper.get('#email').setValue('invalid')
    await wrapper.get('form').trigger('submit')
    expect(document.activeElement?.id).toBe('email')
    expect(wrapper.get('#email-error').text()).toContain('valid email')
    await wrapper.get('#email').setValue('learner@example.com')
    await wrapper.get('#password').setValue('weak')
    await wrapper.get('form').trigger('submit')
    expect(document.activeElement?.id).toBe('password')
    expect(wrapper.get('#password-error').text()).toContain('8 to 20')
    await wrapper.get('#password').setValue('Learning1!')
    expect(wrapper.get('#name-error').text()).toBe('')
    expect(wrapper.get('#email-error').text()).toBe('')
    expect(wrapper.get('#password-error').text()).toBe('')
  })
})

describe('registration submission', () => {
  it('sends the fields, confirms creation, and prefills login without creating a session', async () => {
    let received: unknown
    server.use(
      http.post(`${API}/auth/register`, async ({ request }) => {
        received = await request.json()
        expect(request.headers.get('Authorization')).toBeNull()
        return HttpResponse.json({ message: 'Accepted' }, { status: 202 })
      }),
    )
    const { wrapper, router, auth } = await mountRegistration()
    await fillForm(wrapper)
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(received).toEqual(credentials)
    expect(wrapper.get('[role="status"]').text()).toBe(
      'If this email is available, your account has been created. You can now try to log in.',
    )
    expect((wrapper.get('#email').element as HTMLInputElement).value).toBe(credentials.email)
    expect((wrapper.get('#password').element as HTMLInputElement).value).toBe('')
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.registrationEmail).toBeNull()
    await router.push('/register')
    await router.push('/login')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it.each([
    [429, 'ThrottlerException', 'Too many attempts. Try again in a minute.'],
    [
      400,
      ['name must be shorter', 'email must be an email'],
      'name must be shorter email must be an email',
    ],
    [500, 'Internal error', 'Cannot reach the service.'],
    [0, '', 'Cannot reach the service.'],
  ])(
    'shows a recoverable error for status %s and allows retry',
    async (status, message, expected) => {
      server.use(
        http.post(`${API}/auth/register`, () =>
          status === 0 ? HttpResponse.error() : HttpResponse.json({ message }, { status }),
        ),
      )
      const { wrapper, router, auth } = await mountRegistration()
      await fillForm(wrapper)
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain(expected))
      expect(router.currentRoute.value.name).toBe('register')
      expect(auth.isAuthenticated).toBe(false)
      expect(auth.registrationEmail).toBeNull()
      expect((wrapper.get('button').element as HTMLButtonElement).disabled).toBe(false)
      server.use(
        http.post(`${API}/auth/register`, () =>
          HttpResponse.json({ message: 'Accepted' }, { status: 202 }),
        ),
      )
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    },
  )

  it('does not submit invalid fields', async () => {
    const request = vi.fn<() => Response>(() => HttpResponse.json({}, { status: 202 }))
    server.use(http.post(`${API}/auth/register`, request))
    const { wrapper } = await mountRegistration()
    await wrapper.get('form').trigger('submit')
    await fillForm(wrapper)
    await wrapper.get('#password').setValue('weak')
    await wrapper.get('form').trigger('submit')
    expect(request).not.toHaveBeenCalled()
    expect(wrapper.get('#password-error').text()).toContain('8 to 20')
  })

  it('blocks duplicate submissions and uses the email that was actually submitted', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const request = vi.fn<() => Promise<Response>>(async () => {
      await pending
      return HttpResponse.json({ message: 'Accepted' }, { status: 202 })
    })
    server.use(http.post(`${API}/auth/register`, request))
    const { wrapper, router } = await mountRegistration()
    await fillForm(wrapper)
    try {
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
      expect((wrapper.get('button').element as HTMLButtonElement).disabled).toBe(true)
      await wrapper.get('#email').setValue('edited@example.com')
      await wrapper.get('form').trigger('submit')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(request).toHaveBeenCalledTimes(1)
    expect((wrapper.get('#email').element as HTMLInputElement).value).toBe(credentials.email)
  })

  it('cancels a pending registration when leaving the page', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    server.use(
      http.post(`${API}/auth/register`, async () => {
        started = true
        await pending
        return HttpResponse.json({ message: 'Accepted' }, { status: 202 })
      }),
    )
    const { wrapper, router, auth } = await mountRegistration()
    await fillForm(wrapper)
    try {
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(started).toBe(true))
      await router.push('/login')
    } finally {
      release()
    }
    expect(auth.registrationEmail).toBeNull()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('login')
  })
})

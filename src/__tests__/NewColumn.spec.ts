import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { useAuthStore } from '@/stores/auth'
import BoardColumns from '@/components/board/BoardColumns.vue'

const API = `${window.location.origin}/api`
const existing = [
  { id: 1, title: 'First', position: 3 },
  { id: 2, title: 'Last', position: 10 },
]
beforeEach(() => {
  server.use(http.get(`${API}/lists`, () => HttpResponse.json(existing)))
})
async function openForm() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'token'
  const wrapper = mount(BoardColumns, {
    attachTo: document.body,
    global: { plugins: [pinia], stubs: { teleport: true } },
  })
  await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(existing.length))
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'New column')!
    .trigger('click')
  await flushPromises()
  return { wrapper, auth }
}

describe('new column', () => {
  it('normalizes the title, appends after the highest position, and uses the server ID', async () => {
    let body: unknown
    server.use(
      http.post(`${API}/lists`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: 42, title: 'Review', position: 11 }, { status: 201 })
      }),
    )
    const { wrapper } = await openForm()
    await wrapper.get('#column-title').setValue('  Review  ')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(3))
    expect(body).toEqual({ title: 'Review', position: 11 })
    expect(wrapper.get('#column-42').text()).toBe('Review')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it.each(['', '   ', 'a'.repeat(101)])(
    'rejects invalid title %j without requesting creation',
    async (title) => {
      const request = vi.fn<() => Response>(() => HttpResponse.json({}))
      server.use(http.post(`${API}/lists`, request))
      const { wrapper } = await openForm()
      await wrapper.get('#column-title').setValue(title)
      await wrapper.get('form').trigger('submit')
      expect(wrapper.get('#column-title-error').text()).not.toBe('')
      expect(document.activeElement?.id).toBe('column-title')
      expect(request).not.toHaveBeenCalled()
      await wrapper.get('#column-title').setValue('Corrected')
      expect(wrapper.get('#column-title-error').text()).toBe('')
    },
  )

  it('cancel sends nothing and clears the draft before reopening', async () => {
    const request = vi.fn<() => Response>(() => HttpResponse.json({}))
    server.use(http.post(`${API}/lists`, request))
    const { wrapper } = await openForm()
    await wrapper.get('#column-title').setValue('Draft')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!
      .trigger('click')
    expect(request).not.toHaveBeenCalled()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'New column')!
      .trigger('click')
    await flushPromises()
    expect((wrapper.get('#column-title').element as HTMLInputElement).value).toBe('')
  })

  it.each([400, 403, 500, 0])(
    'retains input after %s without adding a phantom column',
    async (status) => {
      server.use(
        http.post(`${API}/lists`, () =>
          status
            ? HttpResponse.json({ message: 'Invalid column' }, { status })
            : HttpResponse.error(),
        ),
      )
      const { wrapper } = await openForm()
      await wrapper.get('#column-title').setValue('Draft')
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
      expect((wrapper.get('#column-title').element as HTMLInputElement).value).toBe('Draft')
      await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(2))
      expect(wrapper.find('#column-42').exists()).toBe(false)
    },
  )

  it('refetches on an uncertain failure and uses updated positions on a deliberate retry', async () => {
    let calls = 0
    let saved = false
    server.use(
      http.get(`${API}/lists`, () =>
        HttpResponse.json(
          saved ? [...existing, { id: 42, title: 'Saved remotely', position: 20 }] : existing,
        ),
      ),
      http.post(`${API}/lists`, async ({ request }) => {
        calls++
        if (calls === 1) {
          saved = true
          return HttpResponse.error()
        }
        expect(await request.json()).toEqual({ title: 'Another', position: 21 })
        return HttpResponse.json({ id: 43, title: 'Another', position: 21 }, { status: 201 })
      }),
    )
    const { wrapper } = await openForm()
    await wrapper.get('#column-title').setValue('Saved remotely')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(3))
    expect(calls).toBe(1)
    expect(wrapper.text()).toContain('may have reached the server')
    await wrapper.get('#column-title').setValue('Another')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(4))
    expect(calls).toBe(2)
  })

  it('blocks duplicate submissions and closing while a save is pending', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const request = vi.fn<() => Promise<Response>>(async () => {
      await pending
      return HttpResponse.json({ id: 42, title: 'Draft', position: 11 }, { status: 201 })
    })
    server.use(http.post(`${API}/lists`, request))
    const { wrapper } = await openForm()
    await wrapper.get('#column-title').setValue('Draft')
    try {
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
      expect(wrapper.find('[aria-label="Close"]').exists()).toBe(false)
      expect(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'Cancel')!
          .attributes(),
      ).toHaveProperty('disabled')
      await wrapper.get('form').trigger('submit')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(3))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('clears the dialog and draft when the session expires during submission', async () => {
    server.use(http.post(`${API}/lists`, () => HttpResponse.json({}, { status: 401 })))
    const { wrapper, auth } = await openForm()
    await wrapper.get('#column-title').setValue('Private draft')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('h3')).toHaveLength(0)
  })
})

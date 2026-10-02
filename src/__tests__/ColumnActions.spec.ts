import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { useAuthStore } from '@/stores/auth'
import BoardColumns from '@/components/board/BoardColumns.vue'

const API = `${window.location.origin}/api`
const original = { id: 1, title: 'Todo', position: 7 }
beforeEach(() => {
  server.use(http.get(`${API}/lists`, () => HttpResponse.json([{ ...original }])))
})
async function openForm(action: 'rename' | 'delete' = 'rename') {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'token'
  const wrapper = mount(BoardColumns, {
    attachTo: document.body,
    global: { plugins: [pinia], stubs: { teleport: true } },
  })
  await vi.waitFor(() => expect(wrapper.find('h3').exists()).toBe(true))
  await wrapper
    .get(`[aria-label="${action === 'rename' ? 'Rename' : 'Delete'} Todo"]`)
    .trigger('click')
  await flushPromises()
  return { wrapper, auth }
}

describe('column actions', () => {
  it('renames using only a trimmed title and preserves the column identity and position', async () => {
    let body: unknown
    server.use(
      http.patch(`${API}/lists/1`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...original, title: 'Review' })
      }),
    )
    const { wrapper } = await openForm()
    expect((wrapper.get('#rename-column-title').element as HTMLInputElement).value).toBe('Todo')
    await wrapper.get('#rename-column-title').setValue('  Review  ')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.get('#column-1').text()).toBe('Review'))
    expect(body).toEqual({ title: 'Review' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it.each(['', '   ', 'a'.repeat(101)])('rejects invalid title %j locally', async (title) => {
    const request = vi.fn<() => Response>(() => HttpResponse.json(original))
    server.use(http.patch(`${API}/lists/1`, request))
    const { wrapper } = await openForm()
    await wrapper.get('#rename-column-title').setValue(title)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#rename-column-title-error').text()).not.toBe('')
    expect(document.activeElement?.id).toBe('rename-column-title')
    expect(request).not.toHaveBeenCalled()
    await wrapper.get('#rename-column-title').setValue('Corrected')
    expect(wrapper.get('#rename-column-title-error').text()).toBe('')
  })

  for (const action of ['rename', 'delete'] as const) {
    const method = action === 'rename' ? http.patch : http.delete

    it(`${action}: cancellation sends nothing and leaves the board unchanged`, async () => {
      const request = vi.fn<() => Response>(() => new HttpResponse(null, { status: 204 }))
      server.use(method(`${API}/lists/1`, request))
      const { wrapper } = await openForm(action)
      if (action === 'rename') await wrapper.get('#rename-column-title').setValue('Draft')
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Cancel')!
        .trigger('click')
      expect(request).not.toHaveBeenCalled()
      expect(wrapper.get('h3').text()).toBe('Todo')
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    })

    it.each([400, 403, 500, 0])(
      `${action}: handles error %s without false success`,
      async (status) => {
        server.use(
          method(`${API}/lists/1`, () =>
            status ? HttpResponse.json({ message: 'Rejected' }, { status }) : HttpResponse.error(),
          ),
        )
        const { wrapper } = await openForm(action)
        if (action === 'rename') await wrapper.get('#rename-column-title').setValue('Draft')
        await wrapper.get('form').trigger('submit')
        await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
        await vi.waitFor(() => expect(wrapper.find('h3').exists()).toBe(true))
        expect(wrapper.get('h3').text()).toBe('Todo')
        expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
        expect(wrapper.element.querySelector('input')?.value).toBe(
          action === 'rename' ? 'Draft' : undefined,
        )
      },
    )

    it(`${action}: a 404 reload removes stale data and disables further submission`, async () => {
      const { wrapper } = await openForm(action)
      server.use(
        method(`${API}/lists/1`, () => HttpResponse.json({}, { status: 404 })),
        http.get(`${API}/lists`, () => HttpResponse.json([])),
      )
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.text()).toContain('no longer available'))
      expect(wrapper.findAll('h3')).toHaveLength(0)
      expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })

    it(`${action}: session expiry clears the dialog and private board`, async () => {
      server.use(method(`${API}/lists/1`, () => HttpResponse.json({}, { status: 401 })))
      const { wrapper, auth } = await openForm(action)
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
      expect(wrapper.findAll('h3')).toHaveLength(0)
    })

    it(`${action}: blocks repeated submits while pending`, async () => {
      let release!: () => void
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      const request = vi.fn<() => Promise<Response>>(async () => {
        await pending
        return action === 'rename'
          ? HttpResponse.json({ ...original, title: 'Saved' })
          : new HttpResponse(null, { status: 204 })
      })
      server.use(method(`${API}/lists/1`, request))
      const { wrapper } = await openForm(action)
      try {
        await wrapper.get('form').trigger('submit')
        await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
        expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')
        expect(wrapper.find('[aria-label="Close"]').exists()).toBe(false)
        await wrapper.get('form').trigger('submit')
      } finally {
        release()
      }
      await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
      expect(request).toHaveBeenCalledTimes(1)
    })
  }

  it('names the column and warns about permanent task deletion before accepting 204', async () => {
    server.use(http.delete(`${API}/lists/1`, () => new HttpResponse(null, { status: 204 })))
    const { wrapper } = await openForm('delete')
    expect(wrapper.text()).toContain('Delete “Todo”? All its tasks will be permanently deleted.')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('No columns yet'))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('reconciles a write that reached the server and lets the user retry a failed reload', async () => {
    const { wrapper } = await openForm()
    server.use(
      http.patch(`${API}/lists/1`, () => HttpResponse.error()),
      http.get(`${API}/lists`, () => HttpResponse.json({}, { status: 500 })),
    )
    await wrapper.get('#rename-column-title').setValue('Saved remotely')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Could not reload the board'))
    expect(wrapper.findAll('h3')).toHaveLength(0)
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')
    server.use(
      http.get(`${API}/lists`, () => HttpResponse.json([{ ...original, title: 'Saved remotely' }])),
    )
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reload board')!
      .trigger('click')
    await vi.waitFor(() => expect(wrapper.find('h3').exists()).toBe(true))
    expect(wrapper.get('h3').text()).toBe('Saved remotely')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('button[type="submit"]').attributes()).not.toHaveProperty('disabled')
  })
})

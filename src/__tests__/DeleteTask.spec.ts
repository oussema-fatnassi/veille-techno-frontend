import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import ColumnTasks from '@/components/board/ColumnTasks.vue'
import { useAuthStore } from '@/stores/auth'

const API = `${window.location.origin}/api`
const task = { id: 1, title: 'Remove this task', description: '', position: 0, listId: 1 }
const other = { ...task, id: 2, title: 'Keep this task', position: 1 }
beforeEach(() => {
  server.use(
    http.get(`${API}/lists/1/cards`, () => HttpResponse.json([task, other])),
    http.get(`${API}/cards/1`, () => HttpResponse.json(task)),
  )
})
async function openConfirmation() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'token'
  const wrapper = mount(ColumnTasks, {
    props: { columnId: 1, columnTitle: 'Todo' },
    attachTo: document.body,
    global: { plugins: [pinia], stubs: { teleport: true } },
  })
  await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))
  await wrapper.get('li button').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('#task-title').exists()).toBe(true))
  await wrapper.get('#task-title').setValue('Unsaved title')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Delete task')!
    .trigger('click')
  await flushPromises()
  const confirm = () => wrapper.findAll('button').find((button) => button.text() === 'Delete task')!
  return { wrapper, auth, confirm }
}

describe('task deletion', () => {
  it('names the saved task, focuses Cancel, and cancellation sends no request or discards the edit draft', async () => {
    const request = vi.fn<() => Response>(() => new HttpResponse(null, { status: 204 }))
    server.use(http.delete(`${API}/cards/1`, request))
    const { wrapper } = await openConfirmation()
    expect(wrapper.text()).toContain(
      'Permanently delete “Remove this task”? This cannot be undone.',
    )
    expect(document.activeElement?.textContent).toBe('Cancel')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!
      .trigger('click')
    expect((wrapper.get('#task-title').element as HTMLInputElement).value).toBe('Unsaved title')
    expect(document.activeElement?.id).toBe('task-title')
    expect(request).not.toHaveBeenCalled()
    expect(wrapper.findAll('li')).toHaveLength(2)
  })

  it('accepts an empty 204 and removes only the selected task', async () => {
    server.use(http.delete(`${API}/cards/1`, () => new HttpResponse(null, { status: 204 })))
    const { wrapper, confirm } = await openConfirmation()
    await confirm().trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['Keep this task'])
  })

  it('retains the task and session after 403 without refetching or claiming success', async () => {
    let reads = 0
    server.use(
      http.get(`${API}/cards/1`, () => {
        reads++
        return HttpResponse.json(task)
      }),
      http.delete(`${API}/cards/1`, () => HttpResponse.json({}, { status: 403 })),
    )
    const { wrapper, auth, confirm } = await openConfirmation()
    await confirm().trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.get('[role="alert"]').text()).toContain('do not have access'),
    )
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(auth.isAuthenticated).toBe(true)
    expect(reads).toBe(1)
  })

  it('reports 404 and refreshes the column without leaving a stale task', async () => {
    const { wrapper, confirm } = await openConfirmation()
    const refresh = vi.fn<() => Response>(() => HttpResponse.json([other]))
    server.use(
      http.delete(`${API}/cards/1`, () => HttpResponse.json({}, { status: 404 })),
      http.get(`${API}/lists/1/cards`, refresh),
    )
    await confirm().trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('This task no longer exists.'))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(1))
    expect(wrapper.findAll('button').some((button) => button.text() === 'Delete task')).toBe(false)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!
      .trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('expires the session and clears private data on 401', async () => {
    server.use(http.delete(`${API}/cards/1`, () => HttpResponse.json({}, { status: 401 })))
    const { wrapper, auth, confirm } = await openConfirmation()
    await confirm().trigger('click')
    await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it.each([500, 0])(
    'checks the server after error %s before permitting an explicit retry',
    async (status) => {
      const { wrapper, confirm } = await openConfirmation()
      let release!: () => void
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      let checking = false
      let calls = 0
      server.use(
        http.delete(`${API}/cards/1`, () => {
          calls++
          return status ? HttpResponse.json({}, { status }) : HttpResponse.error()
        }),
        http.get(`${API}/cards/1`, async () => {
          checking = true
          await pending
          return HttpResponse.json(task)
        }),
      )
      try {
        await confirm().trigger('click')
        await vi.waitFor(() => expect(checking).toBe(true))
        expect(confirm().attributes()).toHaveProperty('disabled')
        expect(wrapper.findAll('li')).toHaveLength(2)
        expect(calls).toBe(1)
      } finally {
        release()
      }
      await vi.waitFor(() => expect(wrapper.text()).toContain('The task still exists.'))
      expect(confirm().attributes()).not.toHaveProperty('disabled')
      expect(calls).toBe(1)
      server.use(
        http.delete(`${API}/cards/1`, () => {
          calls++
          return new HttpResponse(null, { status: 204 })
        }),
      )
      await confirm().trigger('click')
      await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
      expect(calls).toBe(2)
    },
  )

  it('recognizes a deletion that reached the server without sending another DELETE', async () => {
    const { wrapper, confirm } = await openConfirmation()
    const request = vi.fn<() => Response>(() => HttpResponse.error())
    server.use(
      http.delete(`${API}/cards/1`, request),
      http.get(`${API}/cards/1`, () => HttpResponse.json({}, { status: 404 })),
      http.get(`${API}/lists/1/cards`, () => HttpResponse.json([other])),
    )
    await confirm().trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('This task no longer exists.'))
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(1))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps deletion disabled if verification fails and offers a safe check', async () => {
    const { wrapper, confirm } = await openConfirmation()
    const request = vi.fn<() => Response>(() => HttpResponse.error())
    server.use(
      http.delete(`${API}/cards/1`, request),
      http.get(`${API}/cards/1`, () => HttpResponse.json({}, { status: 500 })),
    )
    await confirm().trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain('Cannot reach'))
    await vi.waitFor(() =>
      expect(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'Check task')!
          .attributes(),
      ).not.toHaveProperty('disabled'),
    )
    expect(confirm().attributes()).toHaveProperty('disabled')
    server.use(http.get(`${API}/cards/1`, () => HttpResponse.json(task)))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Check task')!
      .trigger('click')
    await vi.waitFor(() => expect(confirm().attributes()).not.toHaveProperty('disabled'))
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('prevents repeated clicks and cancellation while deletion is pending', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const request = vi.fn<() => Promise<Response>>(async () => {
      await pending
      return new HttpResponse(null, { status: 204 })
    })
    server.use(http.delete(`${API}/cards/1`, request))
    const { wrapper, confirm } = await openConfirmation()
    try {
      await confirm().trigger('click')
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
      expect(confirm().attributes()).toHaveProperty('disabled')
      expect(wrapper.find('[aria-label="Close"]').exists()).toBe(false)
      expect(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'Cancel')!
          .attributes(),
      ).toHaveProperty('disabled')
      await confirm().trigger('click')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('ignores a late deletion result after account change', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    let returned = false
    server.use(
      http.delete(`${API}/cards/1`, async () => {
        started = true
        await pending
        returned = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { wrapper, auth, confirm } = await openConfirmation()
    try {
      await confirm().trigger('click')
      await vi.waitFor(() => expect(started).toBe(true))
      auth.clearSession()
      auth.accessToken = 'account-b'
    } finally {
      release()
    }
    await vi.waitFor(() => expect(returned).toBe(true))
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('li')).toHaveLength(0)
  })
})

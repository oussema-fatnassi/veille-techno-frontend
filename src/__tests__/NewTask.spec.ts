import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import BoardColumns from '@/components/board/BoardColumns.vue'
import { useAuthStore } from '@/stores/auth'
import { createTask } from '@/api/cards'
import { createApiClient } from '@/api/client'

const API = `${window.location.origin}/api`
const columns = [
  { id: 1, title: 'Todo', position: 0 },
  { id: 2, title: 'Done', position: 1 },
]
const tasks = [
  { id: 1, title: 'First', position: 3 },
  { id: 2, title: 'Last', position: 9 },
]
beforeEach(() => {
  server.use(
    http.get(`${API}/lists`, () => HttpResponse.json(columns)),
    http.get(`${API}/lists/1/cards`, () => HttpResponse.json(tasks)),
    http.get(`${API}/lists/2/cards`, () => HttpResponse.json([])),
  )
})
async function openForm(column = 'Todo') {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'token'
  const wrapper = mount(BoardColumns, {
    attachTo: document.body,
    global: { plugins: [pinia], stubs: { teleport: true } },
  })
  const selector = `[aria-label="New task in ${column}"]`
  await vi.waitFor(() => expect(wrapper.find(selector).exists()).toBe(true))
  await vi.waitFor(() => expect(wrapper.get(selector).attributes()).not.toHaveProperty('disabled'))
  await wrapper.get(selector).trigger('click')
  await flushPromises()
  return { wrapper, auth }
}

describe('new task', () => {
  it.each(['Todo', 'Done'])(
    'creates in %s using max position and the server ID, with optional description',
    async (column) => {
      const id = column === 'Todo' ? 1 : 2
      const position = id === 1 ? 10 : 0
      const description = id === 1 ? '<b>Plain text</b>\nTask details' : ''
      let payload: unknown
      server.use(
        http.post(`${API}/lists/${id}/cards`, async ({ request }) => {
          payload = await request.json()
          return HttpResponse.json(
            { id: 99, title: 'Server title', position, description, listId: id },
            { status: 201 },
          )
        }),
      )
      const { wrapper } = await openForm(column)
      await wrapper.get(`#new-task-title-${id}`).setValue('  New task  ')
      await wrapper.get(`#new-task-description-${id}`).setValue(description)
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() =>
        expect(wrapper.get(`[aria-label="Tasks in ${column}"]`).text()).toContain('Server title'),
      )
      expect(payload).toEqual({ title: 'New task', description, position })
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
      const otherColumn = column === 'Todo' ? 'Done' : 'Todo'
      expect(wrapper.get(`[aria-label="Tasks in ${otherColumn}"]`).text()).not.toContain(
        'Server title',
      )
      server.use(
        http.get(`${API}/cards/99`, () =>
          HttpResponse.json({
            id: 99,
            title: 'Server title',
            position,
            description,
            listId: id,
          }),
        ),
      )
      await wrapper
        .findAll('li button')
        .find((button) => button.text() === 'Server title')!
        .trigger('click')
      await vi.waitFor(() => expect(wrapper.find('#task-title').exists()).toBe(true))
      expect((wrapper.get('#task-title').element as HTMLInputElement).value).toBe('Server title')
      expect((wrapper.get('#task-description').element as HTMLTextAreaElement).value).toBe(
        description,
      )
    },
  )

  it.each(['', '   ', 'x'.repeat(101)])(
    'rejects invalid title %j without sending a request',
    async (title) => {
      const request = vi.fn<() => Response>(() => HttpResponse.json({}))
      server.use(http.post(`${API}/lists/1/cards`, request))
      const { wrapper } = await openForm()
      await wrapper.get('#new-task-title-1').setValue(title)
      await wrapper.get('form').trigger('submit')
      expect(wrapper.get('#new-task-title-1-error').text()).not.toBe('')
      expect(document.activeElement?.id).toBe('new-task-title-1')
      expect(request).not.toHaveBeenCalled()
      await wrapper.get('#new-task-title-1').setValue('Corrected')
      expect(wrapper.get('#new-task-title-1-error').text()).toBe('')
    },
  )

  it('cancel sends nothing and clears the draft on reopening', async () => {
    const request = vi.fn<() => Response>(() => HttpResponse.json({}))
    server.use(http.post(`${API}/lists/1/cards`, request))
    const { wrapper } = await openForm()
    await wrapper.get('#new-task-title-1').setValue('Draft')
    await wrapper.get('#new-task-description-1').setValue('Draft details')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!
      .trigger('click')
    expect(request).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="New task in Todo"]').trigger('click')
    await flushPromises()
    expect((wrapper.get('#new-task-title-1').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#new-task-description-1').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.findAll('li')).toHaveLength(2)
  })

  it.each([400, 403, 500, 0])(
    'retains the draft after error %s without a phantom task',
    async (status) => {
      server.use(
        http.post(`${API}/lists/1/cards`, () =>
          status
            ? HttpResponse.json({ message: 'Invalid title' }, { status })
            : HttpResponse.error(),
        ),
      )
      const { wrapper } = await openForm()
      await wrapper.get('#new-task-title-1').setValue('Draft')
      await wrapper.get('#new-task-description-1').setValue('Draft details')
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
      expect((wrapper.get('#new-task-title-1').element as HTMLInputElement).value).toBe('Draft')
      expect((wrapper.get('#new-task-description-1').element as HTMLTextAreaElement).value).toBe(
        'Draft details',
      )
      await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))
      expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['First', 'Last'])
    },
  )

  it('reports a deleted column and refreshes the board on 404', async () => {
    const { wrapper } = await openForm()
    server.use(
      http.post(`${API}/lists/1/cards`, () => HttpResponse.json({}, { status: 404 })),
      http.get(`${API}/lists`, () => HttpResponse.json([columns[1]])),
    )
    await wrapper.get('#new-task-title-1').setValue('Draft')
    await wrapper.get('#new-task-description-1').setValue('Draft details')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(wrapper.findAll('h3').map((heading) => heading.text())).toEqual(['Done']),
    )
    expect(wrapper.text()).toContain('The column “Todo” no longer exists.')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('expires the session on 401', async () => {
    server.use(http.post(`${API}/lists/1/cards`, () => HttpResponse.json({}, { status: 401 })))
    const { wrapper, auth } = await openForm()
    await wrapper.get('#new-task-title-1').setValue('Draft')
    await wrapper.get('#new-task-description-1').setValue('Draft details')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it('reloads after an uncertain write, recovers a failed refresh, and never automatically repeats POST', async () => {
    const { wrapper } = await openForm()
    let posts = 0
    server.use(
      http.post(`${API}/lists/1/cards`, () => {
        posts++
        return HttpResponse.error()
      }),
      http.get(`${API}/lists/1/cards`, () => HttpResponse.json({}, { status: 500 })),
    )
    await wrapper.get('#new-task-title-1').setValue('Saved remotely')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Could not reload the column'))
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')
    server.use(
      http.get(`${API}/lists/1/cards`, () =>
        HttpResponse.json([...tasks, { id: 99, title: 'Saved remotely', position: 20 }]),
      ),
    )
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reload tasks')!
      .trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(3))
    expect(posts).toBe(1)
    let payload: unknown
    server.use(
      http.post(`${API}/lists/1/cards`, async ({ request }) => {
        posts++
        payload = await request.json()
        return HttpResponse.json(
          { id: 100, title: 'Another', position: 21, listId: 1, description: '' },
          { status: 201 },
        )
      }),
    )
    await wrapper.get('#new-task-title-1').setValue('Another')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(4))
    expect(payload).toEqual({ title: 'Another', description: '', position: 21 })
    expect(posts).toBe(2)
  })

  it('blocks repeated submissions and cancellation while creating', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const request = vi.fn<() => Promise<Response>>(async () => {
      await pending
      return HttpResponse.json(
        { id: 99, title: 'Draft', position: 10, listId: 1, description: '' },
        { status: 201 },
      )
    })
    server.use(http.post(`${API}/lists/1/cards`, request))
    const { wrapper } = await openForm()
    await wrapper.get('#new-task-title-1').setValue('Draft')
    await wrapper.get('#new-task-description-1').setValue('Draft details')
    try {
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
      await wrapper.get('form').trigger('submit')
      expect(wrapper.find('[aria-label="Close"]').exists()).toBe(false)
      expect(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'Cancel')!
          .attributes(),
      ).toHaveProperty('disabled')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(3))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('ignores a creation response after account change', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    let returned = false
    server.use(
      http.post(`${API}/lists/1/cards`, async () => {
        started = true
        await pending
        returned = true
        return HttpResponse.json(
          { id: 99, title: 'Private A', description: '', listId: 1, position: 10 },
          { status: 201 },
        )
      }),
    )
    const { wrapper, auth } = await openForm()
    await wrapper.get('#new-task-title-1').setValue('Private A')
    try {
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(started).toBe(true))
      auth.clearSession()
      auth.accessToken = 'account-b'
    } finally {
      release()
    }
    await vi.waitFor(() => expect(returned).toBe(true))
    await flushPromises()
    expect(wrapper.findAll('li')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Private A')
  })
})

describe('task creation response', () => {
  it.each([null, {}, { id: 0 }, { id: 1, listId: 2 }, { id: 1, listId: 1, title: null }])(
    'rejects malformed or wrong-column response %j',
    async (body) => {
      server.use(http.post(`${API}/lists/1/cards`, () => HttpResponse.json(body, { status: 201 })))
      await expect(
        createTask(createApiClient(), 1, { title: 'Task', description: '', position: 0 }),
      ).rejects.toMatchObject({
        kind: 'unknown',
      })
    },
  )
})

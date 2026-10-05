import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { VueDraggable } from 'vue-draggable-plus'
import { server } from '../../tests/mocks/server'
import BoardColumns from '@/components/board/BoardColumns.vue'
import { useAuthStore } from '@/stores/auth'

const API = `${window.location.origin}/api`
let tasks: { id: number; title: string; description: string; position: number; listId: number }[]
let columns: { id: number; title: string; position: number }[]
let writes: unknown[]
let taskReads: number
beforeEach(() => {
  tasks = [
    { id: 10, title: 'Move me', description: 'Keep this', position: 0, listId: 1 },
    { id: 20, title: 'Existing', description: '', position: 7, listId: 2 },
  ]
  columns = [
    { id: 1, title: 'Todo', position: 0 },
    { id: 2, title: 'Doing', position: 1 },
    { id: 3, title: 'Done', position: 2 },
  ]
  writes = []
  taskReads = 0
  server.use(
    http.get(`${API}/lists`, () => HttpResponse.json(columns)),
    http.get(`${API}/lists/:id/cards`, ({ params }) => {
      taskReads++
      return HttpResponse.json(tasks.filter((task) => task.listId === Number(params.id)))
    }),
    http.patch(`${API}/cards/:id`, async ({ request, params }) => {
      const changes = (await request.json()) as { listId: number; position: number }
      writes.push({ id: Number(params.id), ...changes })
      const task = tasks.find((item) => item.id === Number(params.id))!
      Object.assign(task, changes)
      return HttpResponse.json(task)
    }),
    http.patch(`${API}/lists/:id`, async ({ params, request }) => {
      const changes = (await request.json()) as { position: number }
      writes.push(changes)
      const column = columns.find((item) => item.id === Number(params.id))!
      column.position = changes.position
      return HttpResponse.json(column)
    }),
  )
})

async function board() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'token'
  const wrapper = mount(BoardColumns, { attachTo: document.body, global: { plugins: [pinia] } })
  await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(2))
  const column = (id: number) => wrapper.get(`section[aria-labelledby="column-${id}"]`)
  const list = (id: number) =>
    wrapper
      .findAllComponents(VueDraggable)
      .find((item) => item.element.closest(`section[aria-labelledby="column-${id}"]`))!
  async function dropTask(id: number, index = 0, event = 'add') {
    list(id).vm.$emit(event, { data: { ...tasks[0] }, newDraggableIndex: index })
    await flushPromises()
  }
  return { wrapper, auth, column, list, dropTask }
}

describe('board dragging', () => {
  it.each([2, 3])(
    'moves a task to column %s at the requested position and preserves content',
    async (id) => {
      const { wrapper, column, dropTask } = await board()
      await dropTask(id)
      await vi.waitFor(() => expect(column(id).findAll('li')[0]?.text()).toBe('Move me'))
      expect(column(1).findAll('li')).toHaveLength(0)
      expect(tasks[0]).toMatchObject({ description: 'Keep this', listId: id, position: 0 })
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    },
  )

  it('reorders tasks within a column and normalizes positions', async () => {
    tasks[0]!.listId = 2
    const { column, dropTask } = await board()
    await dropTask(2, 1, 'update')
    await vi.waitFor(() =>
      expect(
        column(2)
          .findAll('li')
          .map((item) => item.text()),
      ).toEqual(['Existing', 'Move me']),
    )
    expect(writes).toEqual([
      { id: 20, listId: 2, position: 0 },
      { id: 10, listId: 2, position: 1 },
    ])
  })

  it('ignores an invalid drop and sends no write for an unchanged order', async () => {
    const { wrapper, list, dropTask } = await board()
    list(2).vm.$emit('add', { data: tasks[0] })
    wrapper.findComponent(VueDraggable).vm.$emit('update', { data: columns[0] })
    await dropTask(1, 0, 'update')
    expect(writes).toEqual([])
  })

  it.each([false, true])('reorders columns across multiple positions (right=%s)', async (right) => {
    const { wrapper } = await board()
    wrapper.findComponent(VueDraggable).vm.$emit('update', {
      data: right ? columns[0] : columns[2],
      newDraggableIndex: right ? 2 : 0,
    })
    await vi.waitFor(() =>
      expect(wrapper.findAll('h3').map((item) => item.text())).toEqual(
        right ? ['Doing', 'Done', 'Todo'] : ['Done', 'Todo', 'Doing'],
      ),
    )
    expect(wrapper.findAll('li')).toHaveLength(2)
  })

  it.each([403, 404, 500])('reconciles task lists after a %s failure', async (status) => {
    const { wrapper, dropTask } = await board()
    server.use(http.patch(`${API}/cards/10`, () => HttpResponse.json({}, { status })))
    await dropTask(2)
    await vi.waitFor(() => expect(taskReads).toBe(7))
    expect(wrapper.text()).toContain('The move was not confirmed.')
    expect(wrapper.text()).not.toContain('Task moved.')
    expect(tasks[0]!.listId).toBe(1)
  })

  it('reloads a move committed before a lost response', async () => {
    const { column, dropTask } = await board()
    server.use(
      http.patch(`${API}/cards/10`, () => {
        Object.assign(tasks[0]!, { listId: 2, position: 0 })
        return HttpResponse.error()
      }),
    )
    await dropTask(2)
    await vi.waitFor(() => expect(column(2).findAll('li')).toHaveLength(2))
    expect(column(1).findAll('li')).toHaveLength(0)
  })

  it('reloads partial position updates when a later save fails', async () => {
    const { wrapper, column, dropTask } = await board()
    server.use(http.patch(`${API}/cards/20`, () => HttpResponse.json({}, { status: 500 })))
    await dropTask(2)
    await vi.waitFor(() => expect(column(2).findAll('li')).toHaveLength(2))
    expect(column(1).findAll('li')).toHaveLength(0)
    expect(wrapper.text()).toContain('The move was not confirmed.')
    expect(wrapper.text()).not.toContain('Task moved.')
  })

  it('clears the board after an unauthorized drag request', async () => {
    const { wrapper, auth, dropTask } = await board()
    server.use(http.patch(`${API}/cards/10`, () => HttpResponse.json({}, { status: 401 })))
    await dropTask(3)
    await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
    expect(wrapper.findAll('li')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Task moved.')
  })

  it('detects a conflicting server order and does not report success', async () => {
    const { wrapper, dropTask } = await board()
    server.use(
      http.patch(`${API}/cards/10`, () =>
        HttpResponse.json({ ...tasks[0], listId: 3, position: 0 }),
      ),
    )
    await dropTask(3)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Could not confirm the task order.'))
    expect(wrapper.text()).not.toContain('Task moved.')
  })

  it('blocks duplicate moves and editing while saving, and ignores a late account result', async () => {
    const { wrapper, auth, dropTask } = await board()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    server.use(
      http.patch(`${API}/cards/10`, async () => {
        calls++
        await pending
        return HttpResponse.json({ ...tasks[0], listId: 3, position: 0 })
      }),
    )
    try {
      await dropTask(3)
      await vi.waitFor(() => expect(calls).toBe(1))
      expect(wrapper.get('[data-task-id="10"]').attributes()).toHaveProperty('disabled')
      await dropTask(2)
      auth.clearSession()
      auth.accessToken = 'different-account'
    } finally {
      release()
    }
    await flushPromises()
    expect(calls).toBe(1)
    expect(wrapper.text()).not.toContain('Move me')
    expect(wrapper.text()).not.toContain('Task moved.')
  })
})

import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import BoardColumns from '@/components/board/BoardColumns.vue'
import { useAuthStore } from '@/stores/auth'

const API = `${window.location.origin}/api`
const original = {
  id: 1,
  title: 'Move me',
  description: 'Keep this description',
  listId: 1,
  position: 0,
}
const existing = { id: 2, title: 'Existing task', description: '', listId: 2, position: 7 }
let task = { ...original }
let columns = [
  { id: 1, title: 'Todo', position: 0 },
  { id: 2, title: 'Done', position: 1 },
]
let destinationTasks = [existing]
let patches: unknown[]
let reads: number[]
beforeEach(() => {
  task = { ...original }
  columns = [
    { id: 1, title: 'Todo', position: 0 },
    { id: 2, title: 'Done', position: 1 },
  ]
  destinationTasks = [existing]
  patches = []
  reads = []
  server.use(
    http.get(`${API}/lists`, () => HttpResponse.json(columns)),
    http.get(`${API}/lists/:id/cards`, ({ params }) => {
      const id = Number(params.id)
      reads.push(id)
      return HttpResponse.json([
        ...(id === 2 ? destinationTasks : []),
        ...(task.listId === id ? [task] : []),
      ])
    }),
    http.get(`${API}/cards/1`, () => HttpResponse.json(task)),
    http.patch(`${API}/cards/1`, async ({ request }) => {
      const changes = (await request.json()) as { listId: number; position: number }
      patches.push(changes)
      task = { ...task, ...changes }
      return HttpResponse.json(task)
    }),
  )
})
async function openMove() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'token'
  const wrapper = mount(BoardColumns, {
    attachTo: document.body,
    global: { plugins: [pinia], stubs: { teleport: true } },
  })
  const button = (label: string) => wrapper.findAll('button').find((item) => item.text() === label)!
  await vi.waitFor(() => expect(button('Move me')).toBeDefined())
  await button('Move me').trigger('click')
  await vi.waitFor(() => expect(button('Move to another column')).toBeDefined())
  await button('Move to another column').trigger('click')
  await vi.waitFor(() => expect(wrapper.findAll('option')).toHaveLength(columns.length))
  return { wrapper, auth, button }
}

describe('move task', () => {
  it('lists available columns and does not mutate the current column or on cancel', async () => {
    const { wrapper, button } = await openMove()
    expect(wrapper.findAll('option').map((item) => item.text())).toEqual(['Todo (current)', 'Done'])
    expect(button('Move task').attributes()).toHaveProperty('disabled')
    await button('Move task').trigger('click')
    expect(patches).toEqual([])
    await wrapper.get('select').setValue(2)
    await button('Cancel').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#task-title').exists()).toBe(true))
    expect(patches).toEqual([])
  })

  it.each([false, true])(
    'appends exactly once, preserves content, empty destination=%s',
    async (empty) => {
      if (empty) destinationTasks = []
      const { wrapper, button } = await openMove()
      await wrapper.get('select').setValue(2)
      await button('Move task').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
      expect(patches).toEqual([{ listId: 2, position: empty ? 0 : 8 }])
      expect(task.title).toBe(original.title)
      expect(task.description).toBe(original.description)
      expect(wrapper.get('[aria-label="Tasks in Todo"]').findAll('li')).toHaveLength(0)
      expect(
        wrapper
          .get('[aria-label="Tasks in Done"]')
          .findAll('li')
          .map((item) => item.text()),
      ).toEqual(empty ? ['Move me'] : ['Existing task', 'Move me'])
    },
  )

  it('refreshes a destination still loading when the move completes instead of losing existing tasks', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let destinationReads = 0
    server.use(
      http.get(`${API}/lists/2/cards`, async () => {
        destinationReads++
        if (destinationReads === 1) {
          await pending
          return HttpResponse.json([existing])
        }
        return HttpResponse.json([existing, ...(task.listId === 2 ? [task] : [])])
      }),
    )
    const { wrapper, button } = await openMove()
    try {
      await wrapper.get('select').setValue(2)
      await button('Move task').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
    } finally {
      release()
    }
    await vi.waitFor(() =>
      expect(
        wrapper
          .get('[aria-label="Tasks in Done"]')
          .findAll('li')
          .map((item) => item.text()),
      ).toEqual(['Existing task', 'Move me']),
    )
    expect(destinationReads).toBe(3)
    expect(wrapper.get('[aria-label="Tasks in Todo"]').findAll('li')).toHaveLength(0)
  })

  it('explains when no alternative exists', async () => {
    columns = columns.slice(0, 1)
    const { wrapper, button } = await openMove()
    expect(wrapper.text()).toContain('Create another column before moving this task.')
    expect(wrapper.get('select').attributes()).toHaveProperty('disabled')
    expect(button('Move task').attributes()).toHaveProperty('disabled')
  })

  it.each([400, 403, 404, 500, 0])(
    'reconciles both columns after %s without claiming success',
    async (status) => {
      const { wrapper, button } = await openMove()
      reads = []
      server.use(
        http.patch(`${API}/cards/1`, () =>
          status ? HttpResponse.json({}, { status }) : HttpResponse.error(),
        ),
      )
      await wrapper.get('select').setValue(2)
      await button('Move task').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('The move was not confirmed.'))
      await vi.waitFor(() =>
        expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('1'),
      )
      expect(reads).toContain(1)
      expect(reads).toContain(2)
      expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['Move me', 'Existing task'])
      expect(button('Move task').attributes()).toHaveProperty('disabled')
    },
  )

  it('reconciles a move that succeeded when the response was lost', async () => {
    const { wrapper, button } = await openMove()
    server.use(
      http.patch(`${API}/cards/1`, () => {
        task = { ...task, listId: 2, position: 8 }
        return HttpResponse.error()
      }),
    )
    await wrapper.get('select').setValue(2)
    await button('Move task').trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.findAll('option').map((item) => item.text())).toContain('Done (current)'),
    )
    expect(wrapper.get('[aria-label="Tasks in Todo"]').findAll('li')).toHaveLength(0)
    expect(
      wrapper
        .get('[aria-label="Tasks in Done"]')
        .findAll('li')
        .map((item) => item.text()),
    ).toEqual(['Existing task', 'Move me'])
    expect(wrapper.text()).toContain('The move was not confirmed.')
    expect(button('Move task').attributes()).toHaveProperty('disabled')
  })

  it('requires a successful location check after reconciliation fails', async () => {
    const { wrapper, button } = await openMove()
    server.use(
      http.patch(`${API}/cards/1`, () => HttpResponse.error()),
      http.get(`${API}/cards/1`, () => HttpResponse.json({}, { status: 500 })),
    )
    await wrapper.get('select').setValue(2)
    await button('Move task').trigger('click')
    await vi.waitFor(() => expect(button('Check task location')).toBeDefined())
    expect(button('Move task').attributes()).toHaveProperty('disabled')
    server.use(http.get(`${API}/cards/1`, () => HttpResponse.json(task)))
    await button('Check task location').trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.get('select').attributes()).not.toHaveProperty('disabled'),
    )
    await wrapper.get('select').setValue(2)
    expect(button('Move task').attributes()).not.toHaveProperty('disabled')
  })

  it('clears the session on 401', async () => {
    const { wrapper, auth, button } = await openMove()
    server.use(http.patch(`${API}/cards/1`, () => HttpResponse.json({}, { status: 401 })))
    await wrapper.get('select').setValue(2)
    await button('Move task').trigger('click')
    await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it('blocks repeated requests and ignores a late result after logout', async () => {
    const { wrapper, auth, button } = await openMove()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    server.use(
      http.patch(`${API}/cards/1`, async () => {
        calls++
        await pending
        return HttpResponse.json({ ...task, listId: 2, position: 8 })
      }),
    )
    try {
      await wrapper.get('select').setValue(2)
      await button('Move task').trigger('click')
      await vi.waitFor(() => expect(calls).toBe(1))
      expect(button('Move task').attributes()).toHaveProperty('disabled')
      expect(button('Cancel').attributes()).toHaveProperty('disabled')
      await button('Move task').trigger('click')
      auth.clearSession()
      auth.accessToken = 'account-b'
    } finally {
      release()
    }
    await flushPromises()
    expect(calls).toBe(1)
    expect(wrapper.findAll('li')).toHaveLength(0)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('rejects a malformed successful response and reconciles the actual location', async () => {
    const { wrapper, button } = await openMove()
    server.use(http.patch(`${API}/cards/1`, () => HttpResponse.json(task)))
    await wrapper.get('select').setValue(2)
    await button('Move task').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Could not confirm the move.'))
    await vi.waitFor(() =>
      expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('1'),
    )
    expect(wrapper.get('[aria-label="Tasks in Todo"]').findAll('li')).toHaveLength(1)
  })
})

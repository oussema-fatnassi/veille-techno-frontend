import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { VueDraggable } from 'vue-draggable-plus'
import { server } from '../../tests/mocks/server'
import BoardColumns from '@/components/board/BoardColumns.vue'
import { useAuthStore } from '@/stores/auth'

const API = `${window.location.origin}/api`
let columns: { id: number; title: string; position: number }[]
let patches: { id: number; body: unknown }[]
let reads: number
beforeEach(() => {
  columns = [
    { id: 1, title: 'Todo', position: 0 },
    { id: 2, title: 'Doing', position: 1 },
    { id: 3, title: 'Done', position: 2 },
  ]
  patches = []
  reads = 0
  server.use(
    http.get(`${API}/lists`, () => {
      reads++
      return HttpResponse.json(columns)
    }),
    http.get(`${API}/lists/:id/cards`, ({ params }) =>
      HttpResponse.json([{ id: Number(params.id), title: `Task ${params.id}`, position: 0 }]),
    ),
    http.patch(`${API}/lists/:id`, async ({ params, request }) => {
      const body = (await request.json()) as { position: number }
      const column = columns.find((item) => item.id === Number(params.id))!
      patches.push({ id: column.id, body })
      column.position = body.position
      return HttpResponse.json(column)
    }),
  )
})
async function mountBoard() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'token'
  const wrapper = mount(BoardColumns, { attachTo: document.body, global: { plugins: [pinia] } })
  await vi.waitFor(() => expect(reads).toBe(1))
  await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(columns.length))
  const headings = () => wrapper.findAll('h3').map((item) => item.text())
  return { wrapper, auth, headings }
}
async function dragColumn(
  wrapper: Awaited<ReturnType<typeof mountBoard>>['wrapper'],
  title: string,
  destination: number,
) {
  const column = columns.find((item) => item.title === title)!
  wrapper.findComponent(VueDraggable).vm.$emit('update', {
    data: { ...column },
    newDraggableIndex: destination,
  })
  await flushPromises()
}

describe('column reordering', () => {
  it('does not show old column move buttons', async () => {
    const { wrapper } = await mountBoard()
    expect(wrapper.findAll('button[aria-label^="Move "]')).toHaveLength(0)
    expect(patches).toEqual([])
  })

  it.each([0, 1])('handles a board with %s columns', async (count) => {
    columns = columns.slice(0, count)
    const { wrapper } = await mountBoard()
    expect(wrapper.findAll('button[aria-label^="Move "]')).toHaveLength(0)
    expect(wrapper.findAll('h3')).toHaveLength(count)
    expect(patches).toEqual([])
  })

  it.each(['left', 'right'])(
    'moves %s, preserves tasks, and focuses the moved heading',
    async (direction) => {
      const { wrapper, headings } = await mountBoard()
      const taskElements = wrapper.findAll('li').map((item) => item.element)
      await dragColumn(wrapper, 'Doing', direction === 'left' ? 0 : 2)
      await vi.waitFor(() =>
        expect(headings()).toEqual(
          direction === 'left' ? ['Doing', 'Todo', 'Done'] : ['Todo', 'Done', 'Doing'],
        ),
      )
      expect(wrapper.findAll('li').map((item) => item.element)).toEqual(
        direction === 'left'
          ? [taskElements[1], taskElements[0], taskElements[2]]
          : [taskElements[0], taskElements[2], taskElements[1]],
      )
      expect(patches).toHaveLength(2)
      expect(
        patches.every((patch) => Object.keys(patch.body as object).join() === 'position'),
      ).toBe(true)
      expect(document.activeElement?.id).toBe('column-2')
      expect(reads).toBe(2)
    },
  )

  it('normalizes duplicate positions and gaps into a unique order', async () => {
    columns[0]!.position = 7
    columns[1]!.position = 7
    columns[2]!.position = 40
    const { wrapper, headings } = await mountBoard()
    await dragColumn(wrapper, 'Doing', 0)
    await vi.waitFor(() => expect(headings()).toEqual(['Doing', 'Todo', 'Done']))
    expect(patches).toEqual([
      { id: 2, body: { position: 0 } },
      { id: 1, body: { position: 1 } },
      { id: 3, body: { position: 2 } },
    ])
  })

  it.each([400, 403, 404, 500, 0])(
    'reloads partial changes after %s and does not claim success',
    async (status) => {
      const { wrapper, headings } = await mountBoard()
      server.use(
        http.patch(`${API}/lists/2`, () =>
          status ? HttpResponse.json({}, { status }) : HttpResponse.error(),
        ),
      )
      // First PATCH moves Done to position 1; second PATCH fails.
      await dragColumn(wrapper, 'Doing', 2)
      await vi.waitFor(() => expect(wrapper.text()).toContain('The reorder was not confirmed.'))
      await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(3))
      expect(reads).toBe(2)
      expect(columns[2]!.position).toBe(1)
      expect(headings()).toEqual(['Todo', 'Doing', 'Done'])
      expect(wrapper.text()).not.toContain('moved right.')
      expect(wrapper.get('[aria-label="Rename Doing"]').attributes()).not.toHaveProperty('disabled')
    },
  )

  it('requires a successful refetch before retrying after failed reconciliation', async () => {
    const { wrapper } = await mountBoard()
    server.use(
      http.patch(`${API}/lists/2`, () => HttpResponse.error()),
      http.get(`${API}/lists`, () => HttpResponse.json({}, { status: 500 })),
    )
    await dragColumn(wrapper, 'Doing', 0)
    await vi.waitFor(() => expect(wrapper.findAll('[role="alert"]')).toHaveLength(2))
    expect(wrapper.findAll('h3')).toHaveLength(0)
    expect(wrapper.get('button').attributes()).toHaveProperty('disabled')
    expect(document.activeElement?.textContent).toBe('Retry columns')
    server.use(http.get(`${API}/lists`, () => HttpResponse.json(columns)))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Retry columns')!
      .trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(3))
    expect(document.activeElement?.id).toBe('column-2')
  })

  it('focuses a usable control if the moved column was deleted elsewhere', async () => {
    const { wrapper } = await mountBoard()
    server.use(
      http.patch(`${API}/lists/2`, () => {
        columns = columns.filter((column) => column.id !== 2)
        return HttpResponse.json({}, { status: 404 })
      }),
    )
    await dragColumn(wrapper, 'Doing', 0)
    await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(2))
    expect(document.activeElement?.textContent).toBe('New column')
  })

  it('clears the session on 401 and does not send further updates', async () => {
    const { wrapper, auth } = await mountBoard()
    const request = vi.fn<() => Response>(() => HttpResponse.json({}, { status: 401 }))
    server.use(http.patch(`${API}/lists/:id`, request))
    await dragColumn(wrapper, 'Doing', 0)
    await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
    expect(request).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('h3')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Doing')
  })

  it('blocks repeat actions while saving without changing the visible order early', async () => {
    const { wrapper, headings } = await mountBoard()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    server.use(
      http.patch(`${API}/lists/2`, async () => {
        calls++
        await pending
        columns[1]!.position = 0
        return HttpResponse.json(columns[1])
      }),
    )
    try {
      await dragColumn(wrapper, 'Doing', 0)
      await vi.waitFor(() => expect(calls).toBe(1))
      expect(headings()).toEqual(['Todo', 'Doing', 'Done'])
      expect(wrapper.get('[aria-label="Rename Doing"]').attributes()).toHaveProperty('disabled')
      await dragColumn(wrapper, 'Doing', 0)
    } finally {
      release()
    }
    await vi.waitFor(() => expect(headings()).toEqual(['Doing', 'Todo', 'Done']))
    expect(calls).toBe(1)
  })

  it('ignores a late result and stops subsequent writes after account change', async () => {
    const { wrapper, auth } = await mountBoard()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    server.use(
      http.patch(`${API}/lists/:id`, async () => {
        calls++
        await pending
        return HttpResponse.json({ ...columns[1], position: 0 })
      }),
    )
    try {
      await dragColumn(wrapper, 'Doing', 0)
      await vi.waitFor(() => expect(calls).toBe(1))
      auth.clearSession()
      auth.accessToken = 'account-b'
    } finally {
      release()
    }
    await flushPromises()
    expect(calls).toBe(1)
    expect(wrapper.findAll('h3')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('moved left.')
  })

  it('rejects an incorrect PATCH response and refetches', async () => {
    const { wrapper } = await mountBoard()
    server.use(http.patch(`${API}/lists/2`, () => HttpResponse.json({ id: 9, position: 0 })))
    await dragColumn(wrapper, 'Doing', 0)
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('Could not confirm the column position.'),
    )
    await vi.waitFor(() => expect(reads).toBe(2))
    expect(patches).toHaveLength(0)
  })

  it('detects an order changed during confirmation rather than reporting success', async () => {
    const { wrapper } = await mountBoard()
    server.use(
      http.get(`${API}/lists`, () => {
        reads++
        return HttpResponse.json([
          { ...columns[0], position: 0 },
          { ...columns[1], position: 1 },
          columns[2],
        ])
      }),
    )
    await dragColumn(wrapper, 'Doing', 0)
    await vi.waitFor(() => expect(wrapper.text()).toContain('The column order changed.'))
    await vi.waitFor(() => expect(reads).toBe(3))
    expect(wrapper.text()).not.toContain('moved left.')
  })
})

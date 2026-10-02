import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import BoardColumns from '@/components/board/BoardColumns.vue'
import ColumnTasks from '@/components/board/ColumnTasks.vue'
import { useAuthStore } from '@/stores/auth'
import { getTasks } from '@/api/cards'
import { createApiClient } from '@/api/client'

const API = `${window.location.origin}/api`
function mountTasks() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'account-a'
  const wrapper = mount(ColumnTasks, {
    props: { columnId: 1, columnTitle: 'Todo' },
    attachTo: document.body,
    global: { plugins: [pinia] },
  })
  return { wrapper, auth }
}

describe('column tasks', () => {
  it('orders tasks by position then ID and safely renders title text', async () => {
    server.use(
      http.get(`${API}/lists/1/cards`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer account-a')
        return HttpResponse.json([
          { id: 9, title: 'Last', position: 4 },
          { id: 3, title: 'Second', position: 0 },
          { id: 1, title: '<img src=x onerror=alert(1)>', position: 0 },
        ])
      }),
    )
    const { wrapper } = mountTasks()
    await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(3))
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
      '<img src=x onerror=alert(1)>',
      'Second',
      'Last',
    ])
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(3)
  })

  it('shows loading and only reports empty after a successful response', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(`${API}/lists/1/cards`, async () => {
        await pending
        return HttpResponse.json([])
      }),
    )
    const { wrapper } = mountTasks()
    try {
      await flushPromises()
      expect(wrapper.get('[role="status"]').text()).toBe('Loading tasks…')
      expect(wrapper.text()).not.toContain('No tasks yet')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(wrapper.text()).toContain('No tasks yet'))
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it.each([403, 404, 500, 0])(
    'keeps other columns usable after %s and retries only the failed one',
    async (status) => {
      const calls = { first: 0, second: 0 }
      server.use(
        http.get(`${API}/lists`, () =>
          HttpResponse.json([
            { id: 1, title: 'Todo', position: 0 },
            { id: 2, title: 'Done', position: 1 },
          ]),
        ),
        http.get(`${API}/lists/1/cards`, () => {
          calls.first++
          return calls.first === 1
            ? status
              ? HttpResponse.json({}, { status })
              : HttpResponse.error()
            : HttpResponse.json([{ id: 1, title: 'Recovered', position: 0 }])
        }),
        http.get(`${API}/lists/2/cards`, () => {
          calls.second++
          return HttpResponse.json([{ id: 2, title: 'Completed', position: 0 }])
        }),
      )
      const pinia = createPinia()
      useAuthStore(pinia).accessToken = 'token'
      const wrapper = mount(BoardColumns, { attachTo: document.body, global: { plugins: [pinia] } })
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
      await vi.waitFor(() => expect(wrapper.text()).toContain('Completed'))
      expect(wrapper.text()).not.toContain('No tasks yet')
      await wrapper.get('[aria-label="Retry tasks in Todo"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('Recovered'))
      expect(wrapper.text()).toContain('Completed')
      expect(calls).toEqual({ first: 2, second: 1 })
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    },
  )

  it('clears loaded tasks on logout', async () => {
    server.use(
      http.get(`${API}/lists/1/cards`, () =>
        HttpResponse.json([{ id: 1, title: 'Private A', position: 0 }]),
      ),
    )
    const { wrapper, auth } = mountTasks()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Private A'))
    auth.clearSession()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Private A')
  })

  it.each(['logout', 'unmount'] as const)('ignores delayed responses after %s', async (action) => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let returned = false
    let started = false
    server.use(
      http.get(`${API}/lists/1/cards`, async () => {
        started = true
        await pending
        returned = true
        return HttpResponse.json([{ id: 1, title: 'Late private A', position: 0 }])
      }),
    )
    const { wrapper, auth } = mountTasks()
    try {
      await vi.waitFor(() => expect(started).toBe(true))
      if (action === 'logout') {
        auth.clearSession()
        auth.accessToken = 'account-b'
      } else wrapper.unmount()
    } finally {
      release()
    }
    await vi.waitFor(() => expect(returned).toBe(true))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Late private A')
    expect(auth.sessionMessage).toBe('')
  })

  it('expires the current session on 401', async () => {
    server.use(http.get(`${API}/lists/1/cards`, () => HttpResponse.json({}, { status: 401 })))
    const { wrapper, auth } = mountTasks()
    await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
    expect(auth.sessionMessage).toContain('expired')
    expect(wrapper.findAll('li')).toHaveLength(0)
  })
})

describe('tasks API', () => {
  it.each([
    null,
    {},
    [null],
    [{ id: 0, title: 'Bad ID', position: 0 }],
    [{ id: 1, title: null, position: 0 }],
    [{ id: 1, title: 'Bad position', position: '0' }],
  ])('rejects malformed task data instead of reporting an empty column: %j', async (body) => {
    server.use(http.get(`${API}/lists/1/cards`, () => HttpResponse.json(body)))
    await expect(getTasks(createApiClient(), 1)).rejects.toMatchObject({ kind: 'unknown' })
  })
})

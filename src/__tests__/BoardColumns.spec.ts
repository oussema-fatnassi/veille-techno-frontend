import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import BoardColumns from '@/components/board/BoardColumns.vue'
import { useAuthStore } from '@/stores/auth'

const API = `${window.location.origin}/api`
function mountColumns() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'test-token'
  const wrapper = mount(BoardColumns, { global: { plugins: [pinia] } })
  return { wrapper, auth }
}

describe('board columns', () => {
  it('orders by position then ID and renders titles as text without loading cards', async () => {
    const calls: string[] = []
    server.use(
      http.get(`${API}/*`, ({ request }) => {
        calls.push(request.url)
        expect(request.headers.get('Authorization')).toBe('Bearer test-token')
        return HttpResponse.json([
          { id: 8, position: 2, title: 'Last' },
          { id: 3, position: 0, title: 'Second' },
          { id: 1, position: 0, title: '<img src=x onerror=alert(1)>' },
        ])
      }),
    )
    const { wrapper } = mountColumns()
    await vi.waitFor(() => expect(wrapper.findAll('h3')).toHaveLength(3))
    expect(wrapper.findAll('h3').map((heading) => heading.text())).toEqual([
      '<img src=x onerror=alert(1)>',
      'Second',
      'Last',
    ])
    expect(wrapper.find('img').exists()).toBe(false)
    expect(calls).toEqual([`${API}/lists`])
    expect(wrapper.text()).not.toContain('No cards')
  })

  it('does not show an empty board before loading completes', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(`${API}/lists`, async () => {
        await pending
        return HttpResponse.json([])
      }),
    )
    const { wrapper } = mountColumns()
    try {
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[role="status"]').text()).toBe('Loading columns…')
      expect(wrapper.text()).not.toContain('No columns yet')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(wrapper.text()).toContain('Create your first column'))
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it.each([403, 500, 0])(
    'shows a retryable error for %s without presenting an empty board',
    async (status) => {
      server.use(
        http.get(`${API}/lists`, () =>
          status ? HttpResponse.json({}, { status }) : HttpResponse.error(),
        ),
      )
      const { wrapper, auth } = mountColumns()
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
      expect(wrapper.text()).not.toContain('No columns yet')
      expect(auth.isAuthenticated).toBe(true)
      server.use(
        http.get(`${API}/lists`, () =>
          HttpResponse.json([{ id: 1, position: 0, title: 'Recovered' }]),
        ),
      )
      await wrapper.get('button').trigger('click')
      await vi.waitFor(() => expect(wrapper.get('h3').text()).toBe('Recovered'))
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    },
  )

  it('clears the session when the lists endpoint returns 401', async () => {
    server.use(http.get(`${API}/lists`, () => HttpResponse.json({}, { status: 401 })))
    const { auth } = mountColumns()
    await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
    expect(auth.sessionMessage).toContain('expired')
  })

  it('removes loaded column data on logout', async () => {
    server.use(
      http.get(`${API}/lists`, () =>
        HttpResponse.json([{ id: 1, position: 0, title: 'Private A' }]),
      ),
    )
    const { wrapper, auth } = mountColumns()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Private A'))
    auth.clearSession()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('Private A')
  })

  it('ignores a response that arrives after account change', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    server.use(
      http.get(`${API}/lists`, async () => {
        started = true
        await pending
        return HttpResponse.json([{ id: 1, position: 0, title: 'Private A' }])
      }),
    )
    const { wrapper, auth } = mountColumns()
    try {
      await vi.waitFor(() => expect(started).toBe(true))
      auth.clearSession()
      auth.accessToken = 'account-b'
    } finally {
      release()
    }
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))
    expect(wrapper.text()).not.toContain('Private A')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

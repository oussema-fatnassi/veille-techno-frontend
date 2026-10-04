import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import ColumnTasks from '@/components/board/ColumnTasks.vue'
import TaskEditorDialog from '@/components/board/TaskEditorDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { createApiClient } from '@/api/client'
import { getTask, updateTask } from '@/api/cards'

const API = `${window.location.origin}/api`
const task = {
  id: 1,
  title: 'Current title',
  description: 'Existing description',
  position: 3,
  listId: 1,
}
beforeEach(() => {
  server.use(
    http.get(`${API}/lists/1/cards`, () => HttpResponse.json([task])),
    http.get(`${API}/cards/1`, () => HttpResponse.json(task)),
  )
})
async function openEditor() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.accessToken = 'token'
  const wrapper = mount(ColumnTasks, {
    props: { columnId: 1, columnTitle: 'Todo' },
    attachTo: document.body,
    global: { plugins: [pinia], stubs: { teleport: true } },
  })
  await vi.waitFor(() => expect(wrapper.find('li button').exists()).toBe(true))
  await wrapper.get('li button').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(true))
  return { wrapper, auth }
}

async function waitForForm(wrapper: VueWrapper) {
  await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
}

describe('task editor', () => {
  it('loads current details, normalizes a null description, and focuses the title', async () => {
    server.use(
      http.get(`${API}/cards/1`, () =>
        HttpResponse.json({ ...task, title: 'Latest title', description: null }),
      ),
    )
    const { wrapper } = await openEditor()
    await waitForForm(wrapper)
    expect((wrapper.get('#task-title').element as HTMLInputElement).value).toBe('Latest title')
    expect((wrapper.get('#task-description').element as HTMLTextAreaElement).value).toBe('')
    expect(document.activeElement?.id).toBe('task-title')
    expect(wrapper.get('li').text()).toBe('Latest title')
  })

  it('sends only title and description and displays the server response', async () => {
    let payload: unknown
    server.use(
      http.patch(`${API}/cards/1`, async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json({
          ...task,
          title: 'Server title',
          description: 'Server description',
        })
      }),
    )
    const { wrapper } = await openEditor()
    await vi.waitFor(() => expect(wrapper.find('#task-title').exists()).toBe(true))
    await wrapper.get('#task-title').setValue('  New title  ')
    await wrapper.get('#task-description').setValue('New description')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.get('li').text()).toBe('Server title'))
    expect(payload).toEqual({ title: 'New title', description: 'New description' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('clears a description with an empty string without erasing the unchanged title', async () => {
    let payload: unknown
    server.use(
      http.patch(`${API}/cards/1`, async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json({ ...task, description: '' })
      }),
    )
    const { wrapper } = await openEditor()
    await vi.waitFor(() => expect(wrapper.find('#task-description').exists()).toBe(true))
    await wrapper.get('#task-description').setValue('')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
    expect(payload).toEqual({ title: task.title, description: '' })
    expect(wrapper.get('li').text()).toBe(task.title)
  })

  it.each(['', '   ', 'x'.repeat(101)])('rejects invalid title %j locally', async (title) => {
    const patch = vi.fn<() => Response>(() => HttpResponse.json(task))
    server.use(http.patch(`${API}/cards/1`, patch))
    const { wrapper } = await openEditor()
    await vi.waitFor(() => expect(wrapper.find('#task-title').exists()).toBe(true))
    await wrapper.get('#task-title').setValue(title)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#task-title-error').text()).not.toBe('')
    expect(patch).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('task-title')
    await wrapper.get('#task-title').setValue('Corrected')
    expect(wrapper.get('#task-title-error').text()).toBe('')
  })

  it('cancels without sending a write or changing the board title', async () => {
    const patch = vi.fn<() => Response>(() => HttpResponse.json(task))
    server.use(http.patch(`${API}/cards/1`, patch))
    const { wrapper } = await openEditor()
    await vi.waitFor(() => expect(wrapper.find('#task-title').exists()).toBe(true))
    await wrapper.get('#task-title').setValue('Discard me')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!
      .trigger('click')
    expect(wrapper.get('li').text()).toBe(task.title)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(patch).not.toHaveBeenCalled()
    wrapper.findComponent(TaskEditorDialog).vm.$emit('closed')
    await flushPromises()
    await wrapper.get('li button').trigger('click')
    await waitForForm(wrapper)
    expect((wrapper.get('#task-title').element as HTMLInputElement).value).toBe(task.title)
  })

  it('removes a task moved elsewhere from its old column when details are refreshed', async () => {
    server.use(http.get(`${API}/cards/1`, () => HttpResponse.json({ ...task, listId: 2 })))
    const { wrapper } = await openEditor()
    await waitForForm(wrapper)
    expect(wrapper.findAll('li')).toHaveLength(0)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!
      .trigger('click')
    wrapper.findComponent(TaskEditorDialog).vm.$emit('closed')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.element)
  })

  it('keeps other tasks and applies server ordering when refreshed details have changed', async () => {
    server.use(
      http.get(`${API}/lists/1/cards`, () =>
        HttpResponse.json([task, { ...task, id: 2, title: 'Other', position: 4 }]),
      ),
      http.get(`${API}/cards/1`, () => HttpResponse.json({ ...task, position: 5 })),
    )
    const { wrapper } = await openEditor()
    await waitForForm(wrapper)
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['Other', task.title])
  })

  it('shows descriptions containing markup only as textarea text', async () => {
    const markup = '<script>alert(1)</script><img src=x onerror=alert(1)>'
    server.use(
      http.get(`${API}/cards/1`, () => HttpResponse.json({ ...task, description: markup })),
    )
    const { wrapper } = await openEditor()
    await vi.waitFor(() => expect(wrapper.find('textarea').exists()).toBe(true))
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(markup)
    expect(wrapper.find('script, img').exists()).toBe(false)
  })

  for (const phase of ['load', 'save'] as const) {
    it.each([400, 403, 404, 500, 0])(
      `${phase}: handles %s without false success`,
      async (status) => {
        server.use(
          (phase === 'load' ? http.get : http.patch)(`${API}/cards/1`, () =>
            status
              ? HttpResponse.json({ message: 'Rejected input' }, { status })
              : HttpResponse.error(),
          ),
        )
        const { wrapper } = await openEditor()
        if (phase === 'save') {
          await waitForForm(wrapper)
          await wrapper.get('#task-title').setValue('Draft')
          await wrapper.get('form').trigger('submit')
        }
        await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
        expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
        expect(wrapper.find('form').exists()).toBe(
          phase === 'save' && status !== 403 && status !== 404,
        )
        await vi.waitFor(() => expect(wrapper.findAll('li')).toHaveLength(status === 404 ? 0 : 1))
        expect(
          (wrapper.element.querySelector('#task-title') as HTMLInputElement | null)?.value,
        ).toBe(phase === 'save' && status !== 403 && status !== 404 ? 'Draft' : undefined)
      },
    )

    it(`${phase}: expires the session on 401`, async () => {
      server.use(
        (phase === 'load' ? http.get : http.patch)(`${API}/cards/1`, () =>
          HttpResponse.json({}, { status: 401 }),
        ),
      )
      const { wrapper, auth } = await openEditor()
      if (phase === 'save') {
        await waitForForm(wrapper)
        await wrapper.get('form').trigger('submit')
      }
      await vi.waitFor(() => expect(auth.isAuthenticated).toBe(false))
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
      expect(wrapper.findAll('li')).toHaveLength(0)
    })
  }

  it('allows an explicit reload after a failed load', async () => {
    server.use(http.get(`${API}/cards/1`, () => HttpResponse.json({}, { status: 500 })))
    const { wrapper } = await openEditor()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    server.use(http.get(`${API}/cards/1`, () => HttpResponse.json(task)))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reload details')!
      .trigger('click')
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('preserves a draft after an uncertain write and reloads the actual saved state on request', async () => {
    const { wrapper } = await openEditor()
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
    server.use(http.patch(`${API}/cards/1`, () => HttpResponse.error()))
    await wrapper.get('#task-title').setValue('Draft')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('save could not be confirmed'))
    server.use(
      http.get(`${API}/cards/1`, () => HttpResponse.json({ ...task, title: 'Saved remotely' })),
    )
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reload details')!
      .trigger('click')
    await vi.waitFor(() => expect(wrapper.get('li').text()).toBe('Saved remotely'))
    expect((wrapper.get('#task-title').element as HTMLInputElement).value).toBe('Saved remotely')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('blocks duplicate saves and closing while saving', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const patch = vi.fn<() => Promise<Response>>(async () => {
      await pending
      return HttpResponse.json(task)
    })
    server.use(http.patch(`${API}/cards/1`, patch))
    const { wrapper } = await openEditor()
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
    try {
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
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
    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
    expect(patch).toHaveBeenCalledTimes(1)
  })

  it('does not let an older column refresh overwrite a confirmed retry', async () => {
    const { wrapper } = await openEditor()
    await waitForForm(wrapper)
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let refreshing = false
    server.use(
      http.patch(`${API}/cards/1`, () => HttpResponse.error()),
      http.get(`${API}/lists/1/cards`, async () => {
        refreshing = true
        await pending
        return HttpResponse.json([task])
      }),
    )
    try {
      await wrapper.get('#task-title').setValue('Confirmed retry')
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(refreshing).toBe(true))
      server.use(
        http.patch(`${API}/cards/1`, () =>
          HttpResponse.json({ ...task, title: 'Confirmed retry' }),
        ),
      )
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false))
    } finally {
      release()
    }
    await vi.waitFor(() => expect(wrapper.find('li').exists()).toBe(true))
    expect(wrapper.get('li').text()).toBe('Confirmed retry')
  })

  it('ignores details arriving after the editor was cancelled', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let returned = false
    server.use(
      http.get(`${API}/cards/1`, async () => {
        await pending
        returned = true
        return HttpResponse.json({ ...task, title: 'Late title' })
      }),
    )
    const { wrapper } = await openEditor()
    try {
      expect(wrapper.text()).toContain('Loading task…')
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Cancel')!
        .trigger('click')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(returned).toBe(true))
    await flushPromises()
    expect(wrapper.get('li').text()).toBe(task.title)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it.each(['load', 'save'] as const)(
    'ignores late %s responses after an account change',
    async (phase) => {
      let release!: () => void
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      let started = false
      let returned = false
      server.use(
        (phase === 'load' ? http.get : http.patch)(`${API}/cards/1`, async () => {
          started = true
          await pending
          returned = true
          return HttpResponse.json({ ...task, title: 'Private account A' })
        }),
      )
      const { wrapper, auth } = await openEditor()
      try {
        if (phase === 'save') {
          await waitForForm(wrapper)
          await wrapper.get('form').trigger('submit')
        }
        await vi.waitFor(() => expect(started).toBe(true))
        auth.clearSession()
        auth.accessToken = 'account-b'
      } finally {
        release()
      }
      await vi.waitFor(() => expect(returned).toBe(true))
      await flushPromises()
      expect(wrapper.text()).not.toContain('Private account A')
      expect(wrapper.findAll('li')).toHaveLength(0)
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    },
  )
})

describe('task details API', () => {
  it.each([
    null,
    {},
    { ...task, id: 2 },
    { ...task, title: null },
    { ...task, position: '0' },
    { ...task, listId: 0 },
    { ...task, description: {} },
  ])('rejects malformed details %j', async (body) => {
    server.use(http.get(`${API}/cards/1`, () => HttpResponse.json(body)))
    await expect(getTask(createApiClient(), 1)).rejects.toMatchObject({ kind: 'unknown' })
  })
  it('rejects a malformed PATCH response instead of announcing success', async () => {
    server.use(http.patch(`${API}/cards/1`, () => HttpResponse.json({})))
    await expect(
      updateTask(createApiClient(), 1, { title: 'Task', description: '' }),
    ).rejects.toMatchObject({ kind: 'unknown' })
  })
})

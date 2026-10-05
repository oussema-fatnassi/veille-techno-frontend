import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import { describe, it, expect } from 'vitest'
import App from '../App.vue'
import { routes } from '../router'
import { installSessionNavigation } from '@/router/session'

describe('application navigation', () => {
  it.each([
    ['/', '/login', 'Log in'],
    ['/register', '/register', 'Create an account'],
    ['/board', '/login', 'Log in'],
    ['/missing/page', '/missing/page', 'Page not found'],
  ])('renders %s', async (path, destination, heading) => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const pinia = createPinia()
    const cleanup = installSessionNavigation(router, pinia)
    await router.push(path)
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(destination)
    expect(wrapper.text()).toContain(heading)
    cleanup()
  })
})

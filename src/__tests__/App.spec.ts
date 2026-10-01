import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, it, expect } from 'vitest'
import App from '../App.vue'
import { routes } from '../router'

describe('application navigation', () => {
  it.each([
    ['/', '/login', 'Log in'],
    ['/register', '/register', 'Create an account'],
    ['/board', '/board', 'My board'],
    ['/missing/page', '/missing/page', 'Page not found'],
  ])('renders %s', async (path, destination, heading) => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push(path)
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(destination)
    expect(wrapper.get('h1').text()).toBe(heading)
  })
})

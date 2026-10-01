import { config, enableAutoUnmount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

config.global.plugins = [[PrimeVue, { unstyled: true }]]
enableAutoUnmount(afterEach)

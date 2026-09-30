// @vitest-environment node
import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { API_URL, errorFixtures, listFixture } from '../../tests/mocks/fixtures'
import { listsError, listsNetworkError } from '../../tests/mocks/handlers'
import { server } from '../../tests/mocks/server'

const client = axios.create({ baseURL: API_URL, adapter: 'fetch' })

describe('HTTP test infrastructure', () => {
  it('provides a successful response through the real Axios transport', async () => {
    const response = await client.get('/lists')
    expect(response.status).toBe(200)
    expect(response.data).toEqual([listFixture])
  })

  it.each([400, 401, 403, 404, 500, 503] as const)('provides a %i response', async (status) => {
    server.use(listsError(status))
    await expect(client.get('/lists')).rejects.toMatchObject({
      response: { status, data: errorFixtures[status] },
    })
  })

  it('simulates a disconnected network', async () => {
    server.use(listsNetworkError)
    await expect(client.get('/lists')).rejects.toMatchObject({ code: 'ERR_NETWORK' })
  })

  it('resets overrides between tests', async () => {
    expect((await client.get('/lists')).status).toBe(200)
  })

  it('rejects unexpected requests instead of contacting a real server', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(client.get('/unhandled')).rejects.toThrow('[MSW] Cannot bypass a request')
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('without a matching request handler'),
      )
    } finally {
      error.mockRestore()
    }
  })
})

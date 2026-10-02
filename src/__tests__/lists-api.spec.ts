import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { createApiClient } from '@/api/client'
import { createColumn, renameColumn } from '@/api/lists'

const API = `${window.location.origin}/api`
describe('column creation response', () => {
  it.each([
    null,
    {},
    { id: 0, title: 'Test', position: 0 },
    { id: 1, title: null, position: 0 },
    { id: 1, title: 'Test', position: '0' },
  ])('rejects malformed response %j', async (body) => {
    server.use(http.post(`${API}/lists`, () => HttpResponse.json(body, { status: 201 })))
    await expect(
      createColumn(createApiClient(), { title: 'Test', position: 0 }),
    ).rejects.toMatchObject({ kind: 'unknown' })
  })
})

describe('column rename response', () => {
  it.each([null, {}, { id: 2, title: 'Wrong column' }, { id: 1, title: null }])(
    'rejects malformed or mismatched response %j',
    async (body) => {
      server.use(http.patch(`${API}/lists/1`, () => HttpResponse.json(body)))
      await expect(renameColumn(createApiClient(), 1, 'Test')).rejects.toMatchObject({
        kind: 'unknown',
      })
    },
  )
})

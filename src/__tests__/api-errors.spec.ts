import { AxiosError, CanceledError } from 'axios'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/mocks/server'
import { createApiClient } from '@/api/client'
import { ApiError, normalizeApiError } from '@/api/errors'

const API = `${window.location.origin}/api`

describe('API error messages', () => {
  it.each([
    [400, 'validation', 'Check the entered values.'],
    [401, 'unauthorized', 'Your session has expired. Please log in again.'],
    [403, 'forbidden', 'You do not have access to this resource.'],
    [404, 'not-found', 'This resource no longer exists. Refresh the data.'],
    [429, 'rate-limited', 'Too many attempts. Try again in a minute.'],
    [500, 'unavailable', 'Cannot reach the service.'],
    [503, 'unavailable', 'Cannot reach the service.'],
    [418, 'unknown', 'The request failed.'],
  ])('normalizes HTTP %s without exposing internal messages', async (status, kind, message) => {
    server.use(
      http.get(`${API}/lists`, () =>
        HttpResponse.json({ internal: 'private detail' }, { status: Number(status) }),
      ),
    )
    await expect(createApiClient().get('/lists')).rejects.toMatchObject({
      status,
      kind,
      message: expect.stringContaining(String(message)),
    })
  })

  it.each([
    ['Invalid title', ['Invalid title']],
    [
      ['Title required', 'Position required'],
      ['Title required', 'Position required'],
    ],
    [[null, 5, '', '  ', 'Valid message'], ['Valid message']],
  ])('accepts validation messages as strings or lists', async (message, details) => {
    server.use(http.post(`${API}/lists`, () => HttpResponse.json({ message }, { status: 400 })))
    await expect(createApiClient().post('/lists', {})).rejects.toMatchObject({ details })
  })

  it.each([null, 'Bad Request', {}])('handles unexpected validation bodies: %s', async (body) => {
    server.use(http.post(`${API}/lists`, () => HttpResponse.json(body, { status: 400 })))
    await expect(createApiClient().post('/lists', {})).rejects.toMatchObject({
      message: 'Check the entered values.',
    })
  })

  it('uses a generic login message and hides credential details', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ message: 'Email does not exist' }, { status: 401 }),
      ),
    )
    await expect(createApiClient().post('/auth/login', {})).rejects.toMatchObject({
      message: 'Invalid credentials.',
    })
  })

  it('preserves normalized errors and safely handles unknown failures and cancellation', () => {
    const error = new ApiError('configuration', 'Fix the API URL.')
    expect(normalizeApiError(error)).toBe(error)
    expect(normalizeApiError(new Error('secret'))).toMatchObject({
      kind: 'unknown',
      message: 'Something went wrong. Please try again.',
    })
    expect(normalizeApiError(new AxiosError('Network Error'))).toMatchObject({
      kind: 'unavailable',
    })
    expect(normalizeApiError(new CanceledError())).toMatchObject({ kind: 'cancelled' })
  })
})

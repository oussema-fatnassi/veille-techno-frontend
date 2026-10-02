import { http, HttpResponse } from 'msw'
import { API_URL, errorFixtures, listFixture } from './fixtures'

export const handlers = [
  http.get(`${API_URL}/lists`, () => HttpResponse.json([listFixture])),
  http.get('*/api/lists/:id/cards', () => HttpResponse.json([])),
]

export function listsError(status: keyof typeof errorFixtures) {
  return http.get(`${API_URL}/lists`, () => HttpResponse.json(errorFixtures[status], { status }))
}

export const listsNetworkError = http.get(`${API_URL}/lists`, () => HttpResponse.error())

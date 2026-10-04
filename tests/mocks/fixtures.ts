export const API_URL = 'http://kanban.test/api'

export const listFixture = {
  id: 1,
  title: 'To do',
  position: 0,
  ownerId: 1,
  createdAt: '2026-09-30T08:00:00.000Z',
  updatedAt: '2026-09-30T08:00:00.000Z',
}

export const errorFixtures = {
  400: { statusCode: 400, message: ['title should not be empty'], error: 'Bad Request' },
  401: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' },
  403: {
    statusCode: 403,
    message: 'You cannot access a list owned by another user',
    error: 'Forbidden',
  },
  404: { statusCode: 404, message: 'List not found', error: 'Not Found' },
  500: { statusCode: 500, message: 'Internal server error', error: 'Internal Server Error' },
  503: { statusCode: 503, message: 'Service unavailable', error: 'Service Unavailable' },
} as const

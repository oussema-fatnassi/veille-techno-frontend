import type { createApiClient } from './client'
import { ApiError } from './errors'

export interface BoardColumn {
  id: number
  title: string
  position: number
}

export async function getColumns(client: ReturnType<typeof createApiClient>, signal?: AbortSignal) {
  const columns = await client.get<BoardColumn[]>('/lists', { signal })
  return [...columns].sort((a, b) => a.position - b.position || a.id - b.id)
}

export async function createColumn(
  client: ReturnType<typeof createApiClient>,
  column: { title: string; position: number },
  signal?: AbortSignal,
): Promise<BoardColumn> {
  const response = await client.post<BoardColumn>('/lists', column, { signal })
  if (
    !response ||
    !Number.isInteger(response.id) ||
    response.id <= 0 ||
    typeof response.title !== 'string' ||
    !Number.isInteger(response.position)
  ) {
    throw new ApiError(
      'unknown',
      'Could not confirm the new column. Check the board before trying again.',
    )
  }
  return response
}

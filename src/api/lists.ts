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

export async function renameColumn(
  client: ReturnType<typeof createApiClient>,
  id: number,
  title: string,
  signal?: AbortSignal,
): Promise<BoardColumn> {
  const response = await client.patch<BoardColumn>(`/lists/${id}`, { title }, { signal })
  if (!response || response.id !== id || typeof response.title !== 'string') {
    throw new ApiError('unknown', 'Could not confirm the update. Check the reloaded board.')
  }
  return response
}

export function deleteColumn(
  client: ReturnType<typeof createApiClient>,
  id: number,
  signal?: AbortSignal,
) {
  return client.delete(`/lists/${id}`, { signal })
}

export async function reorderColumns(
  client: ReturnType<typeof createApiClient>,
  ordered: BoardColumn[],
  signal?: AbortSignal,
) {
  // Normalize positions so gaps and ties cannot make the requested order ambiguous.
  // Updates are sequential: stop on failure and let the caller reload partial changes.
  for (const [position, column] of ordered.entries()) {
    if (column.position === position) continue
    const saved = await client.patch<BoardColumn>(`/lists/${column.id}`, { position }, { signal })
    if (!saved || saved.id !== column.id || saved.position !== position) {
      throw new ApiError('unknown', 'Could not confirm the column position.')
    }
  }
  const confirmed = await getColumns(client, signal)
  if (
    confirmed.length !== ordered.length ||
    confirmed.some((column, index) => column.id !== ordered[index]?.id || column.position !== index)
  ) {
    throw new ApiError('unknown', 'The column order changed. Check the reloaded board.')
  }
  return confirmed
}

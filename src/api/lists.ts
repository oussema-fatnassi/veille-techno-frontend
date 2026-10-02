import type { createApiClient } from './client'

export interface BoardColumn {
  id: number
  title: string
  position: number
}

export async function getColumns(client: ReturnType<typeof createApiClient>, signal?: AbortSignal) {
  const columns = await client.get<BoardColumn[]>('/lists', { signal })
  return [...columns].sort((a, b) => a.position - b.position || a.id - b.id)
}

import type { createApiClient } from './client'
import { ApiError } from './errors'

export interface BoardTask {
  id: number
  title: string
  position: number
}

export async function getTasks(
  client: ReturnType<typeof createApiClient>,
  columnId: number,
  signal?: AbortSignal,
): Promise<BoardTask[]> {
  const tasks = await client.get<BoardTask[]>(`/lists/${columnId}/cards`, { signal })
  if (
    !Array.isArray(tasks) ||
    tasks.some(
      (task) =>
        !task ||
        !Number.isInteger(task.id) ||
        task.id <= 0 ||
        typeof task.title !== 'string' ||
        !Number.isInteger(task.position),
    )
  ) {
    throw new ApiError('unknown', 'Could not read the tasks. Please try again.')
  }
  return [...tasks].sort((a, b) => a.position - b.position || a.id - b.id)
}

import type { createApiClient } from './client'
import { ApiError } from './errors'

export interface BoardTask {
  id: number
  title: string
  position: number
}

export interface TaskDetails extends BoardTask {
  description: string | null
  listId: number
}

function checkTask(task: TaskDetails, id: number): TaskDetails {
  if (
    !task ||
    task.id !== id ||
    typeof task.title !== 'string' ||
    !Number.isInteger(task.position) ||
    !Number.isInteger(task.listId) ||
    task.listId <= 0 ||
    (task.description !== null && typeof task.description !== 'string')
  ) {
    throw new ApiError('unknown', 'Could not read the task. Please reload its details.')
  }
  return task
}

export async function getTask(
  client: ReturnType<typeof createApiClient>,
  id: number,
  signal?: AbortSignal,
) {
  return checkTask(await client.get<TaskDetails>(`/cards/${id}`, { signal }), id)
}

export async function updateTask(
  client: ReturnType<typeof createApiClient>,
  id: number,
  changes: { title: string; description: string },
  signal?: AbortSignal,
) {
  return checkTask(await client.patch<TaskDetails>(`/cards/${id}`, changes, { signal }), id)
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

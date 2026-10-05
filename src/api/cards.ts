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

export function deleteTask(
  client: ReturnType<typeof createApiClient>,
  id: number,
  signal?: AbortSignal,
) {
  return client.delete(`/cards/${id}`, { signal })
}

export async function moveTask(
  client: ReturnType<typeof createApiClient>,
  id: number,
  listId: number,
  position: number,
  signal?: AbortSignal,
) {
  const task = checkTask(
    await client.patch<TaskDetails>(`/cards/${id}`, { listId, position }, { signal }),
    id,
  )
  if (task.listId !== listId || task.position !== position) {
    throw new ApiError('unknown', 'Could not confirm the move. Check the task location.')
  }
  return task
}

export async function createTask(
  client: ReturnType<typeof createApiClient>,
  columnId: number,
  taskData: { title: string; description: string; position: number },
  signal?: AbortSignal,
) {
  const task = await client.post<TaskDetails>(`/lists/${columnId}/cards`, taskData, { signal })
  if (!task || !Number.isInteger(task.id) || task.id <= 0 || task.listId !== columnId) {
    throw new ApiError(
      'unknown',
      'Could not confirm the new task. Check the column before trying again.',
    )
  }
  return checkTask(task, task.id)
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

// The API updates one card at a time. Callers must refetch after any uncertain outcome.
export async function placeTask(
  client: ReturnType<typeof createApiClient>,
  id: number,
  listId: number,
  index: number,
  signal?: AbortSignal,
) {
  const tasks = await getTasks(client, listId, signal)
  const ordered = tasks.filter((task) => task.id !== id).map((task) => task.id)
  ordered.splice(Math.max(0, Math.min(index, ordered.length)), 0, id)
  for (const [position, taskId] of ordered.entries()) {
    const existing = tasks.find((task) => task.id === taskId)
    if (existing?.position === position) continue
    await moveTask(client, taskId, listId, position, signal)
  }
  const confirmed = await getTasks(client, listId, signal)
  if (
    confirmed.length !== ordered.length ||
    confirmed.some((task, position) => task.id !== ordered[position] || task.position !== position)
  ) {
    throw new ApiError('unknown', 'Could not confirm the task order. Check the reloaded board.')
  }
}

import { describe, expect, it, vi } from 'vitest'
import { CanceledError } from 'axios'
import { ApiError } from '@/api/errors'
import { useApiRequest } from '@/composables/useApiRequest'

describe('API request state', () => {
  it('returns real data and resets loading on success', async () => {
    const state = useApiRequest()
    const promise = state.execute(async () => ['real data'])
    expect(state.loading.value).toBe(true)
    await expect(promise).resolves.toEqual({ ok: true, data: ['real data'] })
    expect(state.loading.value).toBe(false)
    expect(state.error.value).toBeNull()
  })

  it('exposes actionable failures without fake data, then clears errors on retry', async () => {
    const state = useApiRequest()
    await expect(
      state.execute(() => Promise.reject(new ApiError('unavailable', 'Check the API.'))),
    ).resolves.toEqual({ ok: false })
    expect(state.loading.value).toBe(false)
    expect(state.error.value?.message).toBe('Check the API.')
    await state.execute(async () => [])
    expect(state.error.value).toBeNull()
  })

  it('prevents duplicate submissions while a request is pending', async () => {
    const state = useApiRequest()
    let finish!: () => void
    const pending = state.execute(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const duplicate = vi.fn<() => Promise<void>>()
    await state.execute(duplicate)
    expect(duplicate).not.toHaveBeenCalled()
    finish()
    await pending
    expect(state.loading.value).toBe(false)
  })

  it('distinguishes a successful empty response from a failed request', async () => {
    const state = useApiRequest()
    await expect(state.execute(async () => undefined)).resolves.toEqual({
      ok: true,
      data: undefined,
    })
  })

  it('ends loading without a user-facing error on cancellation', async () => {
    const state = useApiRequest()
    await state.execute(() => Promise.reject(new CanceledError()))
    expect(state.loading.value).toBe(false)
    expect(state.error.value).toBeNull()
  })
})

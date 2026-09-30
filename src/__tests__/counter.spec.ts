import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useCounterStore } from '../stores/counter'

describe('counter store scaffold', () => {
  it('updates derived state and keeps separate application instances isolated', () => {
    setActivePinia(createPinia())
    const first = useCounterStore()
    first.increment()
    first.increment()
    expect(first.count).toBe(2)
    expect(first.doubleCount).toBe(4)

    setActivePinia(createPinia())
    expect(useCounterStore().count).toBe(0)
    expect(first.count).toBe(2)
  })
})

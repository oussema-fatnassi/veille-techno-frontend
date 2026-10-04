import { watch } from 'vue'
import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export function installSessionNavigation(router: Router, pinia: Pinia) {
  const auth = useAuthStore(pinia)
  const removeGuard = router.beforeEach((to) => {
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: 'login', replace: true }
    }
  })
  const stopWatching = watch(
    () => auth.sessionVersion,
    () => {
      if (!auth.isAuthenticated && router.currentRoute.value.meta.requiresAuth) {
        void router.replace({ name: 'login' })
      }
    },
    { flush: 'sync' },
  )
  return () => {
    removeGuard()
    stopWatching()
  }
}

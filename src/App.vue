<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <component
      :is="Component"
      v-if="!route.meta.requiresAuth || auth.isAuthenticated"
      :key="route.meta.requiresAuth ? auth.sessionVersion : route.path"
    />
  </RouterView>
</template>

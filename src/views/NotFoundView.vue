<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="min-h-screen bg-surface p-6">
    <h1 class="text-2xl font-bold">Page not found</h1>

    <p class="mt-2">The page you are looking for does not exist.</p>

    <RouterLink
      :to="{ name: 'login' }"
      class="mt-4 inline-block text-primary underline"
    >
      Back to login
    </RouterLink>
  </main>
</template>
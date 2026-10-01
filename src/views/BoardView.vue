<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="min-h-screen bg-page p-6">
    <header>
      <h1 class="text-2xl font-bold">My board</h1>

      <RouterLink :to="{ name: 'login' }" class="mt-2 inline-block text-primary underline">
        Back to login
      </RouterLink>
    </header>
  </main>
</template>

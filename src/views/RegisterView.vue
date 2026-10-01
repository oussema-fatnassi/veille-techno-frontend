<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import BaseInput from '../components/ui/BaseInput.vue'

const name = ref('')
const email = ref('')
const password = ref('')
</script>

<template>
  <main class="min-h-screen bg-surface p-6">
    <section aria-labelledby="register-title" class="max-w-sm">
      <h1 id="register-title" class="text-2xl font-bold">Create an account</h1>

      <form class="mt-6 space-y-4" novalidate @submit.prevent>
        <BaseInput
          id="name"
          v-model="name"
          label="Name"
          autocomplete="name"
          required
        />

        <BaseInput
          id="email"
          v-model="email"
          label="Email"
          type="email"
          autocomplete="email"
          required
        />

        <BaseInput
          id="password"
          v-model="password"
          label="Password"
          type="password"
          autocomplete="new-password"
          required
        />

        <Button type="submit" label="Create account" />
      </form>

      <p class="mt-4">
        Already have an account?
        <RouterLink :to="{ name: 'login' }" class="text-primary underline">
          Log in
        </RouterLink>
      </p>
    </section>
  </main>
</template>

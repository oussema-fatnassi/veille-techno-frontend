<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import BaseInput from '@/components/ui/BaseInput.vue'

import isEmail from 'validator/lib/isEmail'
import isLength from 'validator/lib/isLength'
import { validateRegistrationPassword } from '@/validation/auth'

const name = ref('')
const email = ref('')
const password = ref('')

const submitted = ref(false)

const nameError = ref('')
const emailError = ref('')
const passwordError = ref('')

const nameInput = ref<InstanceType<typeof BaseInput> | null>(null)
const emailInput = ref<InstanceType<typeof BaseInput> | null>(null)
const passwordInput = ref<InstanceType<typeof BaseInput> | null>(null)

function validateName() {
  if (!submitted.value) return

  if (!name.value.trim()) {
    nameError.value = 'Name is required.'
  } else if (!isLength(name.value, { min: 1, max: 32 })) {
    nameError.value = 'Name must be between 1 and 32 characters.'
  } else {
    nameError.value = ''
  }
}

function validateEmail() {
  if (!submitted.value) return

  if (!email.value.trim()) {
    emailError.value = 'Email is required.'
  } else if (!isEmail(email.value)) {
    emailError.value = 'Enter a valid email address, for example name@example.com.'
  } else {
    emailError.value = ''
  }
}

function validatePassword() {
  if (!submitted.value) return

  passwordError.value = validateRegistrationPassword(password.value)
}

function handleSubmit() {
  submitted.value = true

  validateName()
  validateEmail()
  validatePassword()

  if (nameError.value) {
    nameInput.value?.focus()
    return
  }

  if (emailError.value) {
    emailInput.value?.focus()
    return
  }

  if (passwordError.value) {
    passwordInput.value?.focus()
    return
  }
}
</script>

<template>
  <main class="min-h-screen bg-surface p-6">
    <section aria-labelledby="register-title" class="max-w-sm">
      <h1 id="register-title" class="text-2xl font-bold">Create an account</h1>

      <form class="mt-6 space-y-4" novalidate @submit.prevent="handleSubmit">
        <BaseInput
          id="name"
          ref="nameInput"
          v-model="name"
          label="Name"
          :error="nameError"
          autocomplete="name"
          required
          @input="validateName"
        />

        <BaseInput
          id="email"
          ref="emailInput"
          v-model="email"
          :error="emailError"
          label="Email"
          type="email"
          autocomplete="email"
          required
          @input="validateEmail"
        />

        <BaseInput
          id="password"
          ref="passwordInput"
          v-model="password"
          label="Password"
          type="password"
          autocomplete="new-password"
          :error="passwordError"
          required
          @input="validatePassword"
        />

        <Button type="submit" label="Create account" />
      </form>

      <p class="mt-4">
        Already have an account?
        <RouterLink :to="{ name: 'login' }" class="text-primary underline"> Log in </RouterLink>
      </p>
    </section>
  </main>
</template>

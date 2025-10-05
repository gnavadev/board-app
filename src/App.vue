<template>
  <Board v-if="session" :session="session" />
  <Login v-else />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'
import Board from './components/Board.vue'
import Login from './components/Login.vue'

const session = ref<Session | null>(null)

onMounted(() => {
  // Check for an existing session when the app loads
  supabase.auth.getSession().then(({ data }) => {
    session.value = data.session
  })

  // Listen for changes in authentication state (login/logout)
  supabase.auth.onAuthStateChange((_event, _session) => {
    session.value = _session
  })
})
</script>

<style>
/* Reset some default styles */
body, #app {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
}
</style>
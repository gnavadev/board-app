<template>
  <div class="login-container">
    <div class="login-box">
      <h1>Post-It Board</h1>
      <p>Sign in to create and view your post-it note.</p>
      <div class="login-buttons">
        <button class="github-btn" @click="handleSignIn('github')">
          <icon-mdi-github />
          <span>Sign In with GitHub</span>
        </button>
        <button class="linkedin-btn" @click="handleSignIn('linkedin_oidc', { scopes: 'openid profile email' })">
          <icon-mdi-linkedin />
          <span>Sign In with LinkedIn</span>
        </button>
      </div>
      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

      <a href="https://www.linkedin.com/in/gabriel-nava-dev/" target="_blank" rel="noopener noreferrer" class="connect-btn">
        <icon-mdi-linkedin />
        <span>Connect with me!</span>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { supabase } from '../supabase';
import type { Provider } from '@supabase/supabase-js';

const errorMsg = ref<string | null>(null);

async function handleSignIn(provider: Provider, options?: { scopes: string }) {
  errorMsg.value = null;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options,
  });
  if (error) {
    errorMsg.value = `Error: ${error.message}`;
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
  background-color: #b58b4c;
  background-image: radial-gradient(rgba(0,0,0,0.1) 1px, transparent 1px);
  background-size: 20px 20px;
  padding: 20px;
}
.login-box {
  background: #fff475;
  font-family: "Comic Sans MS", cursive;
  color: #333;
  padding: 30px 40px;
  border-radius: 10px;
  box-shadow: 5px 5px 15px rgba(0,0,0,0.2);
  text-align: center;
  max-width: 400px;
  width: 100%;
  transform: rotate(-1deg);
}
h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
}
p {
  font-size: 1.1rem;
  margin-bottom: 24px;
}
.login-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 20px;
  font-size: 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: white;
  font-family: sans-serif;
}
.github-btn {
  background-color: #333;
}
.github-btn:hover {
  background-color: #444;
}
.linkedin-btn {
  background-color: #0077B5;
}
.linkedin-btn:hover {
  background-color: #005e90;
}
.connect-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 30px;
  text-decoration: none;
  color: #0077B5;
  font-family: sans-serif;
  font-weight: bold;
  opacity: 0.8;
  transition: opacity 0.2s;
}
.connect-btn:hover {
  opacity: 1;
}
.error {
  margin-top: 15px;
  color: #d93025;
  font-family: sans-serif;
}
</style>
<template>
  <div class="board-viewport" @mousedown="startPan" @wheel.prevent="onZoom">
    <div class="board" :style="boardStyle">
      <PostIt v-if="postIt" :key="postIt.id" v-bind="postIt" @update="updatePostIt" @move="updatePostIt"
        @remove="removePostIt" />
    </div>

    <div class="ui-overlay">
      <div class="add-controls">
        <div v-if="!postIt && !loading">
          <button class="add-btn" @click="toggleColorPicker">
            <icon-ic-baseline-add-circle /> Add Your Post-It
          </button>
          <div v-if="isColorPickerVisible" class="color-picker">
            <button v-for="color in pastelColors" :key="color" :style="{ backgroundColor: color }" class="color-swatch"
              @click="createPostIt(color)"></button>
          </div>
        </div>
        <button v-else-if="postIt && !loading" class="add-btn" @click="goToPostIt">
          <icon-mdi-arrow-right-thin-circle-outline /> Go to My Post-It
        </button>
        <a href="https://www.linkedin.com/in/gabriel-nava-dev/" target="_blank" rel="noopener noreferrer"
          class="connect-btn">
          <icon-mdi-linkedin />
          <span>Connect with me!</span>
        </a>
      </div>
      <button @click="signOut" class="sign-out-btn">Sign Out</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { supabase } from "../supabase";
import type { Session } from "@supabase/supabase-js";
import PostIt from "./PostIt.vue";
import type { PostItData } from "@/types/PostIt";

const props = defineProps<{ session: Session }>();

const postIt = ref<PostItData | null>(null);
const loading = ref(true);

// --- Fetch data on component mount ---
onMounted(async () => {
  const { data, error } = await supabase
    .from("postits")
    .select("*")
    .eq("user_id", props.session.user.id)
    .single(); // Expect only one or zero rows

  if (error && error.code !== "PGRST116") {
    // Ignore "No rows found" error
    console.error("Error fetching post-it:", error);
  }
  if (data) {
    postIt.value = data;
  }
  loading.value = false;
});

// --- Supabase CRUD Functions ---
async function createPostIt(color: string) {
  if (postIt.value) return; // User already has a post-it
  isColorPickerVisible.value = false;

  const { data, error } = await supabase
    .from("postits")
    .insert({
      user_id: props.session.user.id,
      x: (window.innerWidth / 2 - translateX.value) / scale.value,
      y: (window.innerHeight / 2 - translateY.value) / scale.value,
      color: color,
      mode: "text",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating post-it:", error);
  } else {
    postIt.value = data;
  }
}

async function updatePostIt(updated: Partial<PostItData> & { id: string }) {
  if (!postIt.value) return;

  // Optimistically update local state for better UX
  Object.assign(postIt.value, updated);

  const { error } = await supabase
    .from("postits")
    .update(updated) // Send only the changed fields
    .eq("id", updated.id);

  if (error) console.error("Error updating post-it:", error);
}

async function removePostIt(id: string) {
  const { error } = await supabase.from("postits").delete().eq("id", id);

  if (error) {
    console.error("Error removing post-it:", error);
  } else {
    postIt.value = null;
  }
}

async function signOut() {
  await supabase.auth.signOut();
}

function goToPostIt() {
  if (!postIt.value) return;

  const newScale = 1; // Zoom to 100%

  // Target the center of the post-it (it's 220x250px)
  const targetX = postIt.value.x + 220 / 2;
  const targetY = postIt.value.y + 250 / 2;

  // Calculate the translation needed to center the target
  translateX.value = window.innerWidth / 2 - targetX * newScale;
  translateY.value = window.innerHeight / 2 - targetY * newScale;
  scale.value = newScale;
}

// (The rest of your script: pan/zoom logic, color picker, etc.)
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
const isPanning = ref(false);
let panStartX = 0;
let panStartY = 0;

const isColorPickerVisible = ref(false);
const pastelColors = ["#fff475", "#ffb5e8", "#b5e8ff", "#b5ffb7", "#ffd5b5"];

const boardStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  cursor: isPanning.value ? "grabbing" : "grab",
}));

function toggleColorPicker() {
  isColorPickerVisible.value = !isColorPickerVisible.value;
}
function startPan(e: MouseEvent) {
  if ((e.target as HTMLElement).closest(".postit, .ui-overlay")) return;
  isPanning.value = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  window.addEventListener("mousemove", onPan);
  window.addEventListener("mouseup", endPan, { once: true });
}
function onPan(e: MouseEvent) {
  if (!isPanning.value) return;
  const dx = e.clientX - panStartX;
  const dy = e.clientY - panStartY;
  translateX.value += dx;
  translateY.value += dy;
  panStartX = e.clientX;
  panStartY = e.clientY;
}
function endPan() {
  isPanning.value = false;
  window.removeEventListener("mousemove", onPan);
}
function onZoom(e: WheelEvent) {
  const zoomIntensity = 0.1;
  const direction = e.deltaY < 0 ? 1 : -1;
  const newScale = scale.value + direction * zoomIntensity * scale.value;
  if (newScale < 0.1 || newScale > 10) return;
  const mouseX = e.clientX;
  const mouseY = e.clientY;
  translateX.value =
    mouseX - (mouseX - translateX.value) * (newScale / scale.value);
  translateY.value =
    mouseY - (mouseY - translateY.value) * (newScale / scale.value);
  scale.value = newScale;
}
</script>

<style scoped>
.board-viewport {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background-color: #b58b4c;
  background-image: radial-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px);
  background-size: 20px 20px;
  box-shadow: inset 0 0 50px rgba(0, 0, 0, 0.1);
}

.board {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);
}

.ui-overlay {
  position: fixed;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 100;
  pointer-events: none;
}

.add-controls {
  pointer-events: auto;
  width: fit-content;
  display: flex;
  align-items: center;
  gap: 20px;
}

.add-controls,
.sign-out-btn {
  pointer-events: auto;
}

.add-btn {
  background: #fdf3d0;
  border: 1px solid #d3c8aa;
  border-radius: 10px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5em;
}

.add-btn:hover {
  transform: scale(1.05);
  border-color: #bcae8c;
}

.color-picker {
  display: flex;
  gap: 8px;
  background: #fff;
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  margin-top: 10px;
}

.color-swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #fff;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;
}

.color-swatch:hover {
  transform: scale(1.15);
}

.sign-out-btn {
  position: absolute;
  top: 0;
  right: 0;
  background: #d9534f;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 16px;
  box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.2);
}

.sign-out-btn:hover {
  background: #c9302c;
}

.connect-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: #fdf3d0;
  font-weight: bold;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.connect-btn:hover {
  opacity: 1;
}
</style>
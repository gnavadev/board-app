<template>
  <div
    class="postit"
    :style="{ left: x + 'px', top: y + 'px', backgroundColor: color, '--rotation': Math.random().toString() }"
    @mousedown="startDrag"
  >
    <div class="postit-toolbar">
      <button @click="setMode('text')" :class="{ active: mode === 'text' }" title="Text Tool">
        <icon-ic-baseline-edit-note />
      </button>
      <button @click="setMode('draw')" :class="{ active: mode === 'draw' }" title="Pen Tool">
        <icon-ic-baseline-draw />
      </button>
      <button @click="setMode('erase')" :class="{ active: mode === 'erase' }" title="Eraser Tool">
        <icon-mdi-eraser />
      </button>
      <div class="spacer"></div>
      <button @click="remove" title="Remove Post-It">
        <icon-ic-baseline-close />
      </button>
    </div>
    
    <div class="postit-content" ref="contentArea">
      <textarea
        v-model="text"
        placeholder="Leave me a message or a Drawing!"
        class="postit-text"
        spellcheck="false"
      ></textarea>
      
      <canvas
        ref="canvas"
        :class="{ 
          'drawing-active': mode === 'draw' || mode === 'erase',
          'eraser-cursor': mode === 'erase' 
        }"
        @mousedown="startDrawing"
        @mousemove="draw"
        @mouseup="stopDrawing"
        @mouseleave="stopDrawing"
      ></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, defineEmits } from 'vue'
import { watchDebounced } from '@vueuse/core'

const props = defineProps({
  id: String,
  x: Number,
  y: Number,
  color: String,
  mode: String,
  ownerId: String,
  // Props to receive saved data from Supabase
  text_content: String,
  canvas_content: String,
})

const emit = defineEmits(['update', 'remove', 'move'])

// --- Local State Initialization ---
const x = ref(props.x || 100)
const y = ref(props.y || 100)
const mode = ref<'draw' | 'text' | 'erase'>(props.mode as any || 'text')
const text = ref(props.text_content || '') // Initialize with text from DB
const color = props.color || '#fff475'
const dragging = ref(false)
let offsetX = 0, offsetY = 0

// --- Save text content automatically when user stops typing ---
watchDebounced(text, (newText) => {
  // Only emit if the text has actually changed from what's in the DB
  if (newText !== props.text_content) {
    emit('update', { id: props.id, text_content: newText })
  }
}, { debounce: 500, maxWait: 2000 }) // Saves 500ms after typing stops

// --- Drag and Move Logic ---
function startDrag(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.tagName === 'CANVAS' || target.tagName === 'TEXTAREA' || target.closest('button')) {
    return
  }
  dragging.value = true
  offsetX = e.clientX - x.value
  offsetY = e.clientY - y.value
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}

function onDrag(e: MouseEvent) { 
  if (!dragging.value) return; 
  x.value = e.clientX - offsetX; 
  y.value = e.clientY - offsetY; 
  // Emit a 'move' event with all necessary data for an update
  emit('move', { id: props.id, x: x.value, y: y.value }) 
}

function stopDrag() { 
  dragging.value = false; 
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag)
}

// --- Tool and Remove Logic ---
function setMode(newMode: 'draw' | 'text' | 'erase') {
  mode.value = newMode
  emit('update', { id: props.id, mode: newMode })
}

function remove() { 
  emit('remove', props.id) 
}

// --- Drawing and Erasing Logic ---
const canvas = ref<HTMLCanvasElement | null>(null)
const contentArea = ref<HTMLDivElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let drawing = false

onMounted(() => {
  if (canvas.value && contentArea.value) {
    const width = contentArea.value.clientWidth
    const height = contentArea.value.clientHeight
    canvas.value.width = width
    canvas.value.height = height
    ctx = canvas.value.getContext('2d')
    if (ctx) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Load existing drawing from the database when component mounts
      if (props.canvas_content) {
        const image = new Image()
        image.onload = () => {
          ctx?.drawImage(image, 0, 0)
        }
        image.src = props.canvas_content
      }
    }
  }
})

function startDrawing(e: MouseEvent) {
  if ((mode.value !== 'draw' && mode.value !== 'erase') || !ctx) return
  if (mode.value === 'draw') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 2
  } else {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = 20
  }
  drawing = true
  ctx.beginPath()
  ctx.moveTo(e.offsetX, e.offsetY)
}

function draw(e: MouseEvent) {
  if (!drawing || !ctx) return
  ctx.lineTo(e.offsetX, e.offsetY)
  ctx.stroke()
}

function stopDrawing() {
  if (!drawing) return
  drawing = false
  ctx?.closePath()

  // Save canvas drawing when user finishes a stroke
  if (canvas.value) {
    const canvasData = canvas.value.toDataURL() // Convert drawing to text
    emit('update', { id: props.id, canvas_content: canvasData })
  }
}
</script>

<style scoped>
.postit {
  position: absolute;
  width: 220px;
  height: 250px;
  border-radius: 10px;
  box-shadow: 3px 3px 8px rgba(0, 0, 0, 0.2);
  padding: 5px;
  display: flex;
  flex-direction: column;
  cursor: grab;
  user-select: none;
  transform: rotate(calc(-2deg + 4deg * var(--rotation, 0.5)));
}
.postit-toolbar {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
  align-items: center;
}
.postit-toolbar button {
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #555;
  transition: background-color 0.2s;
}
.postit-toolbar button:hover {
  background-color: rgba(0, 0, 0, 0.1);
}
.postit-toolbar button.active {
  background-color: rgba(0, 0, 0, 0.15);
}
.spacer {
  flex-grow: 1;
}
.postit-content {
  position: relative;
  flex-grow: 1;
}
.postit-text,
canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 6px;
}
.postit-text {
  resize: none;
  border: none;
  background: transparent;
  outline: none;
  font-family: "Comic Sans MS", cursive;
  font-size: 14px;
  padding: 8px;
  box-sizing: border-box;
}
canvas {
  background-color: transparent;
  pointer-events: none;
}
canvas.drawing-active {
  pointer-events: auto;
  cursor: crosshair;
}
canvas.eraser-cursor {
  cursor: url("data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3ccircle cx='10' cy='10' r='8' stroke='black' stroke-width='1.5' fill='white'/%3e%3c/svg%3e") 10 10, auto;
}
</style>
<template>
  <div
    ref="postitEl"
    class="postit"
    :style="{ left: localX + 'px', top: localY + 'px', backgroundColor: color }"
    :class="{ 'is-dragging-remotely': isBeingDragged }"
    @mousedown="dragHandlers.start"
  >
    <div v-if="canEdit" class="postit-toolbar">
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
      <button @click="removePostit" title="Remove Post-It">
        <icon-ic-baseline-close />
      </button>
    </div>

    <div class="postit-content" :class="{ 'no-toolbar': !canEdit }" ref="contentArea">
      <textarea
        v-model="text"
        :readonly="!canEdit"
        placeholder="Leave a message..."
        class="postit-text"
        spellcheck="false"
        @focus="isTextareaFocused = true"
        @blur="isTextareaFocused = false"
      ></textarea>
      <canvas
        ref="canvas"
        :class="{ 'drawing-active': isDrawingActive, 'eraser-cursor': mode === 'erase' }"
        @mousedown="canvasHandlers.start"
        @mousemove="canvasHandlers.draw"
        @mouseup="canvasHandlers.stop"
        @mouseleave="canvasHandlers.stop"
      ></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick, type Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { Session, RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase'

type EditMode = 'draw' | 'text' | 'erase'

interface PostItData {
  x: number
  y: number
  mode: EditMode
  text_content: string | null
  canvas_content: string | null
}

const props = defineProps<{
  id: string
  user_id?: string
  x: number
  y: number
  color?: string
  mode?: EditMode
  text_content?: string | null
  canvas_content?: string | null
  session: Session
  isBeingDragged?: boolean
}>()

const emit = defineEmits<{
  (e: 'update', payload: { id: string } & Partial<PostItData>): void
  (e: 'remove', id: string): void
}>()

const postitEl = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const contentArea = ref<HTMLDivElement | null>(null)

const localX = ref(props.x)
const localY = ref(props.y)
const text = ref(props.text_content || '')
const mode = ref<EditMode>(props.mode || 'text')
const color = props.color || '#fff475'
const isTextareaFocused = ref(false)

const canEdit = computed(() => {
  const isOwner = props.session?.user?.id === props.user_id
  const isAdmin = props.session?.user?.user_metadata?.role === 'admin'
  return isOwner || isAdmin
})

const isDrawingActive = computed(() => canEdit.value && (mode.value === 'draw' || mode.value === 'erase'))

const useDraggable = (channel: Ref<RealtimeChannel | undefined>) => {
  const dragging = ref(false)
  let offsetX = 0
  let offsetY = 0
  let throttleTimeout: number | null = null

  const onDrag = (e: MouseEvent) => {
    if (!dragging.value) return
    localX.value = e.clientX - offsetX
    localY.value = e.clientY - offsetY

    if (throttleTimeout) return
    throttleTimeout = window.setTimeout(() => {
      throttleTimeout = null
      channel.value?.send({
        type: 'broadcast',
        event: 'drag_move',
        payload: { id: props.id, x: localX.value, y: localY.value },
      })
    }, 50)
  }

  const stopDrag = () => {
    if (!dragging.value) return
    dragging.value = false
    channel.value?.send({ type: 'broadcast', event: 'drag_end', payload: { id: props.id } })
    emit('update', { id: props.id, x: localX.value, y: localY.value })
    window.removeEventListener('mousemove', onDrag)
    window.removeEventListener('mouseup', stopDrag)
    document.body.removeEventListener('mouseleave', stopDrag)
  }

  const startDrag = (e: MouseEvent) => {
    if (!canEdit.value || (e.target as HTMLElement).closest('button, textarea, canvas')) return
    dragging.value = true
    offsetX = e.clientX - localX.value
    offsetY = e.clientY - localY.value
    channel.value?.send({
      type: 'broadcast',
      event: 'drag_start',
      payload: { id: props.id, user_id: props.session.user.id },
    })
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', stopDrag)
    document.body.addEventListener('mouseleave', stopDrag)
  }

  return { start: startDrag }
}

const useCanvas = (canvasEl: Ref<HTMLCanvasElement | null>) => {
  let ctx: CanvasRenderingContext2D | null = null
  let isDrawing = false
  const lastPos = ref({ x: 0, y: 0 })

  const setup = () => {
    if (!canvasEl.value || !contentArea.value) return
    const { clientWidth, clientHeight } = contentArea.value
    canvasEl.value.width = clientWidth
    canvasEl.value.height = clientHeight
    ctx = canvasEl.value.getContext('2d')
    if (ctx) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      load(props.canvas_content)
    }
  }

  const load = (dataUrl?: string | null) => {
    if (!ctx || !canvasEl.value) return
    ctx.clearRect(0, 0, canvasEl.value.width, canvasEl.value.height)
    if (dataUrl) {
      const image = new Image()
      image.onload = () => ctx?.drawImage(image, 0, 0)
      image.src = dataUrl
    }
  }

  const start = (e: MouseEvent) => {
    if (!isDrawingActive.value || !ctx) return
    isDrawing = true
    lastPos.value = { x: e.offsetX, y: e.offsetY }
    ctx.globalCompositeOperation = mode.value === 'draw' ? 'source-over' : 'destination-out'
    ctx.strokeStyle = '#222'
    ctx.lineWidth = mode.value === 'draw' ? 2 : 20
  }

  const draw = (e: MouseEvent) => {
    if (!isDrawing || !ctx) return
    ctx.beginPath()
    ctx.moveTo(lastPos.value.x, lastPos.value.y)
    ctx.lineTo(e.offsetX, e.offsetY)
    ctx.stroke()
    lastPos.value = { x: e.offsetX, y: e.offsetY }
  }

  const stop = () => {
    if (!isDrawing) return
    isDrawing = false
    ctx?.closePath()
    if (canvasEl.value) {
      emit('update', { id: props.id, canvas_content: canvasEl.value.toDataURL() })
    }
  }

  watch(() => props.canvas_content, (newData) => load(newData))

  onMounted(() => nextTick(setup))

  return { start, draw, stop }
}

let eventsChannel = ref<RealtimeChannel>()
const dragHandlers = useDraggable(eventsChannel)
const canvasHandlers = useCanvas(canvas)

onMounted(() => {
  eventsChannel.value = supabase.channel(`postit_${props.id}`)
  eventsChannel.value.subscribe()
})

onUnmounted(() => {
  if (eventsChannel.value) {
    supabase.removeChannel(eventsChannel.value)
  }
})

watch(() => props.x, (newX) => (localX.value = newX))
watch(() => props.y, (newY) => (localY.value = newY))
watch(
  () => props.text_content,
  (newText) => {
    if (!isTextareaFocused.value && newText !== text.value) {
      text.value = newText || ''
    }
  }
)

watchDebounced(
  text,
  (newText) => {
    if (canEdit.value && newText !== props.text_content) {
      emit('update', { id: props.id, text_content: newText })
    }
  },
  { debounce: 500, maxWait: 2000 }
)

function setMode(newMode: EditMode) {
  if (!canEdit.value) return
  mode.value = newMode
  emit('update', { id: props.id, mode: newMode })
}

function removePostit() {
  if (!canEdit.value) return
  emit('remove', props.id)
}
</script>

<style scoped>
.postit {
  position: absolute;
  width: 220px;
  height: 250px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 5px;
  display: flex;
  flex-direction: column;
  cursor: grab;
  user-select: none;
  transition: opacity 0.3s ease;
}
.postit:not(:has(.postit-toolbar)) {
  cursor: default;
}
.is-dragging-remotely {
  opacity: 0.5;
  pointer-events: none;
}
.postit-toolbar {
  display: flex;
  gap: 4px;
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
  background-color: rgba(0, 0, 0, 0.08);
}
.postit-toolbar button.active {
  background-color: rgba(0, 0, 0, 0.12);
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
.postit-content.no-toolbar .postit-text,
.postit-content.no-toolbar canvas {
  top: 10px;
  height: calc(100% + 30px);
}
.postit-text {
  resize: none;
  border: none;
  background: transparent;
  outline: none;
  font-family: sans-serif;
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
  cursor: url("data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3ccircle cx='10' cy='10' r='8' stroke='black' stroke-width='1.5' fill='white'/%3e%3c/svg%3e")
    10 10,
    auto;
}
</style>
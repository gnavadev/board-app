<template>
  <div class="board-viewport" @mousedown="panHandlers.start" @wheel.prevent="panHandlers.zoom">
    <div class="board" :style="boardStyle">
      <PostIt
        v-for="note in postIts"
        :key="note.id"
        v-bind="note"
        :session="session"
        :is-being-dragged="remotelyDraggedIds.has(note.id)"
        @update="updatePostIt"
        @remove="removePostIt"
      />
    </div>

    <div class="online-cursors">
      <div
        v-for="cursor in onlineCursors"
        :key="cursor.user_id"
        class="remote-cursor"
        :style="getCursorStyle(cursor)"
      >
        <icon-material-symbols-arrow-selector-tool-rounded
          class="cursor-dot"
          :style="{ color: cursor.color }"
        />
        <div class="cursor-label">{{ cursor.displayName }}</div>
      </div>
    </div>

    <div class="ui-overlay">
      <div class="add-controls">
        <div v-if="!currentUserPostIt && !loading">
          <button class="add-btn" @click="isColorPickerVisible = !isColorPickerVisible">
            <icon-ic-baseline-add-circle /> Add Your Post-It
          </button>
          <div v-if="isColorPickerVisible" class="color-picker">
            <button
              v-for="color in pastelColors"
              :key="color"
              :style="{ backgroundColor: color }"
              class="color-swatch"
              @click="handleCreatePostIt(color)"
            ></button>
          </div>
        </div>
        <button v-else-if="currentUserPostIt && !loading" class="add-btn" @click="goToPostIt">
          <icon-mdi-arrow-right-thin-circle-outline /> My Post-it
        </button>
        <a href="https://www.linkedin.com/in/gabriel-nava-dev/" target="_blank" rel="noopener noreferrer" class="connect-btn">
          <icon-mdi-linkedin />
          <span>Connect with me</span>
        </a>
      </div>
      <button @click="signOut" class="sign-out-btn">Sign Out</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive, type Ref, type ComputedRef } from 'vue'
import { supabase } from '../supabase'
import type { Session, RealtimeChannel } from '@supabase/supabase-js'
import PostIt from './PostIt.vue'
import type { PostItData, CursorData } from '@/types' 

const props = defineProps<{ session: Session }>()

// --- Composables ---
const useBoardPanAndZoom = () => {
  const scale = ref(1)
  const translateX = ref(0)
  const translateY = ref(0)
  const isPanning = ref(false)
  let panStartX = 0
  let panStartY = 0

  const boardStyle = computed(() => ({
    transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
    cursor: isPanning.value ? 'grabbing' : 'grab',
  }))

  const onPan = (e: MouseEvent) => {
    if (!isPanning.value) return
    translateX.value += e.clientX - panStartX
    translateY.value += e.clientY - panStartY
    panStartX = e.clientX
    panStartY = e.clientY
  }

  const endPan = () => {
    isPanning.value = false
    window.removeEventListener('mousemove', onPan)
  }

  const startPan = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.postit, .ui-overlay')) return
    isPanning.value = true
    panStartX = e.clientX
    panStartY = e.clientY
    window.addEventListener('mousemove', onPan)
    window.addEventListener('mouseup', endPan, { once: true })
  }

  const onZoom = (e: WheelEvent) => {
    const zoomIntensity = 0.1
    const direction = e.deltaY < 0 ? 1 : -1
    const newScale = Math.max(0.1, Math.min(10, scale.value + direction * zoomIntensity * scale.value))
    translateX.value = e.clientX - (e.clientX - translateX.value) * (newScale / scale.value)
    translateY.value = e.clientY - (e.clientY - translateY.value) * (newScale / scale.value)
    scale.value = newScale
  }

  return { scale, translateX, translateY, boardStyle, panHandlers: { start: startPan, zoom: onZoom } }
}

const usePostItData = (session: Session) => {
  const postIts = ref<PostItData[]>([])
  const loading = ref(true)

  const currentUserPostIt: ComputedRef<PostItData | undefined> = computed(() =>
    postIts.value.find(p => p.user_id === session.user.id)
  )

  const fetchPostIts = async () => {
    loading.value = true
    const { data } = await supabase.from('postits').select('*')
    postIts.value = data || []
    loading.value = false
  }

  const createPostIt = async (newPost: Omit<PostItData, 'id' | 'created_at'>) => {
    await supabase.from('postits').insert(newPost)
  }

  const updatePostIt = async (updated: Partial<PostItData> & { id: string }) => {
    await supabase.from('postits').update(updated).eq('id', updated.id)
  }

  const removePostIt = async (id: string) => {
    await supabase.from('postits').delete().eq('id', id)
  }

  onMounted(fetchPostIts)

  return { postIts, loading, currentUserPostIt, createPostIt, updatePostIt, removePostIt }
}

const useRealtimeEvents = (postIts: Ref<PostItData[]>, session: Session) => {
  const remotelyDraggedIds = ref(new Set<string>())
  const onlineCursors = reactive<Record<string, CursorData>>({})
  const userColors = reactive<Record<string, string>>({})
  const cursorColors = ['#e6194b', '#3cb44b', '#ffe119', '#0082c8', '#f58231', '#911eb4', '#46f0f0', '#f032e6']

  const getUserColor = (userId: string) => {
    if (!userColors[userId]) {
      userColors[userId] = cursorColors[Math.floor(Math.random() * cursorColors.length)]
    }
    return userColors[userId]
  }
  
  const setupDbSubscriptions = () => {
    return supabase.channel('public:postits')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'postits' }, 
        (payload) => postIts.value.push(payload.new as PostItData))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'postits' }, 
        (payload) => {
          const index = postIts.value.findIndex(p => p.id === payload.new.id)
          if (index > -1) Object.assign(postIts.value[index], payload.new)
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'postits' }, 
        (payload) => postIts.value = postIts.value.filter(p => p.id !== payload.old.id))
      .subscribe()
  }

  const setupEventSubscriptions = () => {
    return supabase.channel('board_events')
      .on('broadcast', { event: 'drag_start' }, 
        ({ payload }) => remotelyDraggedIds.value.add(payload.id))
      .on('broadcast', { event: 'drag_move' }, 
        ({ payload }) => {
          const note = postIts.value.find(p => p.id === payload.id)
          if (note) {
            note.x = payload.x
            note.y = payload.y
          }
        })
      .on('broadcast', { event: 'drag_end' }, 
        ({ payload }) => remotelyDraggedIds.value.delete(payload.id))
      .subscribe()
  }

  const setupCursorSubscriptions = (animate: () => void) => {
    const channel = supabase.channel('board_cursors')
    channel.on('broadcast', { event: 'cursor_move' }, ({ payload: cursor }) => {
      if (cursor.user_id !== session.user.id) {
        if (!onlineCursors[cursor.user_id]) {
          onlineCursors[cursor.user_id] = { ...cursor, color: getUserColor(cursor.user_id) }
        }
        onlineCursors[cursor.user_id].targetX = cursor.x
        onlineCursors[cursor.user_id].targetY = cursor.y
        onlineCursors[cursor.user_id].displayName = cursor.displayName
      }
    }).subscribe()
    
    animate()
    return channel
  }

  const broadcastCursor = (() => {
    let throttleTimeout: number | null = null
    return (e: MouseEvent, channel: RealtimeChannel) => {
      if (throttleTimeout) return
      throttleTimeout = window.setTimeout(() => {
        throttleTimeout = null
        const displayName = session.user.user_metadata?.preferred_username || 'Anonymous'
        channel.send({
          type: 'broadcast', event: 'cursor_move',
          payload: {
            user_id: session.user.id, displayName,
            x: (e.clientX - translateX.value) / scale.value,
            y: (e.clientY - translateY.value) / scale.value,
          },
        })
      }, 50)
    }
  })()

  let animationFrameId: number
  const animateCursors = () => {
    Object.values(onlineCursors).forEach(cursor => {
      if (cursor.targetX === undefined || cursor.targetY === undefined) return
      cursor.x += (cursor.targetX - cursor.x) * 0.2
      cursor.y += (cursor.targetY - cursor.y) * 0.2
    })
    animationFrameId = requestAnimationFrame(animateCursors)
  }

  onMounted(() => {
    const dbChannel = setupDbSubscriptions()
    const eventsChannel = setupEventSubscriptions()
    const cursorChannel = setupCursorSubscriptions(animateCursors)
    
    const handleCursorMove = (e: MouseEvent) => broadcastCursor(e, cursorChannel)
    window.addEventListener('mousemove', handleCursorMove)

    onUnmounted(() => {
      supabase.removeChannel(dbChannel)
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(cursorChannel)
      window.removeEventListener('mousemove', handleCursorMove)
      cancelAnimationFrame(animationFrameId)
    })
  })

  return { remotelyDraggedIds, onlineCursors }
}

// --- Component Logic ---
const { scale, translateX, translateY, boardStyle, panHandlers } = useBoardPanAndZoom()
const { postIts, loading, currentUserPostIt, createPostIt, updatePostIt, removePostIt } = usePostItData(props.session)
const { remotelyDraggedIds, onlineCursors } = useRealtimeEvents(postIts, props.session)

const isColorPickerVisible = ref(false)
const pastelColors = ["#fff475", "#ffb5e8", "#b5e8ff", "#b5ffb7", "#ffd5b5"]

const getCursorStyle = (cursor: CursorData) => ({
  transform: `translate(${cursor.x * scale.value + translateX.value}px, ${cursor.y * scale.value + translateY.value}px)`
})

const handleCreatePostIt = async (color: string) => {
  if (currentUserPostIt.value) return
  isColorPickerVisible.value = false
  await createPostIt({
    user_id: props.session.user.id,
    x: (window.innerWidth / 2 - translateX.value) / scale.value,
    y: (window.innerHeight / 2 - translateY.value) / scale.value,
    color,
    mode: 'text',
    text_content: '',
    canvas_content: ''
  })
}

const goToPostIt = () => {
  const postIt = currentUserPostIt.value
  if (!postIt) return
  const newScale = 1
  const targetX = postIt.x + 110
  const targetY = postIt.y + 125
  translateX.value = window.innerWidth / 2 - targetX * newScale
  translateY.value = window.innerHeight / 2 - targetY * newScale
  scale.value = newScale
}

const signOut = async () => {
  await supabase.auth.signOut()
}
</script>

<style scoped>
/* Styles remain unchanged */
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
.online-cursors {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 200;
}
.remote-cursor {
  position: absolute;
  transform: translate(-5px, -2px);
  display: flex;
  align-items: flex-start;
  gap: 2px;
}
.cursor-dot {
  font-size: 20px;
}
.cursor-label {
  padding: 2px 6px;
  border-radius: 10px;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 12px;
  font-weight: bold;
  white-space: nowrap;
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
.add-btn {
  background: #fdf3d0;
  border: 1px solid #d3c8aa;
  border-radius: 10px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 2px 2px 5px rgba(0,0,0,0.2);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.add-btn:hover { transform: scale(1.05); border-color: #bcae8c; }
.color-picker {
  display: flex;
  gap: 8px;
  background: #fff;
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  margin-top: 10px;
}
.color-swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #fff;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.15s ease;
}
.color-swatch:hover { transform: scale(1.15); }
.sign-out-btn {
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: auto;
  background: #d9534f;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 16px;
  box-shadow: 2px 2px 5px rgba(0,0,0,0.2);
}
.sign-out-btn:hover { background: #c9302c; }
.connect-btn {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: #fdf3d0;
  font-weight: bold;
  opacity: 0.7;
  transition: opacity 0.2s;
}
.connect-btn:hover { opacity: 1; }
</style>
<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import './components/App.css'

const folder = ref(null)
const clips = ref([])
const currentIndex = ref(0)
const videoEl = ref(null)
const skipEnabled = ref(false)
const skipSeconds = ref(10)
const videoMounted = ref(true)
const editedName = ref('')
const thumbnails = ref({})
const progressFill = ref(null)
const playing = ref(true)
const currentTime = ref('0:00')
const totalDuration = ref('0:00')
const currentClip = computed(() => clips.value[currentIndex.value])
const scrubThumbs = ref([])  // [{ time, path }]
const hoverTime = ref(null)
const hoverX = ref(0)
const hoverThumb = ref(null)
const overlayHidden = ref(false)
const alertMessage = ref('')
const frozenFrame = ref(null)

// cards for temporary messages
function showAlert(message) {
  alertMessage.value = message
  console.log("alert called", message)
  setTimeout(() => {
    alertMessage.value = ''
  }, 3500)
}

// Playback

function togglePlay() {
  if (!videoEl.value) return
  if (videoEl.value.paused) {
    videoEl.value.play()
    playing.value = true
  } else {
    videoEl.value.pause()
    playing.value = false
  }
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

function updateProgress() {
  if (!videoEl.value || !progressFill.value) return
  const pct = (videoEl.value.currentTime / videoEl.value.duration) * 100
  progressFill.value.style.width = pct + '%'
  currentTime.value = formatTime(videoEl.value.currentTime)
}


// call this after video loads
async function loadScrubThumbs() {
  scrubThumbs.value = []
  if (!videoEl.value) return
  const duration = videoEl.value.duration
  scrubThumbs.value = await window.electron.ipcRenderer.invoke(
    'get-scrub-thumbnails',
    currentClip.value,
    duration
  )
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    videoEl.value.parentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

function handleVideoLoaded() {
  totalDuration.value = formatTime(videoEl.value.duration)
  loadScrubThumbs()
  if (!skipEnabled.value) return
  const target = videoEl.value.duration - skipSeconds.value
  if (target > 0) videoEl.value.currentTime = target
}

// Hovering

function onProgressHover(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  const time = pct * videoEl.value.duration
  hoverTime.value = formatTime(time)
  hoverX.value = e.clientX - rect.left

  // find closest scrub thumbnail
  const closest = scrubThumbs.value.reduce((prev, curr) =>
    Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev
  , scrubThumbs.value[0])
  hoverThumb.value = closest?.path ?? null
}

function onProgressLeave() {
  hoverTime.value = null
  hoverThumb.value = null
}

function seek(e) {
  if (!videoEl.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  videoEl.value.currentTime = pct * videoEl.value.duration
}

// Navigation

function next() {
  if (currentIndex.value < clips.value.length - 1) currentIndex.value++
  if (currentIndex.value === clips.value.length) {
    showAlert("Reached end of queue.")
  }
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}

watch(currentIndex, (i) => {
  playing.value = true
  editedName.value = currentClip.value.split('\\').pop().replace(/\.mp4$/i, '')
  scrubThumbs.value = []  // ← clear old thumbs
  saveState()
})

function toggleOverlay() {
  overlayHidden.value = !overlayHidden.value
}

// State persistence

async function saveState() {
  if (!folder.value) return
  console.log('saving state', { folder: folder.value, skipEnabled: skipEnabled.value, skipSeconds: skipSeconds.value })
  await window.electron.ipcRenderer.invoke('save-state', {
    folder: folder.value,
    index: currentIndex.value,
    skipEnabled: skipEnabled.value,
    skipSeconds: skipSeconds.value
  })
}

async function loadState() {
  return await window.electron.ipcRenderer.invoke('load-state')
}

watch([skipEnabled, skipSeconds], (newVals) => {
  console.log('skip prefs changed', newVals)
  saveState()
})

// Folder / clips

async function initClips(folderPath, savedIndex = 0) {
  clips.value = await window.electron.ipcRenderer.invoke('get-clips', folderPath)
  if (!clips.value.length) return false
  currentIndex.value = Math.min(savedIndex, clips.value.length - 1)
  editedName.value = clips.value[currentIndex.value].split('\\').pop().replace(/\.mp4$/i, '')
  return true
}

async function pickFolder() {
  const picked = await window.electron.ipcRenderer.invoke('select-folder')
  if (!picked) return
  folder.value = picked
  const ok = await initClips(picked, 0)
  if (ok) await saveState()
}

//  Rename / Delete

async function renameClip() {
  videoMounted.value = false
  await nextTick()
  await new Promise(r => setTimeout(r, 300))
  const oldName = currentClip.value?.split('\\').pop().replace(/\.mp4$/i, '')
  const result = await window.electron.ipcRenderer.invoke('rename-clip', currentClip.value, editedName.value)
  
  if (!result.success) {
    alert('Could not rename. Try again. (Maybe try skipping to the last second then rename?)')
    videoMounted.value = true
    return
  }
  showAlert(`"${oldName}" renamed to "${editedName.value}" successfully.`)
  clips.value[currentIndex.value] = result.path
  videoMounted.value = true
  next()
}

async function deleteClip() {
  const deletedName = currentClip.value?.split('\\').pop().replace(/\.mp4$/i, '')
  const canvas = document.createElement('canvas')
  canvas.width = videoEl.value.videoWidth
  canvas.height = videoEl.value.videoHeight
  canvas.getContext('2d').drawImage(videoEl.value, 0, 0)
  frozenFrame.value = canvas.toDataURL()
  videoMounted.value = false
  await nextTick()
  await new Promise(r => setTimeout(r, 300))

  const result = await window.electron.ipcRenderer.invoke('delete-clip', currentClip.value)

  if (!result.success) {
    alert('Could not delete — file still in use. Try again (Maybe try skipping to the last second then delete?)')
    videoMounted.value = true
    return
  }

  clips.value.splice(currentIndex.value, 1)

  if (clips.value.length === 0) {
    folder.value = null
    videoMounted.value = true
    return
  }

  if (currentIndex.value >= clips.value.length) {
    currentIndex.value = clips.value.length - 1
  }

  videoMounted.value = true
  showAlert(`"${deletedName}" deleted successfully.`)
  await saveState()
   frozenFrame.value = null  // clear frame hold after deleting
}

//  Thumbnails

const thumbQueue = []
let thumbWorking = false

async function processThumbQueue() {
  if (thumbWorking) return
  thumbWorking = true
  while (thumbQueue.length) {
    const clip = thumbQueue.shift()
    if (!thumbnails.value[clip]) {
      try {
        const path = await window.electron.ipcRenderer.invoke('get-thumbnail', clip)
        thumbnails.value[clip] = path
      } catch {
        // skip silently
      }
    }
  }
  thumbWorking = false
}

function queueThumb(clip, el) {
  if (!el || thumbnails.value[clip] || thumbQueue.includes(clip)) return
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      thumbQueue.push(clip)
      processThumbQueue()
      observer.disconnect()
    }
  }, { threshold: 0.1 })
  observer.observe(el)
}

// Keyboard 

function handleKeydown(e) {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F11'].includes(e.code)) {
    if (document.activeElement?.classList.contains('rename-field')) return
    e.preventDefault()
  }
  if (e.code === 'Space') togglePlay()
  if (e.key === 'ArrowRight') next()
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'Enter') renameClip()
  if (e.key === 'Delete') deleteClip()
  if (e.key == 'F11') toggleFullscreen()
}

//  Lifecycle

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  const state = await loadState()
  if (state?.folder) {
    folder.value = state.folder
    await initClips(state.folder, state.index ?? 0)
    // set these AFTER initClips so the watch doesn't overwrite them
    skipEnabled.value = state.skipEnabled ?? false
    skipSeconds.value = state.skipSeconds ?? 10
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>

  <!---fullscreen svg -->
  <svg style="display:none">
  <symbol id="cis-fullscreen" viewBox="0 0 512 512">
    <polygon fill="currentColor" points="224 80 224 16 16 16 16 224 80 224 80 125.255 197.373 242.627 242.627 197.373 125.255 80 224 80"/>
    <polygon fill="currentColor" points="432 288 432 386.745 310.627 265.373 265.373 310.627 386.745 432 288 432 288 496 496 496 496 288 432 288"/>
  </symbol>
</svg>

  <!-- EMPTY STATE -->
  <div v-if="!clips.length" class="empty-state">
    <div class="empty-inner">
      <div class="empty-logo">Clip<span>Sort</span></div>
      <p class="empty-sub">Your NVIDIA clips, sorted.</p>
      <button class="pick-btn" @click="pickFolder">Choose Clips Folder</button>
    </div>
  </div>

  <!-- PLAYER -->
  <div v-else class="root">

    <div class="video-wrap">
      <div v-if="alertMessage" class="alert-card">{{ alertMessage }}</div>
  <video
    v-if="videoMounted"
    ref="videoEl"
    :key="currentClip"
    :src="`file:///${currentClip.replaceAll('\\', '/')}`"
    autoplay
    @loadedmetadata="handleVideoLoaded"
    @error="(e) => console.log('video error', e)"
    @timeupdate="updateProgress"
    class="video-el"
  />
<img 
  v-else-if="frozenFrame" 
  :src="frozenFrame" 
  class="frozen-frame"
        />
  <!-- overlay: gradient + title + counter -->
  <div class="overlay" >
    <div class="overlay-title" v-show="!overlayHidden">{{ currentClip?.split('\\').pop().replace(/\.mp4$/i, '') }}</div>
    <div class="overlay-meta" v-show="!overlayHidden">
      <span class="counter">{{ currentIndex + 1 }}<span class="counter-sep">/</span>{{ clips.length }}</span>
    </div>
  </div>

  <!-- controls: progress bar + transport -->
  <div class="controls-row">
    <div class="progress-section">
      <div class="progress-timestamps">
        <span class="duration-label">{{ currentTime }}</span>
        <span class="duration-label">{{ totalDuration }}</span>
      </div>
      <div
        class="progress-bar"
        @click="seek"
        @mousemove="onProgressHover"
        @mouseleave="onProgressLeave"
      >
        <div class="progress-fill" ref="progressFill" />
        <div
          v-if="hoverTime"
          class="scrub-popup"
          :style="{ left: hoverX + 'px' }"
        >
          <img
            v-if="hoverThumb"
            :src="`file:///${hoverThumb.replace(/\\/g, '/')}`"
            class="scrub-thumb"
          />
          <span class="scrub-time">{{ hoverTime }}</span>
        </div>
      </div>
    </div>

    <div class="transport-row">
      <button class="tbtn" @click="prev">
        <svg width="18" height="18" viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg">
          <path transform="scale(-1,1) translate(-32,0)" d="M18.14 20.68c.365 0 .672-.107 1.038-.323l8.508-4.997c.623-.365.938-.814.938-1.37 0-.564-.307-.988-.938-1.361l-8.508-4.997c-.366-.216-.68-.324-1.046-.324-.73 0-1.337.556-1.337 1.569v4.773c-.108-.399-.406-.73-.904-1.021L7.382 7.632c-.357-.216-.672-.324-1.037-.324-.73 0-1.345.556-1.345 1.569v10.235c0 1.013.614 1.569 1.345 1.569.365 0 .68-.108 1.037-.324l8.509-4.997c.49-.29.796-.631.904-1.038v4.79c0 1.013.615 1.569 1.345 1.569z" fill="currentColor" fill-rule="nonzero"/>
        </svg>
      </button>
      <button class="tbtn main" @click="togglePlay">
        <svg v-if="!playing" width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M7 4l12 7-12 7V4z" fill="currentColor"/>
        </svg>
        <svg v-else width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="5" y="4" width="4" height="14" rx="1" fill="currentColor"/>
          <rect x="13" y="4" width="4" height="14" rx="1" fill="currentColor"/>
        </svg>
      </button>
      <button class="tbtn" @click="next">
        <svg width="18" height="18" viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg">
          <path d="M18.14 20.68c.365 0 .672-.107 1.038-.323l8.508-4.997c.623-.365.938-.814.938-1.37 0-.564-.307-.988-.938-1.361l-8.508-4.997c-.366-.216-.68-.324-1.046-.324-.73 0-1.337.556-1.337 1.569v4.773c-.108-.399-.406-.73-.904-1.021L7.382 7.632c-.357-.216-.672-.324-1.037-.324-.73 0-1.345.556-1.345 1.569v10.235c0 1.013.614 1.569 1.345 1.569.365 0 .68-.108 1.037-.324l8.509-4.997c.49-.29.796-.631.904-1.038v4.79c0 1.013.615 1.569 1.345 1.569z" fill="currentColor" fill-rule="nonzero"/>
        </svg>
      </button>
      <button @click="toggleFullscreen" class="tbtn">
  <svg width="14" height="14" viewBox="0 0 512 512">
    <use href="#cis-fullscreen" />
  </svg>
</button>
    </div>
  </div>
</div>
    <!-- ACTION BAR -->
    <div class="action-bar">
      <input
        class="rename-field"
        v-model="editedName"
        @keyup.enter="renameClip"
        placeholder="rename clip…"
      />
      <button class="abar-btn" @click="renameClip">Rename</button>
      <div class="divider" />
      <button class="abar-btn del" @click="deleteClip">Delete</button>
      <div class="divider" />
      <div class="skip-row">
        <span class="skip-label">Skip to last</span>
        <input class="skip-num" type="number" v-model="skipSeconds" min="1" />
        <span class="skip-label">seconds</span>
        <div class="toggle-wrap" :class="{ off: !skipEnabled }" @click="skipEnabled = !skipEnabled">
          <div class="toggle-knob" />
        </div>
      </div>
      <button class="abar-btn" @click="toggleOverlay"> {{ overlayHidden ? 'Show overlay' : 'Hide overlay' }}</button>
      <button class="abar-btn" @click="pickFolder">Change Folder</button>
      
<div class="divider" />
    </div>

    <!-- BOTTOM ROW -->
    <div class="bottom-row">
      <div class="queue-card">
        <div class="queue-header">
          <span class="queue-text">Queue</span>
          <span class="queue-text">{{ currentIndex + 1 }} / {{ clips.length }}</span>
        </div>
        <div class="queue-list">
          <div
            v-for="(clip, i) in clips"
            :key="clip"
            class="queue-item"
            :class="{ now: i === currentIndex }"
            @click="currentIndex = i"
          >
            <div class="q-thumb" :ref="el => el && queueThumb(clip, el)">
              <svg v-if="i === currentIndex && !thumbnails[clip]" width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 1l7 4-7 4V1z" fill="rgba(255,255,255,0.6)" />
              </svg>
              <img v-if="thumbnails[clip]" :src="`file:///${thumbnails[clip].replace(/\\/g, '/')}`" />
            </div>
            <div class="q-info">
              <div class="q-name">{{ clip.split('\\').pop().replace(/\.mp4$/i, '') }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="hint-area">
        <span class="hint"><span class="kbd">←</span><span class="kbd">→</span> navigate</span>
        <span class="hint"><span class="kbd">Space</span> play/pause</span>
        <span class="hint"><span class="kbd">↵</span> rename & next</span>
        <span class="hint"><span class="kbd">Del</span> delete (permanent)</span>
      </div>
    </div>
  </div>
</template>

<style>

</style>
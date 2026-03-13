<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

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
  await new Promise(r => setTimeout(r, 300)) // increased from 150
  
  const result = await window.electron.ipcRenderer.invoke('rename-clip', currentClip.value, editedName.value)
  
  if (!result.success) {
    alert('Could not rename — file still in use. Try again.')
    videoMounted.value = true
    return
  }
  
  clips.value[currentIndex.value] = result.path
  videoMounted.value = true
  next()
}

async function deleteClip() {
  videoMounted.value = false
  await nextTick()
  await new Promise(r => setTimeout(r, 300))

  const result = await window.electron.ipcRenderer.invoke('delete-clip', currentClip.value)

  if (!result.success) {
    alert('Could not delete — file still in use. Try again.')
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
  await saveState()
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
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    if (document.activeElement?.classList.contains('rename-field')) return
    e.preventDefault()
  }
  if (e.code === 'Space') togglePlay()
  if (e.key === 'ArrowRight') next()
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'Enter') renameClip()
  if (e.key === 'Delete') deleteClip()
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

  <!-- overlay: gradient + title + counter -->
  <div class="overlay">
    <div class="overlay-title">{{ currentClip?.split('\\').pop().replace(/\.mp4$/i, '') }}</div>
    <div class="overlay-meta">
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
        <span class="skip-label">Last</span>
        <input class="skip-num" type="number" v-model="skipSeconds" min="1" />
        <span class="skip-label">seconds</span>
        <div class="toggle-wrap" :class="{ off: !skipEnabled }" @click="skipEnabled = !skipEnabled">
          <div class="toggle-knob" />
        </div>
      </div>
      <button class="abar-btn" @click="pickFolder">Change Folder</button>
<div class="divider" />
    </div>

    <!-- BOTTOM ROW -->
    <div class="bottom-row">
      <div class="queue-card">
        <div class="queue-header">
          <span>Queue</span>
          <span>{{ currentIndex + 1 }} / {{ clips.length }}</span>
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
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&display=swap');

:root { --footer-text: rgb(191, 191, 191); }

::-webkit-scrollbar { display: none; }

* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Geist', sans-serif; outline: none; }

html, body { background: #000; color: #fff; height: 100%; }

/* ── EMPTY STATE ── */
.empty-state {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-inner { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.empty-logo { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
.empty-logo span { color: rgba(255,255,255,0.35); }
.empty-sub { font-size: 13px; font-weight: 300; color: rgba(255,255,255,0.3); }
.pick-btn {
  margin-top: 8px;
  padding: 10px 28px;
  background: rgba(255,255,255,0.07);
  border: 0.5px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
.pick-btn:hover { background: rgba(255,255,255,0.12); }

/* ── PLAYER ── */
.root {
  background: #000;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  overflow-y: auto;
}

/* ── VIDEO WRAP ── */
.video-wrap { position: relative; width: 100%; background: #000; }
.video-el { width: 100%; height: auto; display: block; }

/* ── OVERLAY ──
   z-index 5: above video, below transport (10) and progress bar (20)
   bottom padding 56px: clears the transport row height              */
.overlay {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 120px 28px 75px;
  background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 40%, transparent 100%);
  pointer-events: none;
  z-index: 5;
}
.overlay-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.overlay-meta { display: flex; flex-direction: column; gap: 2px; }
.counter { font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.5); }
.counter-sep { color: rgba(255,255,255,0.25); margin: 0 3px; }


.counter {
  font-size: 11px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.636);  /* dimmer, subordinate to title */
}

.duration-label { font-size: 11px; font-weight: 300; color: rgba(255,255,255,0.4); font-variant-numeric: tabular-nums; }


.counter-sep { color: rgba(255,255,255,0.25); margin: 0 3px; }


.duration {
  font-size: 11px;
  color: rgba(255,255,255,0.3);
}
/* ── TRANSPORT ── */

.tbtn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  transition: color 0.12s;
}
.tbtn:hover { color: #fff; }
.tbtn.main { color: #fff; }
.tbtn.main:hover { color: rgba(255,255,255,0.6); }

/* ── ACTION BAR ── */
.action-bar {
  background: #111;
  border-top: 0.5px solid rgba(255,255,255,0.07);
  padding: 11px 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.rename-field {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 0.5px solid rgba(255,255,255,0.1);
  border-radius: 7px;
  padding: 8px 14px;
  font-size: 13px;
  color: #fff;
  outline: none;
  transition: border-color 0.15s;
}
.rename-field::placeholder { color: rgba(255,255,255,0.2); }
.rename-field:focus { border-color: rgba(255,255,255,0.3); }
.abar-btn {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 7px;
  border: 0.5px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.65);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}
.abar-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.abar-btn.del { color: rgba(255,80,60,0.7); border-color: rgba(255,80,60,0.18); }
.abar-btn.del:hover { background: rgba(255,80,60,0.1); color: rgb(255,80,60); }
.divider { width: 0.5px; height: 20px; background: rgba(255,255,255,0.08); flex-shrink: 0; }

input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

.skip-row { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 4px; }
.skip-label { font-size: 11px; color: rgba(255,255,255,0.3); white-space: nowrap; }
.skip-num {
  width: 54px;
  background: rgba(255,255,255,0.06);
  border: 0.5px solid rgba(255,255,255,0.1);
  border-radius: 5px;
  padding: 4px 6px;
  font-size: 12px;
  color: #fff;
  outline: none;
  text-align: center;
}
.toggle-wrap {
  width: 30px; height: 17px;
  background: #30d158;
  border-radius: 9px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-wrap.off { background: rgba(255,255,255,0.15); }
.toggle-knob {
  width: 13px; height: 13px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px; right: 2px;
  transition: all 0.2s;
}
.toggle-wrap.off .toggle-knob { right: auto; left: 2px; }

/* ── BOTTOM ROW ── */
.bottom-row {
  display: flex;
  align-items: flex-start;
  padding: 14px 24px;
  gap: 14px;
  background: #0a0a0a;
  flex: 1;
}
.queue-card {
  width: 240px;
  background: #161616;
  border: 0.5px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
}
.queue-header {
  padding: 9px 14px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.28);
  border-bottom: 0.5px solid rgba(255,255,255,0.06);
  display: flex;
  justify-content: space-between;
}
.queue-list { max-height: 200px; overflow-y: auto; }
.queue-list::-webkit-scrollbar { width: 3px; display: block; }
.queue-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 0.5px solid rgba(255,255,255,0.04);
  cursor: pointer;
  transition: background 0.1s;
}
.queue-item:hover { background: rgba(255,255,255,0.03); }
.queue-item.now { background: rgba(255,255,255,0.05); }
.queue-item:last-child { border-bottom: none; }
.q-thumb {
  position: relative;
  width: 44px; height: 27px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.q-thumb img {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  border-radius: 4px;
}
.q-info { flex: 1; min-width: 0; }
.q-name {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.queue-item.now .q-name { color: #fff; }
.hint-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20px;
  padding-top: 4px;
}
.hint { font-size: 11px; color: var(--footer-text); font-weight: 300; display: flex; align-items: center; gap: 5px; }
.kbd {
  background: rgba(255,255,255,0.07);
  border: 0.5px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 11px;
  color: rgba(255,255,255,0.32);
}

.controls-row {
  position: absolute;
  bottom: 6px;
  left: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 10;
  pointer-events: all;
}

.progress-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-timestamps {
  display: flex;
  justify-content: space-between;
  padding: 0 2px;
}
.progress-bar {
  position: relative;
  width: 100%;
  height: 4px;
  background: rgba(255,255,255,0.15);
  cursor: pointer;
  border-radius: 9px;
  transition: height 0.15s;
}
.progress-bar:hover { height: 6px; }

.progress-fill {
  height: 100%;
  width: 0%;
  background: #fff;
  border-radius: 9px;
  pointer-events: none;
  transition: width 0.4s linear;
}

.scrub-popup {
  position: absolute;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}

.scrub-thumb {
  width: 160px;
  height: 90px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.15);
}

.scrub-time {
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  font-variant-numeric: tabular-nums;
  background: rgba(0,0,0,0.6);
  padding: 2px 6px;
  border-radius: 4px;
}

.transport-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  pointer-events: all;
}


</style>
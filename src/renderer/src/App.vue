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

const currentClip = computed(() => clips.value[currentIndex.value])

const playing = ref(true)

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

// reset playing state when clip changes
watch(currentIndex, () => {
  playing.value = true
  editedName.value = currentClip.value.split('\\').pop().replace('.mp4', '')
})


async function pickFolder() {
  folder.value = await window.electron.ipcRenderer.invoke('select-folder')
  if (folder.value) {
    clips.value = await window.electron.ipcRenderer.invoke('get-clips', folder.value)
    if (clips.value.length > 0) {
      editedName.value = clips.value[0].split('\\').pop().replace('.mp4', '')
    }
  }
}

function next() {
  if (currentIndex.value < clips.value.length - 1) currentIndex.value++
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}

watch(currentIndex, () => {
  editedName.value = currentClip.value.split('\\').pop().replace('.mp4', '')
})

function handleVideoLoaded() {
  if (!skipEnabled.value) return
  const duration = videoEl.value.duration
  const target = duration - skipSeconds.value
  if (target > 0) videoEl.value.currentTime = target
}

function updateProgress() {
  if (!videoEl.value) return
  const pct = (videoEl.value.currentTime / videoEl.value.duration) * 100
  if (progressFill.value) progressFill.value.style.width = pct + '%'
}

const progressFill = ref(null)

async function renameClip() {
  videoMounted.value = false
  await nextTick()
  await new Promise(r => setTimeout(r, 150))
  const newPath = await window.electron.ipcRenderer.invoke('rename-clip', currentClip.value, editedName.value)
  clips.value[currentIndex.value] = newPath
  videoMounted.value = true
  next()
}

async function deleteClip() {
  videoMounted.value = false
  await nextTick()
  await window.electron.ipcRenderer.invoke('delete-clip', currentClip.value)
  clips.value.splice(currentIndex.value, 1)
  if (currentIndex.value >= clips.value.length) currentIndex.value = clips.value.length - 1
  videoMounted.value = true
}

function handleKeydown(e) {
  if (e.key === 'ArrowRight') next()
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'Enter') renameClip()
  if (e.key === 'Delete') deleteClip()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
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

    <!-- VIDEO -->
    <div class="video-wrap">
      <video
        v-if="videoMounted"
        ref="videoEl"
        :key="currentClip"
        :src="`file:///${currentClip.replaceAll('\\', '/')}`"
        autoplay
        @loadedmetadata="handleVideoLoaded"
        @timeupdate="updateProgress"
        class="video-el"
      />
      <div class="overlay">
        <div class="overlay-title">{{ editedName }}</div>
        <div class="overlay-sub">{{ currentIndex + 1 }} / {{ clips.length }}</div>
        <div class="progress-track">
 <div class="transport-row">
  <button class="tbtn" @click="prev">
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M14 4L4 9l10 5V4z" fill="currentColor"/>
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
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4 4l10 5-10 5V4z" fill="currentColor"/>
    </svg>
  </button>
  </div>
        </div>
      </div>
          <div class="progress-fill" ref="progressFill" />
         
    </div>

    <!-- ACTION BAR -->
    <div class="action-bar">
      <input
        class="rename-field"
        v-model="editedName"
        @keyup.enter="renameClip"
        placeholder="rename clip…"
      />
      <button class="abar-btn" @click="renameClip">Rename ↵</button>
      <div class="divider" />
      <button class="abar-btn del" @click="deleteClip">Delete</button>
      <div class="divider" />
      <div class="skip-row">
        <span class="skip-label">Last</span>
        <input class="skip-num" type="number" v-model="skipSeconds" min="1" />
        <span class="skip-label">s</span>
        <div class="toggle-wrap" :class="{ off: !skipEnabled }" @click="skipEnabled = !skipEnabled">
          <div class="toggle-knob" />
        </div>
      </div>
    </div>

    <!-- BOTTOM ROW: queue + hints -->
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
            <div class="q-thumb">
              <svg v-if="i === currentIndex" width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 1l7 4-7 4V1z" fill="rgba(255,255,255,0.6)" />
              </svg>
            </div>
            <div class="q-info">
              <div class="q-name">{{ clip.split('\\').pop().replace('.mp4', '') }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="hint-area">
        <span class="hint"><span class="kbd">←</span><span class="kbd">→</span> navigate</span>
        <span class="hint"><span class="kbd">↵</span> rename & next</span>
        <span class="hint"><span class="kbd">Del</span> delete</span>
      </div>

    </div>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Geist', sans-serif; }
html, body { background: #000; color: #fff; height: 100%; }

/* EMPTY STATE */
.empty-state {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
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
  font-family: 'Geist', sans-serif;
  cursor: pointer;
  transition: background 0.15s;
}
.pick-btn:hover { background: rgba(255,255,255,0.12); }

/* PLAYER */
.root {
  background: #000;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.video-wrap {
  position: relative;
  width: 100%;
  flex: 1;
  background: #000;
  overflow: hidden;
  min-height: 0;
}

.video-el {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.overlay {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 60px 28px 16px;
  background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%);
  pointer-events: none;
}
.overlay-title { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 3px; }
.overlay-sub {
  font-size: 11px; font-weight: 300;
  color: rgba(255,255,255,0.4);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.progress-track {
  height: 3px;
  background: rgba(255,255,255,0.18);
  border-radius: 2px;
}
.progress-fill {
  height: 100%;
  width: 0%;
  background: #fff;
  border-radius: 2px;
  transition: width 0.4s linear;
}
.transport-row {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 10px;
  pointer-events: all;
}

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
/* ACTION BAR */
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
  font-family: 'Geist', sans-serif;
  color: #fff;
  outline: none;
  transition: border-color 0.15s;
}
.rename-field::placeholder { color: rgba(255,255,255,0.2); }
.rename-field:focus { border-color: rgba(255,255,255,0.3); }

.abar-btn {
  padding: 8px 16px;
  font-size: 12px;
  font-family: 'Geist', sans-serif;
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

.skip-row {  display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 4px; }
.skip-label { font-size: 11px; color: rgba(255,255,255,0.3); white-space: nowrap; }
.skip-num {
  width: 54px;
  background: rgba(255,255,255,0.06);
  border: 0.5px solid rgba(255,255,255,0.1);
  border-radius: 5px;
  padding: 4px 6px;
  font-size: 12px;
  font-family: 'Geist', sans-serif;
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

/* BOTTOM ROW */
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
.queue-list::-webkit-scrollbar { width: 3px; }
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
  width: 44px; height: 27px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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
.hint { font-size: 11px; color: rgba(255,255,255,0.18); font-weight: 300; display: flex; align-items: center; gap: 5px; }
.kbd {
  background: rgba(255,255,255,0.07);
  border: 0.5px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 11px;
  color: rgba(255,255,255,0.32);
}
</style>
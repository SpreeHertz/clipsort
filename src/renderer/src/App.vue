<script setup>
import { ref,computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

const folder = ref(null)
const clips = ref([])
const currentIndex = ref(0)
const videoEl = ref(null)
const skipEnabled = ref(false)
const skipSeconds = ref(10)
const videoMounted = ref(true)
const editedName = ref('')


function handleKeydown(e) {
  if (e.key === 'ArrowRight') next()
  if (e.key === 'ArrowLeft') prev()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

const currentClip = computed(() => clips.value[currentIndex.value])
async function pickFolder() {
  folder.value = await window.electron.ipcRenderer.invoke('select-folder')
  if (folder.value) {
    clips.value = await window.electron.ipcRenderer.invoke('get-clips', folder.value)
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

async function renameClip() {
  videoMounted.value = false
  await nextTick()
  await new Promise(r => setTimeout(r, 150)) // to not rename too fast
  const newPath = await window.electron.ipcRenderer.invoke(
    'rename-clip',
    currentClip.value,
    editedName.value
  )

  clips.value[currentIndex.value] = newPath
  videoMounted.value = true
  next()

}

async function deleteClip() {
  videoMounted.value = false
  await nextTick()

  await window.electron.ipcRenderer.invoke('delete-clip', currentClip.value)

  clips.value.splice(currentIndex.value, 1)

  // stay in bounds
  if (currentIndex.value >= clips.value.length) {
    currentIndex.value = clips.value.length - 1
  }

  videoMounted.value = true
}

</script>

<template>
  <div>
    <button @click="pickFolder" class="choose-clips-btn">Choose Clips Folder</button>

    <div v-if="clips.length">
          <video
      v-if="videoMounted"
      :key="currentClip"
      :src="`file:///${currentClip.replaceAll('\\', '/')}`"
      controls
      autoplay
      ref="videoEl"
      @loadedmetadata="handleVideoLoaded"
      style="width: 100%; max-height: 80vh;"
    />
      <div class="navigate">
      <button @click="prev">← Prev</button>
      <button @click="next">Next →</button>
      </div>
       <div>
    <label>
      <input type="checkbox" v-model="skipEnabled" /> Skip to last
    </label>
    <input type="number" v-model="skipSeconds" min="1" style="width: 50px" />
    <span>seconds</span>
  </div>
  
   <div>
    <input v-model="editedName" @keyup.enter="renameClip" />
    <button @click="renameClip">Rename</button>
  </div>
<button @click="deleteClip">🗑 Delete (permanent)</button>
    </div>
  </div>
</template>

<style>

@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&display=swap');
* {
  font-family: 'Geist', sans-serif;
}

.choose-clips-btn {
  padding: 10px;
  color: white;
  background-color: #383838;
  border: none;
  font-family: 'Geist', sans-serif;
  font-weight: 700;
}

.choose-clips-btn:hover {
  background-color: #232323;
}


</style>
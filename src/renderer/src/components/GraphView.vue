<script setup>
import { onMounted, watch, ref, inject } from 'vue'
import cytoscape from 'cytoscape'

const props = defineProps({
  elements: Array,
  currentFolder: String
})
const isRenaming = inject('isRenaming')

const emit = defineEmits(['update-clips', 'show-exit-node-btn'])

const cyContainer = ref(null)
const isNodeSelected = ref(false)
let cy = null

const initCy = () => {
  cy = cytoscape({
    container: cyContainer.value,
    elements: props.elements,
     style: [ // 'color' changes label color
        { selector: 'node.friend', style: { 
          'background-color': '#aaaab3', 
          'label': 'data(label)', 
          'color': '#c0c2c0' 
        }},
        { selector: 'node.diamond', style: {
           'shape': 'diamond', 
           'background-color': '#5568bd', 
           'label': 'data(label)', 
           'color': '#fff' 
          }},
        { selector: 'node.solo', 
        style: { 'background-color': 
        '#888', 'label': 
        'data(label)', 
        'color': '#fff' 
          }},
        { selector: 'edge', 
        style: { 'width': 2, 
        'line-color': '#3c3c3c' 
          }}
      ],
      layout: { 
        name: 'cose', 
        animate: false,
        boundingBox: { x1: 0, y1: 0, w: cyContainer.value.clientWidth, h: cyContainer.value.clientHeight },
        animate: true,
        animationDuration: 800,
        animationEasing: 'ease-in-out-cubic',
        fit: true,
        padding: 30,
        nodeRepulsion: 4000
      }
  })
}

watch(() => props.elements, (newElems) => {
  if (!cy || isRenaming.value) return
  cy.json({ elements: newElems })
  cy.layout({ name: 'cose', animate: false, fit: true }).run()
  
  // fix: remove existing listeners to prevent duplicates
  cy.off('tap', 'node.friend, node.diamond, node.solo')
  
  cy.on('tap', 'node.friend, node.diamond, node.solo', async (evt) => {
    isNodeSelected.value = true
    emit('show-exit-node-btn', true)
    const node = evt.target
    const id = node.id()
    let friendsArray = []
    let isFilterActive = false

    if (id.includes('diamond')) {
      isFilterActive = true
      friendsArray = id.split('-')[1].split('|')
    } else if (node.hasClass('solo') || node.hasClass('friend')) {
      // logic for solo nodes: just use the name from the ID
      isFilterActive = true
      friendsArray = [id] 
    }

    // call the updated IPC handle
    const clips = await window.electron.ipcRenderer.invoke(
    'get-clips', 
    props.currentFolder, 
    isFilterActive, 
    friendsArray
  )
  
  emit('update-clips', clips)
  })
}, { deep: true })

onMounted(() => {
  initCy()
})
</script>

<template>
  <div ref="cyContainer" class="cy-container" v-show="!isRenaming"></div>
</template>

<style scoped>
.cy-container {
  width: 100%;
  height: 100%;
  background: #050505;
  contain: strict;
  
}
</style>
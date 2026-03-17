<script setup>
import { onMounted, watch, ref } from 'vue'
import cytoscape from 'cytoscape'

const props = defineProps({
  elements: Array
})

const cyContainer = ref(null)
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
  if (!cy) return
  cy.json({ elements: newElems })
  cy.layout({ name: 'cose', animate: true }).run()
  cy.on('tap','node.friend, node.diamond, node.solo', function(evt){
    const node = evt.target
    console.log('tapped', node.id())
    if (node.id().includes('diamond')) {
      // coOccurenceNames returns "diamond-name1|name2.., so split them, then make a string
      const coOccurenceNames = node.id().split('-')[1].split('|').join().replace(',', ' ')
      console.log('tapped', coOccurenceNames)
    }
  })
}, { deep: true })

onMounted(() => {
  initCy()
})
</script>

<template>
  <div ref="cyContainer" class="cy-container"></div>
</template>

<style scoped>
.cy-container {
  width: 100%;
  height: 100%;
  background: #050505;
}
</style>
<script setup>
import { onMounted, ref, toRaw, watch } from 'vue'
import cytoscape from 'cytoscape'

const props = defineProps(['elements'])
const graphContainer = ref(null)

watch(() => props.elements, (newElements) =>{
     if (!newElements?.length) return
  const raw = toRaw(newElements)
  console.log('initializing cytoscape with:', raw.length, 'elements')
    cytoscape({
    container: graphContainer.value,
    elements: props.elements,
    style: [
      { selector: 'node.friend', style: { 'background-color': '#666', label: 'data(label)' } },
      {
        selector: 'node.diamond',
        style: { shape: 'diamond', 'background-color': '#4CAF50', label: 'data(label)' }
      },
      { selector: 'node.solo', style: { 'background-color': '#888', label: 'data(label)' } },
      { selector: 'edge', style: { width: 2, 'line-color': '#555' } }
    ],
    layout: { name: 'cose' },
    
  }, {deep: true})
})

</script>

<template>
 <div ref="graphContainer" style="width: 600px; height: 400px;"></div>
</template>

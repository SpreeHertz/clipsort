<script setup>
import { watch, ref, onMounted, toRaw } from 'vue'
import cytoscape from 'cytoscape'

const props = defineProps(['elements'])
const graphContainer = ref(null)
let cy = null

function initCy(elements) {
  if (!graphContainer.value || !elements?.length) return
  cy = cytoscape({
    container: graphContainer.value,
    elements: toRaw(elements),
    style: [
      { selector: 'node.friend', style: { 'background-color': '#666', 'label': 'data(label)', 'color': '#fff' } },
      { selector: 'node.diamond', style: { 'shape': 'diamond', 'background-color': '#4CAF50', 'label': 'data(label)', 'color': '#fff' } },
      { selector: 'node.solo', style: { 'background-color': '#888', 'label': 'data(label)', 'color': '#fff' } },
      { selector: 'edge', style: { 'width': 2, 'line-color': '#555' } }
    ],
    layout: { name: 'cose' }
  })
}

onMounted(() => initCy(props.elements))
watch(() => props.elements, (newElements) => initCy(newElements), { deep: true })
</script>

<template>
 <div class="graph-container" ref="graphContainer" style="height: 100%; width: 100%; flex: 1; "></div>
</template>

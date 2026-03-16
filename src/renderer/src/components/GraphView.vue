<script setup>
import { watch, ref, onMounted, onUnmounted, toRaw } from 'vue'
import cytoscape from 'cytoscape'

const props = defineProps(['elements'])
const graphContainer = ref(null)
let cy = null

function updateGraph(elements) {
  if (!graphContainer.value || !elements?.length) return

  if (!cy) {
    // first time: initialize the instance
    cy = cytoscape({
      container: graphContainer.value,
      elements: toRaw(elements),
      style: [
        { selector: 'node.friend', style: { 'background-color': '#666', 'label': 'data(label)', 'color': '#fff' } },
        { selector: 'node.diamond', style: { 'shape': 'diamond', 'background-color': '#4CAF50', 'label': 'data(label)', 'color': '#fff' } },
        { selector: 'node.solo', style: { 'background-color': '#888', 'label': 'data(label)', 'color': '#fff' } },
        { selector: 'edge', style: { 'width': 2, 'line-color': '#555' } }
      ],
      layout: { name: 'cose', animate: false }
    })
  } else {
    // update: replace elements without leaking memory
    cy.json({ elements: toRaw(elements) })
    cy.layout({ name: 'cose', animate: true }).run()
  }
}

onMounted(() => updateGraph(props.elements))

// clean up memory when component is destroyed
onUnmounted(() => {
  if (cy) {
    cy.destroy()
    cy = null
  }
})

watch(
  () => props.elements,
  (newElements) => updateGraph(newElements),
  { deep: true }
)
</script>

<template>
  <div class="graph-container" ref="graphContainer" style="height: 100%; width: 100%; flex: 1;"></div>
</template>
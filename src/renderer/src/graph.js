export function buildGraphData(clips, friends) {
  const coOccurrence = {}
  const solo = {}

  for (const clip of clips) {
    const fileName = clip
      .split('\\')
      .pop()
      .toLowerCase()
      .replace(/\.mp4$/i, '')
    const words = fileName.split(' ')
    const found = friends.filter((f) => words.includes(f))

    if (found.length === 1) {
      const key = found[0]
      solo[key] = solo[key] || []
      solo[key].push(clip)
    } else if (found.length >= 2) {
      const key = found.sort().join('-')
      coOccurrence[key] = coOccurrence[key] || []
      coOccurrence[key].push(clip)
    }
  }
  const elements = []

// 1. friend nodes
for (const friend of friends) {
  elements.push({ data: { id: friend, label: friend }, classes: 'friend' })
}

// 2. diamond nodes + edges
for (const key in coOccurrence) {
  const count = coOccurrence[key].length
  const diamondId = `diamond-${key}`
  elements.push({ data: { id: diamondId, label: String(count) }, classes: 'diamond' })
  
  const [f1, f2] = key.split('-')
  elements.push({ data: { id: `e1-${key}`, source: f1, target: diamondId } })
  elements.push({ data: { id: `e2-${key}`, source: f2, target: diamondId } })
}

// 3. solo nodes
for (const friend in solo) {
  const count = solo[friend].length
  elements.push({ data: { id: `solo-${friend}`, label: `${friend} (${count})` }, classes: 'solo' })
}
console.log(elements)
return elements

}

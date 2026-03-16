export function buildGraphData(clips, friends) {
  const coOccurrence = {}
  const solo = {}

  // point #1: lowerCase all friends once for consistent comparison
  const lowerFriends = friends.map(f => f.toLowerCase())

  for (const clip of clips) {
    const fileName = clip
      .split('\\')
      .pop()
      .toLowerCase()
      .replace(/\.mp4$/i, '')
    
    const words = fileName.split(' ')
    // point #2: compare lowerCase words to lowerCase friends
    const found = lowerFriends.filter((f) => words.includes(f))

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

  // 1. friend nodes (using original display names from the props)
  for (const friend of friends) {
    elements.push({ data: { id: friend.toLowerCase(), label: friend }, classes: 'friend' })
  }

  // 2. diamond nodes + edges
  for (const key in coOccurrence) {
    const count = coOccurrence[key].length
    const diamondId = `diamond-${key}`
    elements.push({ data: { id: diamondId, label: String(count) }, classes: 'diamond' })
    
    const names = key.split('-')
    elements.push({ data: { id: `e1-${key}`, source: names[0], target: diamondId } })
    elements.push({ data: { id: `e2-${key}`, source: names[1], target: diamondId } })
  }

  // 3. solo nodes
  for (const friendKey in solo) {
    const count = solo[friendKey].length
    // match the label to the display name if possible
    const displayName = friends.find(f => f.toLowerCase() === friendKey) || friendKey
    elements.push({ data: { id: `solo-${friendKey}`, label: `${displayName} (${count})` }, classes: 'solo' })
  }
  
  return elements
}
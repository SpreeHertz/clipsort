export function buildGraphData(clips, friends) {
  const coOccurrence = {}
  const soloCounts = {}
  const elements = []

  const lowerFriends = friends.map(f => f.toLowerCase())
  if (!clips || !friends) return []
  // 1. First pass: Count everything
  for (const clip of clips) {
    const fileName = clip.split('\\').pop().toLowerCase().replace(/\.mp4$/i, '')
    const words = fileName.split(' ')
    const found = lowerFriends.filter(f => words.includes(f))

    if (found.length === 1) {
      const key = found[0]
      soloCounts[key] = (soloCounts[key] || 0) + 1
    } else if (found.length >= 2) {
      const key = found.sort().join('|')
      coOccurrence[key] = (coOccurrence[key] || 0) + 1
    }
  }

  // 2. Create Friend Nodes with merged labels
  for (const friend of friends) {
    const fKey = friend.toLowerCase()
    const soloCount = soloCounts[fKey] || 0
    
    // Format: "alen (2)" if they have solo clips, otherwise just "alen"
    const displayLabel = soloCount > 0 ? `${friend} (${soloCount})` : friend
    let isSolo = false
    if (soloCount === 0) {
      isSolo = true
    }
    elements.push({ 
      data: { id: fKey, label: displayLabel }, 
      classes: isSolo ? 'solo' : 'friend'
    })
  }

  // 3. Create Diamond Hubs (Co-occurrence)
  for (const key in coOccurrence) {
    const count = coOccurrence[key]
    const diamondId = `diamond-${key}`
    const involvedFriends = key.split('|')

    elements.push({ 
      data: { id: diamondId, label: String(count) }, 
      classes: 'diamond' 
    })

    involvedFriends.forEach(name => {
      elements.push({ 
        data: { 
          id: `e-${name}-${diamondId}`, 
          source: name, 
          target: diamondId 
        } 
      })
    })
  }

  return elements
}
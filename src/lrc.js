export function parseLRC(lrc) {
  if (!lrc) return []
  const lines = lrc.split('\n')
  const parsed = []
  for (const line of lines) {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/)
    if (match) {
      const minutes = parseInt(match[1])
      const seconds = parseInt(match[2])
      const frac = parseInt(match[3])
      const time = minutes * 60 + seconds + frac / (match[3].length === 2 ? 100 : 1000)
      const text = match[4].trim()
      parsed.push({ time, text })
    }
  }
  return parsed.sort((a, b) => a.time - b.time)
}

export function getCurrentLineIndex(lines, progressMs) {
  if (!lines.length) return -1
  const currentTime = progressMs / 1000
  let index = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) {
      index = i
    } else {
      break
    }
  }
  return index
}

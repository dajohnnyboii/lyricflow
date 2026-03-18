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
  // Before first lyric line
  if (currentTime < lines[0].time) return -1
  // Binary search for performance
  let lo = 0, hi = lines.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= currentTime) {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return hi
}

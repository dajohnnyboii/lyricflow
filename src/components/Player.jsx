import { useState, useEffect, useRef, useCallback } from 'react'
import { getCurrentlyPlaying } from '../spotify'
import { parseLRC, getCurrentLineIndex } from '../lrc'

const THEMES = ['dark', 'neon', 'glass']

async function extractAccentColor(url) {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((res, rej) => {
      img.onload = res
      img.onerror = rej
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 50
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, 50, 50)
    const { data } = ctx.getImageData(0, 0, 50, 50)
    let bestScore = 0
    let accent = [29, 185, 84]
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const sat = max ? (max - min) / max : 0
      const bright = max / 255
      const score = sat * bright * bright
      if (score > bestScore && bright > 0.3) {
        bestScore = score
        accent = [r, g, b]
      }
    }
    return `rgb(${accent.join(',')})`
  } catch {
    return '#1DB954'
  }
}

function lineClass(i, current) {
  if (i === current) return 'll active'
  const d = Math.min(Math.abs(i - current), 5)
  return `ll ${i < current ? 'past' : 'upcoming'} d${d}`
}

export default function Player({ onLogout }) {
  const [track, setTrack] = useState(null)
  const [lyrics, setLyrics] = useState([])
  const [currentLine, setCurrentLine] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progressMs, setProgressMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [status, setStatus] = useState('no-track')
  const [accentColor, setAccentColor] = useState('#1DB954')
  const [focusMode, setFocusMode] = useState(false)
  const [themeIndex, setThemeIndex] = useState(() => {
    const saved = localStorage.getItem('lf_theme')
    return saved ? (THEMES.indexOf(saved) || 0) : 0
  })
  const lineRefs = useRef([])
  const currentTrackIdRef = useRef(null)
  const touchStartX = useRef(null)

  const theme = THEMES[themeIndex]

  const cycleTheme = useCallback((e) => {
    e.stopPropagation()
    setThemeIndex(i => {
      const next = (i + 1) % THEMES.length
      localStorage.setItem('lf_theme', THEMES[next])
      return next
    })
  }, [])

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) > 60) {
      setThemeIndex(i => {
        const next = dx < 0
          ? (i + 1) % THEMES.length
          : (i - 1 + THEMES.length) % THEMES.length
        localStorage.setItem('lf_theme', THEMES[next])
        return next
      })
    }
  }, [])

  const fetchLyrics = useCallback(async (name, artist, album, dur) => {
    try {
      const params = new URLSearchParams({
        track_name: name,
        artist_name: artist,
        album_name: album,
        duration: Math.round(dur / 1000),
      })
      const res = await fetch(`https://lrclib.net/api/get?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.syncedLyrics) return parseLRC(data.syncedLyrics)
      if (data.plainLyrics) {
        return data.plainLyrics.split('\n')
          .map((text, i) => ({ time: i * 4, text: text.trim() }))
          .filter(l => l.text)
      }
      throw new Error()
    } catch {
      return []
    }
  }, [])

  const fetchCurrentTrack = useCallback(async () => {
    try {
      const data = await getCurrentlyPlaying()
      if (!data || !data.item) {
        setStatus('no-track')
        setTrack(null)
        currentTrackIdRef.current = null
        return
      }
      setIsPlaying(data.is_playing)
      setProgressMs(data.progress_ms)
      setDurationMs(data.item.duration_ms)

      const newId = data.item.id
      if (newId !== currentTrackIdRef.current) {
        currentTrackIdRef.current = newId
        setTrack(data.item)
        setCurrentLine(-1)
        lineRefs.current = []
        setStatus('loading')
        setLyrics([])

        const art = data.item.album?.images?.[0]?.url
        if (art) extractAccentColor(art).then(setAccentColor)

        const lines = await fetchLyrics(
          data.item.name,
          data.item.artists[0].name,
          data.item.album.name,
          data.item.duration_ms
        )
        if (currentTrackIdRef.current === newId) {
          setLyrics(lines)
          setStatus(lines.length ? 'playing' : 'no-lyrics')
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, [fetchLyrics])

  useEffect(() => {
    fetchCurrentTrack()
    const id = setInterval(fetchCurrentTrack, 5000)
    return () => clearInterval(id)
  }, [fetchCurrentTrack])

  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => setProgressMs(p => p + 250), 250)
    return () => clearInterval(id)
  }, [isPlaying])

  useEffect(() => {
    if (!lyrics.length) return
    const idx = getCurrentLineIndex(lyrics, progressMs)
    if (idx !== currentLine) setCurrentLine(idx)
  }, [progressMs, lyrics, currentLine])

  useEffect(() => {
    if (currentLine >= 0 && lineRefs.current[currentLine]) {
      lineRefs.current[currentLine].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentLine])

  const albumArt = track?.album?.images?.[0]?.url
  const progress = durationMs ? Math.min((progressMs / durationMs) * 100, 100) : 0

  return (
    <div
      className={`player${focusMode ? ' focus' : ''}`}
      data-theme={theme}
      style={{ '--accent': accentColor }}
      onClick={() => setFocusMode(v => !v)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {albumArt && <div className="bg-art" style={{ backgroundImage: `url(${albumArt})` }} />}
      <div className="ambient-orb" />
      <div className="ambient-orb" />
      <div className="bg-vignette" />

      <div className="topbar" onClick={e => e.stopPropagation()}>
        {albumArt
          ? <img src={albumArt} className="mini-art" alt="" />
          : <div className="mini-art placeholder" />
        }
        <div className="topbar-meta">
          <span className="topbar-title">{track?.name || '—'}</span>
          <span className="topbar-artist">
            {track?.artists?.map(a => a.name).join(', ') || 'Nothing playing'}
          </span>
        </div>
        <div className={`bars${isPlaying ? ' active' : ''}`}>
          <span /><span /><span /><span />
        </div>
        <button className="theme-btn" onClick={cycleTheme} title="Change theme">
          {theme === 'dark' ? '◐' : theme === 'neon' ? '✦' : '◈'}
        </button>
        <button className="x-btn" onClick={onLogout} title="Logout">✕</button>
      </div>

      <div className="lyrics-stage" onClick={e => e.stopPropagation()}>
        {status === 'loading' && (
          <div className="lstate"><div className="spinner" /></div>
        )}
        {status === 'no-track' && (
          <div className="lstate">
            <p>Nothing playing</p>
            <p className="sub">Open Spotify and play a song</p>
          </div>
        )}
        {status === 'no-lyrics' && (
          <div className="lstate">
            <p>No lyrics found</p>
            <p className="sub">{track?.name}</p>
          </div>
        )}
        {status === 'playing' && (
          <div className="lyrics-list">
            {lyrics.map((line, i) => (
              <div
                key={i}
                ref={el => { lineRefs.current[i] = el }}
                className={lineClass(i, currentLine)}
              >
                {line.text || <span className="dot">·</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="prog-bar" onClick={e => e.stopPropagation()}>
        <div className="prog-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

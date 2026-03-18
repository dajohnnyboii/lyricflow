import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getCurrentlyPlaying } from '../spotify'
import { parseLRC, getCurrentLineIndex } from '../lrc'

const THEMES = ['dark', 'neon', 'glass', 'minimal']

async function extractAccentColor(url) {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 50
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, 50, 50)
    const { data } = ctx.getImageData(0, 0, 50, 50)
    let bestScore = 0, accent = [250, 60, 80]
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const sat = max ? (max - min) / max : 0
      const bright = max / 255
      const score = sat * bright * bright
      if (score > bestScore && bright > 0.25) { bestScore = score; accent = [r, g, b] }
    }
    return `rgb(${accent.join(',')})`
  } catch { return 'rgb(250, 60, 80)' }
}

// Lyric line class with smoother distance grading
function lineClass(i, current) {
  if (current < 0) return 'll upcoming d5'
  if (i === current) return 'll active'
  const d = Math.abs(i - current)
  const dist = Math.min(d, 6)
  return `ll ${i < current ? 'past' : 'upcoming'} d${dist}`
}

// Cache for lyrics to avoid re-fetching
const lyricsCache = new Map()

export default function Player({ onLogout }) {
  const [track, setTrack] = useState(null)
  const [lyrics, setLyrics] = useState([])
  const [currentLine, setCurrentLine] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progressMs, setProgressMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [status, setStatus] = useState('no-track')
  const [accentColor, setAccentColor] = useState('rgb(250, 60, 80)')
  const [focusMode, setFocusMode] = useState(false)
  const [showPremium, setShowPremium] = useState(false)
  const [themeIndex, setThemeIndex] = useState(() => {
    const saved = localStorage.getItem('lf_theme')
    return saved ? (THEMES.indexOf(saved) === -1 ? 0 : THEMES.indexOf(saved)) : 0
  })
  const lineRefs = useRef([])
  const currentTrackIdRef = useRef(null)
  const touchStartX = useRef(null)
  const progressRef = useRef(0)
  const animFrameRef = useRef(null)
  const lastUpdateRef = useRef(Date.now())

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
        const next = dx < 0 ? (i + 1) % THEMES.length : (i - 1 + THEMES.length) % THEMES.length
        localStorage.setItem('lf_theme', THEMES[next])
        return next
      })
    }
  }, [])

  const fetchLyrics = useCallback(async (name, artist, album, dur) => {
    const cacheKey = `${name}|${artist}`
    if (lyricsCache.has(cacheKey)) return lyricsCache.get(cacheKey)
    try {
      const params = new URLSearchParams({
        track_name: name, artist_name: artist, album_name: album,
        duration: Math.round(dur / 1000),
      })
      const res = await fetch(`https://lrclib.net/api/get?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      let lines = []
      if (data.syncedLyrics) {
        lines = parseLRC(data.syncedLyrics)
      } else if (data.plainLyrics) {
        lines = data.plainLyrics.split('\n')
          .map((text, i) => ({ time: i * 4, text: text.trim() }))
          .filter(l => l.text)
      }
      if (lines.length) lyricsCache.set(cacheKey, lines)
      return lines
    } catch {
      // Fallback: try search endpoint for better matching
      try {
        const params = new URLSearchParams({ q: `${name} ${artist}` })
        const res = await fetch(`https://lrclib.net/api/search?${params}`)
        if (!res.ok) throw new Error()
        const results = await res.json()
        if (results.length > 0 && results[0].syncedLyrics) {
          const lines = parseLRC(results[0].syncedLyrics)
          if (lines.length) lyricsCache.set(cacheKey, lines)
          return lines
        }
      } catch {}
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
      progressRef.current = data.progress_ms
      lastUpdateRef.current = Date.now()
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
          data.item.name, data.item.artists[0].name,
          data.item.album.name, data.item.duration_ms
        )
        if (currentTrackIdRef.current === newId) {
          setLyrics(lines)
          setStatus(lines.length ? 'playing' : 'no-lyrics')
        }
      }
    } catch (e) { console.error(e) }
  }, [fetchLyrics])

  // Faster polling: 3s instead of 5s
  useEffect(() => {
    fetchCurrentTrack()
    const id = setInterval(fetchCurrentTrack, 3000)
    return () => clearInterval(id)
  }, [fetchCurrentTrack])

  // Use requestAnimationFrame for buttery smooth progress updates
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      return
    }
    const tick = () => {
      const now = Date.now()
      const elapsed = now - lastUpdateRef.current
      lastUpdateRef.current = now
      progressRef.current += elapsed
      setProgressMs(progressRef.current)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [isPlaying])

  // Update current line
  useEffect(() => {
    if (!lyrics.length) return
    const idx = getCurrentLineIndex(lyrics, progressMs)
    if (idx !== currentLine) setCurrentLine(idx)
  }, [progressMs, lyrics, currentLine])

  // Smooth scroll to active line
  useEffect(() => {
    if (currentLine >= 0 && lineRefs.current[currentLine]) {
      lineRefs.current[currentLine].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentLine])

  const albumArt = track?.album?.images?.[0]?.url
  const progress = durationMs ? Math.min((progressMs / durationMs) * 100, 100) : 0

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div
      className={`player${focusMode ? ' focus' : ''}`}
      data-theme={theme}
      style={{ '--accent': accentColor }}
      onClick={() => setFocusMode(v => !v)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {albumArt && <div className="bg-art" key={track?.id} style={{ backgroundImage: `url(${albumArt})` }} />}
      <div className="ambient-orb" />
      <div className="ambient-orb" />
      <div className="bg-vignette" />

      <div className="topbar" onClick={e => e.stopPropagation()}>
        <div className="topbar-left">
          {albumArt
            ? <img src={albumArt} className="mini-art" alt="" />
            : <div className="mini-art placeholder" />
          }
          <div className="topbar-meta">
            <span className="topbar-title">{track?.name || 'Nothing Playing'}</span>
            <span className="topbar-artist">
              {track?.artists?.map(a => a.name).join(', ') || 'Open Spotify to start'}
            </span>
          </div>
        </div>
        <div className="topbar-right">
          <div className={`bars${isPlaying ? ' active' : ''}`}>
            <span /><span /><span /><span />
          </div>
          <button className="icon-btn" onClick={cycleTheme} title="Change theme">
            {theme === 'dark' ? '◐' : theme === 'neon' ? '✦' : theme === 'glass' ? '◈' : '○'}
          </button>
          <button className="icon-btn pro-btn" onClick={(e) => { e.stopPropagation(); setShowPremium(true) }} title="Pro Features">
            PRO
          </button>
          <button className="icon-btn" onClick={onLogout} title="Logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      <div className="lyrics-stage" onClick={e => e.stopPropagation()}>
        {status === 'loading' && (
          <div className="lstate">
            <div className="loading-logo">
              <div className="logo-icon pulse">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9Q12 6 18 8M5 13Q12 10 19 12M7 17Q12 14 17 16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            <p>Finding lyrics...</p>
          </div>
        )}
        {status === 'no-track' && (
          <div className="lstate">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <p>Nothing playing</p>
            <p className="sub">Play something on Spotify to see lyrics</p>
          </div>
        )}
        {status === 'no-lyrics' && (
          <div className="lstate">
            <p>No lyrics available</p>
            <p className="sub">{track?.name} — {track?.artists?.[0]?.name}</p>
          </div>
        )}
        {status === 'playing' && (
          <div className="lyrics-list">
            {lyrics.map((line, i) => (
              <div
                key={`${track?.id}-${i}`}
                ref={el => { lineRefs.current[i] = el }}
                className={lineClass(i, currentLine)}
              >
                {line.text || <span className="dot">·</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="prog-section" onClick={e => e.stopPropagation()}>
        <div className="prog-bar">
          <div className="prog-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="prog-times">
          <span>{formatTime(progressMs)}</span>
          <span>{formatTime(durationMs)}</span>
        </div>
      </div>

      {/* Premium Modal */}
      {showPremium && (
        <div className="premium-overlay" onClick={() => setShowPremium(false)}>
          <div className="premium-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPremium(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div className="premium-badge">PRO</div>
            <h2>Unlock LyricFlow Pro</h2>
            <p className="premium-subtitle">Take your lyrics experience to the next level</p>
            <ul className="premium-features">
              <li>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Instant lyrics translation (40+ languages)
              </li>
              <li>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Export lyric cards for social media
              </li>
              <li>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Custom themes and advanced animations
              </li>
              <li>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Offline lyric caching
              </li>
              <li>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                No watermarks on exports
              </li>
            </ul>
            <div className="premium-pricing">
              <div className="premium-price">
                <span className="price-amount">$4.99</span>
                <span className="price-period">/month</span>
              </div>
              <span className="price-or">or</span>
              <div className="premium-price lifetime">
                <span className="price-amount">$29.99</span>
                <span className="price-period">lifetime</span>
              </div>
            </div>
            <button className="btn-primary premium-cta">Start 7-Day Free Trial</button>
            <p className="premium-note">Cancel anytime. No commitment.</p>
          </div>
        </div>
      )}
    </div>
  )
}

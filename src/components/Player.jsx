import { useState, useEffect, useRef, useCallback } from 'react'
import { getCurrentlyPlaying } from '../spotify'
import { parseLRC, getCurrentLineIndex } from '../lrc'

const THEMES = ['dark', 'neon', 'glass', 'minimal']

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ru', name: 'Russian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
]

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

function lineClass(i, current, isPro) {
  if (current < 0) return `ll upcoming d5${isPro ? ' pro-blur' : ''}`
  if (i === current) return 'll active'
  const d = Math.abs(i - current)
  const dist = Math.min(d, 6)
  const base = `ll ${i < current ? 'past' : 'upcoming'} d${dist}`
  return isPro ? `${base} pro-blur` : base
}

const lyricsCache = new Map()
const translationCache = new Map()

function getPro() {
  return localStorage.getItem('lf_pro') === 'true'
}

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
  const [isPro, setIsPro] = useState(getPro)
  const [showTranslate, setShowTranslate] = useState(false)
  const [translatedLyrics, setTranslatedLyrics] = useState(null)
  const [translatingLang, setTranslatingLang] = useState(null)
  const [showExport, setShowExport] = useState(false)
  const [exportStatus, setExportStatus] = useState(null)
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

  const activatePro = useCallback(() => {
    localStorage.setItem('lf_pro', 'true')
    setIsPro(true)
    setShowPremium(false)
  }, [])

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

  // Translation using MyMemory free API
  const translateLyrics = useCallback(async (lang) => {
    if (!lyrics.length) return
    setTranslatingLang(lang)

    const cacheKey = `${track?.id}|${lang}`
    if (translationCache.has(cacheKey)) {
      setTranslatedLyrics(translationCache.get(cacheKey))
      setTranslatingLang(null)
      setShowTranslate(false)
      return
    }

    try {
      // Batch lyrics text for translation (join with | separator)
      const textsToTranslate = lyrics.filter(l => l.text.trim()).map(l => l.text)
      const translated = []

      // Translate in batches of 5 for speed
      for (let i = 0; i < textsToTranslate.length; i += 5) {
        const batch = textsToTranslate.slice(i, i + 5)
        const results = await Promise.all(
          batch.map(async (text) => {
            try {
              const res = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}`
              )
              const data = await res.json()
              return data.responseData?.translatedText || text
            } catch { return text }
          })
        )
        translated.push(...results)
      }

      // Map translations back to lyrics array with timing
      let tIdx = 0
      const result = lyrics.map(l => {
        if (l.text.trim() && tIdx < translated.length) {
          return { ...l, translation: translated[tIdx++] }
        }
        return { ...l, translation: '' }
      })

      translationCache.set(cacheKey, result)
      setTranslatedLyrics(result)
    } catch {
      setTranslatedLyrics(null)
    }
    setTranslatingLang(null)
    setShowTranslate(false)
  }, [lyrics, track])

  const clearTranslation = useCallback(() => {
    setTranslatedLyrics(null)
  }, [])

  // Export lyric card as image
  const exportLyricCard = useCallback(async () => {
    if (!track || currentLine < 0 || !lyrics[currentLine]) return
    setExportStatus('generating')

    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1920
      const ctx = canvas.getContext('2d')

      // Background
      if (track.album?.images?.[0]?.url) {
        try {
          const bgImg = new Image()
          bgImg.crossOrigin = 'anonymous'
          await new Promise((res, rej) => { bgImg.onload = res; bgImg.onerror = rej; bgImg.src = track.album.images[0].url })
          ctx.drawImage(bgImg, 0, 0, 1080, 1920)
          ctx.fillStyle = 'rgba(0,0,0,0.65)'
          ctx.fillRect(0, 0, 1080, 1920)
          // Apply blur via re-draw
          ctx.filter = 'blur(60px) brightness(0.4)'
          ctx.drawImage(bgImg, -100, -100, 1280, 2120)
          ctx.filter = 'none'
          // Dark overlay
          ctx.fillStyle = 'rgba(0,0,0,0.4)'
          ctx.fillRect(0, 0, 1080, 1920)
        } catch {
          ctx.fillStyle = '#0a0a0a'
          ctx.fillRect(0, 0, 1080, 1920)
        }
      } else {
        ctx.fillStyle = '#0a0a0a'
        ctx.fillRect(0, 0, 1080, 1920)
      }

      // Album art centered
      if (track.album?.images?.[0]?.url) {
        try {
          const artImg = new Image()
          artImg.crossOrigin = 'anonymous'
          await new Promise((res, rej) => { artImg.onload = res; artImg.onerror = rej; artImg.src = track.album.images[0].url })
          const artSize = 320
          const artX = (1080 - artSize) / 2
          const artY = 400
          // Rounded corners
          const r = 24
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(artX, artY, artSize, artSize, r)
          ctx.clip()
          ctx.drawImage(artImg, artX, artY, artSize, artSize)
          ctx.restore()
          // Shadow
          ctx.shadowColor = 'rgba(0,0,0,0.5)'
          ctx.shadowBlur = 40
        } catch {}
      }

      ctx.shadowBlur = 0

      // Song title
      ctx.textAlign = 'center'
      ctx.fillStyle = 'white'
      ctx.font = 'bold 42px -apple-system, SF Pro Display, sans-serif'
      ctx.fillText(track.name, 540, 820, 900)

      // Artist
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.font = '32px -apple-system, SF Pro Display, sans-serif'
      ctx.fillText(track.artists?.map(a => a.name).join(', ') || '', 540, 870, 900)

      // Lyric text - wrap lines
      const lyricText = lyrics[currentLine].text
      ctx.fillStyle = 'white'
      ctx.font = 'bold 56px -apple-system, SF Pro Display, sans-serif'
      const words = lyricText.split(' ')
      const lines = []
      let line = ''
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > 860) {
          lines.push(line)
          line = word
        } else { line = test }
      }
      if (line) lines.push(line)

      const lineHeight = 72
      const startY = 1050 + ((4 - lines.length) * lineHeight / 2)
      lines.forEach((l, i) => {
        ctx.fillText(l, 540, startY + i * lineHeight, 960)
      })

      // Surrounding lyrics (dimmed)
      ctx.font = '28px -apple-system, SF Pro Display, sans-serif'
      if (currentLine > 0 && lyrics[currentLine - 1]?.text) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fillText(lyrics[currentLine - 1].text, 540, startY - 60, 900)
      }
      const afterY = startY + lines.length * lineHeight + 30
      if (currentLine < lyrics.length - 1 && lyrics[currentLine + 1]?.text) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fillText(lyrics[currentLine + 1].text, 540, afterY, 900)
      }

      // LyricFlow watermark
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = 'bold 24px -apple-system, SF Pro Display, sans-serif'
      ctx.fillText('LyricFlow', 540, 1780)

      // Download
      const link = document.createElement('a')
      link.download = `${track.name} - LyricFlow.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      setExportStatus('done')
      setTimeout(() => setExportStatus(null), 2000)
    } catch {
      setExportStatus('error')
      setTimeout(() => setExportStatus(null), 2000)
    }
  }, [track, currentLine, lyrics])

  // Share lyric card
  const shareLyricCard = useCallback(async () => {
    if (!track || currentLine < 0 || !lyrics[currentLine]) return
    const text = `"${lyrics[currentLine].text}"\n— ${track.name} by ${track.artists?.map(a => a.name).join(', ')}\n\nvia LyricFlow`
    if (navigator.share) {
      try { await navigator.share({ text }) } catch {}
    } else {
      await navigator.clipboard.writeText(text)
      setExportStatus('copied')
      setTimeout(() => setExportStatus(null), 2000)
    }
  }, [track, currentLine, lyrics])

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
        setTranslatedLyrics(null)

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

  useEffect(() => {
    fetchCurrentTrack()
    const id = setInterval(fetchCurrentTrack, 3000)
    return () => clearInterval(id)
  }, [fetchCurrentTrack])

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

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const displayLyrics = translatedLyrics || lyrics

  return (
    <div
      className={`player${focusMode ? ' focus' : ''}${isPro ? ' pro-mode' : ''}`}
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

          {/* Translate button (Pro) */}
          {isPro && (
            <button
              className={`icon-btn${translatedLyrics ? ' active-feature' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                if (translatedLyrics) { clearTranslation() }
                else { setShowTranslate(v => !v) }
              }}
              title={translatedLyrics ? 'Clear translation' : 'Translate lyrics'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </button>
          )}

          {/* Export button (Pro) */}
          {isPro && (
            <button
              className="icon-btn"
              onClick={(e) => { e.stopPropagation(); setShowExport(v => !v) }}
              title="Export lyric card"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
          )}

          <button className="icon-btn" onClick={cycleTheme} title="Change theme">
            {theme === 'dark' ? '◐' : theme === 'neon' ? '✦' : theme === 'glass' ? '◈' : '○'}
          </button>
          <button
            className={`icon-btn pro-btn${isPro ? ' pro-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); isPro ? setIsPro(false) || localStorage.removeItem('lf_pro') : setShowPremium(true) }}
            title={isPro ? 'Pro Active' : 'Upgrade to Pro'}
          >
            {isPro ? '★' : 'PRO'}
          </button>
          <button className="icon-btn" onClick={onLogout} title="Logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Translation language picker dropdown */}
      {showTranslate && (
        <div className="translate-dropdown" onClick={e => e.stopPropagation()}>
          <div className="translate-header">
            <span>Translate to</span>
            <button className="translate-close" onClick={() => setShowTranslate(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="translate-list">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                className={`translate-lang${translatingLang === lang.code ? ' loading' : ''}`}
                onClick={() => translateLyrics(lang.code)}
                disabled={!!translatingLang}
              >
                {lang.name}
                {translatingLang === lang.code && <div className="spinner-small" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Export dropdown */}
      {showExport && (
        <div className="export-dropdown" onClick={e => e.stopPropagation()}>
          <button className="export-option" onClick={() => { exportLyricCard(); setShowExport(false) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
            </svg>
            Download Lyric Card
          </button>
          <button className="export-option" onClick={() => { shareLyricCard(); setShowExport(false) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share Lyric Text
          </button>
        </div>
      )}

      {/* Export status toast */}
      {exportStatus && (
        <div className="toast">
          {exportStatus === 'generating' && 'Generating card...'}
          {exportStatus === 'done' && 'Lyric card downloaded!'}
          {exportStatus === 'copied' && 'Copied to clipboard!'}
          {exportStatus === 'error' && 'Export failed, try again'}
        </div>
      )}

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
            {displayLyrics.map((line, i) => (
              <div
                key={`${track?.id}-${i}`}
                ref={el => { lineRefs.current[i] = el }}
                className={lineClass(i, currentLine, isPro)}
              >
                <span className="lyric-text">{line.text || <span className="dot">·</span>}</span>
                {line.translation && (
                  <span className="lyric-translation">{line.translation}</span>
                )}
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
            <p className="premium-subtitle">The ultimate lyrics experience</p>

            <div className="premium-feature-showcase">
              <div className="showcase-item">
                <div className="showcase-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                  </svg>
                </div>
                <div>
                  <strong>Cinematic Blur Mode</strong>
                  <p>Only the current lyric is crystal clear — the rest beautifully fades into a cinematic blur</p>
                </div>
              </div>
              <div className="showcase-item">
                <div className="showcase-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </div>
                <div>
                  <strong>Live Translation</strong>
                  <p>Translate lyrics in real-time to 15+ languages as you listen</p>
                </div>
              </div>
              <div className="showcase-item">
                <div className="showcase-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
                  </svg>
                </div>
                <div>
                  <strong>Lyric Card Export</strong>
                  <p>Create stunning lyric cards with album art for Instagram and TikTok</p>
                </div>
              </div>
              <div className="showcase-item">
                <div className="showcase-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <path d="m9 12 2 2 4-4"/>
                  </svg>
                </div>
                <div>
                  <strong>All Themes Unlocked</strong>
                  <p>Access every theme including exclusive Pro-only visual modes</p>
                </div>
              </div>
            </div>

            <div className="premium-pricing">
              <div className="premium-price-card active">
                <span className="price-tag">Monthly</span>
                <div className="premium-price">
                  <span className="price-amount">$4.99</span>
                  <span className="price-period">/mo</span>
                </div>
              </div>
              <div className="premium-price-card">
                <span className="price-tag">Lifetime</span>
                <div className="premium-price">
                  <span className="price-amount">$29.99</span>
                  <span className="price-period">once</span>
                </div>
                <span className="price-save">Save 75%</span>
              </div>
            </div>

            <button className="btn-primary premium-cta" onClick={activatePro}>
              Activate Pro — Free Trial
            </button>
            <p className="premium-note">7 days free, cancel anytime</p>
          </div>
        </div>
      )}
    </div>
  )
}

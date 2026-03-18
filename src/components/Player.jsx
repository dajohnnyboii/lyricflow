import { useState, useEffect, useRef, useCallback } from 'react'
import { getCurrentlyPlaying, seekToPosition, pausePlayback, resumePlayback, skipToNext, skipToPrevious } from '../spotify'
import { parseLRC, getCurrentLineIndex } from '../lrc'
import Visualizer, { VISUALIZER_STYLES } from './Visualizer'
import Insights, { trackSongPlay } from './Insights'
import LyricMeaning from './LyricMeaning'

const THEMES = ['dark', 'neon', 'glass', 'minimal']
const VIEW_MODES = ['flow', 'karaoke', 'immersive']

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

const EXPORT_FORMATS = [
  { id: 'story', label: 'Story', w: 1080, h: 1920, ratio: '9:16' },
  { id: 'square', label: 'Square', w: 1080, h: 1080, ratio: '1:1' },
  { id: 'wide', label: 'Wide', w: 1920, h: 1080, ratio: '16:9' },
]

const DEFAULT_PRO_SETTINGS = {
  fontSize: 100,
  blurEnabled: true,
  lyricAlign: 'center',
  glowIntensity: 100,
  animationSpeed: 100,
  autoFocus: true,
  privateMode: false,
}

const MOOD_KEYWORDS = {
  energetic: ['dance', 'move', 'party', 'fire', 'jump', 'run', 'fast', 'wild', 'energy'],
  sad: ['cry', 'tears', 'alone', 'heart', 'miss', 'gone', 'pain', 'broken', 'lost', 'die'],
  chill: ['dream', 'night', 'float', 'peace', 'sky', 'calm', 'breeze', 'slow', 'easy'],
  romantic: ['love', 'kiss', 'baby', 'darling', 'hold', 'touch', 'forever', 'yours'],
  hype: ['yeah', "let's go", 'woah', 'drop', 'yo', 'bang', 'boom', 'turn up', 'lit'],
}

const MOOD_COLORS = {
  energetic: 'rgb(255, 140, 50)',
  sad: 'rgb(80, 140, 255)',
  chill: 'rgb(160, 100, 240)',
  romantic: 'rgb(255, 100, 160)',
  hype: 'rgb(255, 60, 60)',
}

const MOOD_EMOJIS = {
  energetic: '\u{1F525}',
  sad: '\u{1F4A7}',
  chill: '\u{1F30C}',
  romantic: '\u{1F497}',
  hype: '\u{26A1}',
}

function getProSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('lf_pro_settings'))
    return { ...DEFAULT_PRO_SETTINGS, ...s }
  } catch { return { ...DEFAULT_PRO_SETTINGS } }
}

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

function detectMood(lyrics) {
  if (!lyrics || !lyrics.length) return null
  const allText = lyrics.map(l => l.text).join(' ').toLowerCase()
  let bestMood = null, bestCount = 0
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    let count = 0
    for (const kw of keywords) {
      const regex = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi')
      const matches = allText.match(regex)
      if (matches) count += matches.length
    }
    if (count > bestCount) { bestCount = count; bestMood = mood }
  }
  return bestCount >= 2 ? bestMood : null
}

function findInstrumentalGaps(lyrics) {
  const gaps = new Set()
  for (let i = 0; i < lyrics.length - 1; i++) {
    const gapMs = (lyrics[i + 1].time - lyrics[i].time) * 1000
    if (gapMs >= 8000 && !lyrics[i].text.trim()) {
      gaps.add(i)
    }
    // Also mark lines where the next line is 8+ seconds away
    if (gapMs >= 8000) {
      gaps.add(i)
    }
  }
  return gaps
}

function lineClass(i, current, isPro, blurEnabled) {
  if (current < 0) return `ll upcoming d5${isPro && blurEnabled ? ' pro-blur' : ''}`
  if (i === current) return 'll active'
  const d = Math.abs(i - current)
  const dist = Math.min(d, 6)
  const base = `ll ${i < current ? 'past' : 'upcoming'} d${dist}`
  return isPro && blurEnabled ? `${base} pro-blur` : base
}

const lyricsCache = new Map()
const translationCache = new Map()

// Persist lyrics cache to localStorage
function persistLyricsCache() {
  try {
    const obj = {}
    lyricsCache.forEach((v, k) => { obj[k] = v })
    localStorage.setItem('lf_lyrics_cache', JSON.stringify(obj))
  } catch {}
}
function loadLyricsCache() {
  try {
    const obj = JSON.parse(localStorage.getItem('lf_lyrics_cache'))
    if (obj) Object.entries(obj).forEach(([k, v]) => lyricsCache.set(k, v))
  } catch {}
}
loadLyricsCache()

function getPro() { return localStorage.getItem('lf_pro') === 'true' }

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
  const [proSettings, setProSettings] = useState(getProSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [showTranslate, setShowTranslate] = useState(false)
  const [translatedLyrics, setTranslatedLyrics] = useState(null)
  const [translatingLang, setTranslatingLang] = useState(null)
  const [showExport, setShowExport] = useState(false)
  const [exportStatus, setExportStatus] = useState(null)
  const [isSeeking, setIsSeeking] = useState(false)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('lf_view') || 'flow')
  const [exportFormat, setExportFormat] = useState('story')
  const [exportWithLyrics, setExportWithLyrics] = useState(true)
  const [themeIndex, setThemeIndex] = useState(() => {
    const saved = localStorage.getItem('lf_theme')
    return saved ? (THEMES.indexOf(saved) === -1 ? 0 : THEMES.indexOf(saved)) : 0
  })

  // New PRO feature states
  const [visualizerStyle, setVisualizerStyle] = useState(0)
  const [visualizerEnabled, setVisualizerEnabled] = useState(false)
  const [loopActive, setLoopActive] = useState(false)
  const [loopStart, setLoopStart] = useState(null)
  const [loopEnd, setLoopEnd] = useState(null)
  const [mood, setMood] = useState(null)
  const [showInsights, setShowInsights] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [meaningLine, setMeaningLine] = useState(null)
  const [premiumTab, setPremiumTab] = useState('features')

  const lineRefs = useRef([])
  const currentTrackIdRef = useRef(null)
  const touchStartX = useRef(null)
  const progressRef = useRef(0)
  const animFrameRef = useRef(null)
  const lastUpdateRef = useRef(Date.now())
  const lyricsStageRef = useRef(null)
  const isPlayingRef = useRef(false)
  const autoFocusTimerRef = useRef(null)
  const lastTrackIdForInsights = useRef(null)

  const theme = THEMES[themeIndex]

  // Online/offline detection
  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])

  // Smart Focus Mode+ (Auto-hide)
  useEffect(() => {
    if (!isPro || !proSettings.autoFocus) return
    const resetTimer = () => {
      setFocusMode(false)
      clearTimeout(autoFocusTimerRef.current)
      autoFocusTimerRef.current = setTimeout(() => setFocusMode(true), 5000)
    }
    resetTimer()
    window.addEventListener('mousemove', resetTimer)
    window.addEventListener('touchstart', resetTimer)
    return () => {
      clearTimeout(autoFocusTimerRef.current)
      window.removeEventListener('mousemove', resetTimer)
      window.removeEventListener('touchstart', resetTimer)
    }
  }, [isPro, proSettings.autoFocus])

  // Keep isPlayingRef in sync
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  // Detect mood when lyrics change
  useEffect(() => {
    if (isPro && lyrics.length > 0) {
      setMood(detectMood(lyrics))
    } else {
      setMood(null)
    }
  }, [lyrics, isPro])

  // Smart Loop: seek back when reaching loop end
  useEffect(() => {
    if (!loopActive || loopStart === null || loopEnd === null) return
    if (progressMs >= loopEnd) {
      seekToPosition(loopStart).catch(() => {})
      progressRef.current = loopStart
      lastUpdateRef.current = Date.now()
      setProgressMs(loopStart)
    }
  }, [progressMs, loopActive, loopStart, loopEnd])

  // Instrumental gaps detection
  const instrumentalGaps = lyrics.length > 0 ? findInstrumentalGaps(lyrics) : new Set()
  const isInstrumental = currentLine >= 0 && instrumentalGaps.has(currentLine) && !lyrics[currentLine]?.text?.trim()

  const updateProSetting = useCallback((key, val) => {
    setProSettings(prev => {
      const next = { ...prev, [key]: val }
      localStorage.setItem('lf_pro_settings', JSON.stringify(next))
      return next
    })
  }, [])

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

  const cycleViewMode = useCallback((e) => {
    e.stopPropagation()
    setViewMode(v => {
      const idx = VIEW_MODES.indexOf(v)
      const next = VIEW_MODES[(idx + 1) % VIEW_MODES.length]
      localStorage.setItem('lf_view', next)
      return next
    })
  }, [])

  const cycleVisualizer = useCallback((e) => {
    e.stopPropagation()
    if (!visualizerEnabled) {
      setVisualizerEnabled(true)
    } else {
      const next = (visualizerStyle + 1) % VISUALIZER_STYLES.length
      if (next === 0) {
        setVisualizerEnabled(false)
      }
      setVisualizerStyle(next)
    }
  }, [visualizerEnabled, visualizerStyle])

  const toggleLoop = useCallback((e) => {
    e.stopPropagation()
    if (loopActive) {
      setLoopActive(false)
      setLoopStart(null)
      setLoopEnd(null)
    } else {
      setLoopActive(true)
      setLoopStart(null)
      setLoopEnd(null)
    }
  }, [loopActive])

  const handleLoopLineTap = useCallback((lineTime) => {
    if (!loopActive) return
    const timeMs = lineTime * 1000
    if (loopStart === null) {
      setLoopStart(timeMs)
    } else if (loopEnd === null) {
      if (timeMs > loopStart) {
        setLoopEnd(timeMs)
      } else {
        setLoopStart(timeMs)
      }
    }
  }, [loopActive, loopStart, loopEnd])

  const handleLyricClick = useCallback((e, line, index) => {
    e.stopPropagation()
    if (loopActive && isPro) {
      handleLoopLineTap(line.time)
      return
    }
    if (isPro) {
      setMeaningLine(meaningLine === index ? null : index)
    }
  }, [loopActive, isPro, handleLoopLineTap, meaningLine])

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

  // Playback controls
  const handlePlayPause = useCallback(async (e) => {
    e.stopPropagation()
    try {
      if (isPlayingRef.current) {
        await pausePlayback()
        setIsPlaying(false)
      } else {
        await resumePlayback()
        setIsPlaying(true)
        lastUpdateRef.current = Date.now()
      }
    } catch {}
  }, [])

  const handleSkipNext = useCallback(async (e) => {
    e.stopPropagation()
    try { await skipToNext() } catch {}
    setTimeout(() => { currentTrackIdRef.current = null }, 300)
  }, [])

  const handleSkipPrev = useCallback(async (e) => {
    e.stopPropagation()
    try { await skipToPrevious() } catch {}
    setTimeout(() => { currentTrackIdRef.current = null }, 300)
  }, [])

  // Seek on progress bar click/drag
  const handleSeek = useCallback(async (e) => {
    if (!durationMs) return
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const pct = x / rect.width
    const newMs = Math.round(pct * durationMs)
    setIsSeeking(true)
    setProgressMs(newMs)
    progressRef.current = newMs
    lastUpdateRef.current = Date.now()
    try {
      await seekToPosition(newMs)
      setTimeout(() => { setIsSeeking(false) }, 500)
    } catch { setIsSeeking(false) }
  }, [durationMs])

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
      const textsToTranslate = lyrics.filter(l => l.text.trim()).map(l => l.text)
      const translated = []
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
      let tIdx = 0
      const result = lyrics.map(l => {
        if (l.text.trim() && tIdx < translated.length) {
          return { ...l, translation: translated[tIdx++] }
        }
        return { ...l, translation: '' }
      })
      translationCache.set(cacheKey, result)
      setTranslatedLyrics(result)
    } catch { setTranslatedLyrics(null) }
    setTranslatingLang(null)
    setShowTranslate(false)
  }, [lyrics, track])

  const clearTranslation = useCallback(() => { setTranslatedLyrics(null) }, [])

  // Export lyric card
  const exportLyricCard = useCallback(async () => {
    if (!track) return
    const hasLyric = currentLine >= 0 && lyrics[currentLine]
    setExportStatus('generating')
    try {
      const fmt = EXPORT_FORMATS.find(f => f.id === exportFormat) || EXPORT_FORMATS[0]
      const W = fmt.w, H = fmt.h
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')

      let bgImg = null
      if (track.album?.images?.[0]?.url) {
        try {
          bgImg = new Image()
          bgImg.crossOrigin = 'anonymous'
          await new Promise((res, rej) => { bgImg.onload = res; bgImg.onerror = rej; bgImg.src = track.album.images[0].url })
        } catch { bgImg = null }
      }

      if (bgImg) {
        ctx.filter = 'blur(80px) brightness(0.35) saturate(1.4)'
        const scale = Math.max(W / bgImg.width, H / bgImg.height) * 1.3
        const dw = bgImg.width * scale, dh = bgImg.height * scale
        ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh)
        ctx.filter = 'none'
      } else {
        ctx.fillStyle = '#0a0a0a'
        ctx.fillRect(0, 0, W, H)
      }

      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(0, 0, W, H)

      const accentMatch = accentColor.match(/\d+/g) || ['250', '60', '80']
      const [ar, ag, ab] = accentMatch.map(Number)

      const waveY = fmt.id === 'story' ? H * 0.88 : (fmt.id === 'square' ? H * 0.85 : H * 0.82)
      const waveH = fmt.id === 'story' ? 80 : 60
      const barCount = fmt.id === 'wide' ? 120 : 80
      const barW = (W - 120) / barCount
      const songProgress = durationMs ? progressMs / durationMs : 0.5

      ctx.save()
      for (let i = 0; i < barCount; i++) {
        const t = i / barCount
        const seed = Math.sin(t * 47.3 + 12.9) * 43758.5453
        const h1 = Math.abs(Math.sin(seed)) * 0.7 + 0.3
        const h2 = Math.abs(Math.sin(seed * 1.7 + 0.5)) * 0.5 + 0.2
        const height = (h1 * 0.6 + h2 * 0.4) * waveH
        const x = 60 + i * barW
        const played = t <= songProgress
        ctx.fillStyle = played ? `rgba(${ar},${ag},${ab},0.8)` : 'rgba(255,255,255,0.15)'
        const radius = Math.min(barW * 0.3, 3)
        const barX = x + barW * 0.15
        const barWidth = barW * 0.7
        ctx.beginPath()
        ctx.roundRect(barX, waveY - height / 2, barWidth, height, radius)
        ctx.fill()
      }
      ctx.restore()

      const isStory = fmt.id === 'story'
      const isSquare = fmt.id === 'square'
      const artSize = isStory ? 300 : (isSquare ? 280 : 240)
      const artX = isStory ? (W - artSize) / 2 : (fmt.id === 'wide' ? 160 : (W - artSize) / 2)
      const artY = isStory ? H * 0.2 : (isSquare ? H * 0.15 : (H - artSize) / 2)
      const ringRadius = artSize / 2 + 12
      const ringCx = artX + artSize / 2
      const ringCy = artY + artSize / 2

      ctx.beginPath()
      ctx.arc(ringCx, ringCy, ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 4
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(ringCx, ringCy, ringRadius, -Math.PI / 2, -Math.PI / 2 + songProgress * Math.PI * 2)
      const ringGrad = ctx.createLinearGradient(ringCx - ringRadius, ringCy, ringCx + ringRadius, ringCy)
      ringGrad.addColorStop(0, `rgb(${ar},${ag},${ab})`)
      ringGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0.5)`)
      ctx.strokeStyle = ringGrad
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.stroke()

      if (bgImg) {
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(artX, artY, artSize, artSize, 20)
        ctx.clip()
        ctx.drawImage(bgImg, artX, artY, artSize, artSize)
        ctx.restore()
      }

      const font = '-apple-system, SF Pro Display, sans-serif'
      const infoX = fmt.id === 'wide' ? artX + artSize + 60 : W / 2
      const infoAlign = fmt.id === 'wide' ? 'left' : 'center'
      const titleY = isStory ? artY + artSize + 50 : (isSquare ? artY + artSize + 40 : artY + 20)
      const maxTextW = fmt.id === 'wide' ? W - artX - artSize - 120 : W - 120

      ctx.textAlign = infoAlign
      ctx.fillStyle = 'white'
      ctx.font = `bold ${isStory ? 38 : 32}px ${font}`
      ctx.fillText(track.name, infoX, titleY, maxTextW)

      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = `${isStory ? 26 : 22}px ${font}`
      ctx.fillText(track.artists?.map(a => a.name).join(', ') || '', infoX, titleY + (isStory ? 42 : 36), maxTextW)

      if (exportWithLyrics && hasLyric) {
        const lyricText = lyrics[currentLine].text
        const lyricY = isStory ? titleY + 100 : (isSquare ? titleY + 80 : titleY + 80)
        ctx.fillStyle = 'white'
        ctx.font = `bold ${isStory ? 48 : 36}px ${font}`
        ctx.textAlign = infoAlign

        const words = lyricText.split(' ')
        const lyricLines = []
        let line = ''
        for (const word of words) {
          const test = line ? `${line} ${word}` : word
          if (ctx.measureText(test).width > maxTextW) { lyricLines.push(line); line = word } else { line = test }
        }
        if (line) lyricLines.push(line)
        const lh = isStory ? 62 : 48
        lyricLines.forEach((l, i) => { ctx.fillText(l, infoX, lyricY + i * lh, maxTextW + 40) })

        ctx.font = `${isStory ? 24 : 20}px ${font}`
        if (currentLine > 0 && lyrics[currentLine - 1]?.text) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)'
          ctx.fillText(lyrics[currentLine - 1].text, infoX, lyricY - (isStory ? 40 : 32), maxTextW)
        }
        if (currentLine < lyrics.length - 1 && lyrics[currentLine + 1]?.text) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)'
          ctx.fillText(lyrics[currentLine + 1].text, infoX, lyricY + lyricLines.length * lh + (isStory ? 20 : 16), maxTextW)
        }
      }

      const timeStr = formatTime(progressMs) + ' / ' + formatTime(durationMs)
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = `500 ${isStory ? 20 : 16}px ${font}`
      ctx.fillText(timeStr, W / 2, waveY + waveH / 2 + (isStory ? 30 : 24))

      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.font = `bold ${isStory ? 22 : 18}px ${font}`
      ctx.fillText('LyricFlow', W / 2, H - (isStory ? 50 : 36))

      const scanY = H - (isStory ? 90 : 64)
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.font = `500 ${isStory ? 14 : 12}px ${font}`
      ctx.fillText(`${track.name} - ${track.artists?.[0]?.name || ''}`, W / 2, scanY, W - 80)

      const link = document.createElement('a')
      link.download = `${track.name} - LyricFlow ${fmt.label}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      setExportStatus('done')
      setTimeout(() => setExportStatus(null), 2000)
    } catch { setExportStatus('error'); setTimeout(() => setExportStatus(null), 2000) }
  }, [track, currentLine, lyrics, accentColor, exportFormat, exportWithLyrics, progressMs, durationMs])

  const shareLyricCard = useCallback(async () => {
    if (!track || currentLine < 0 || !lyrics[currentLine]) return
    const text = `"${lyrics[currentLine].text}"\n— ${track.name} by ${track.artists?.map(a => a.name).join(', ')}\n\nvia LyricFlow`
    if (navigator.share) { try { await navigator.share({ text }) } catch {} }
    else { await navigator.clipboard.writeText(text); setExportStatus('copied'); setTimeout(() => setExportStatus(null), 2000) }
  }, [track, currentLine, lyrics])

  const fetchLyrics = useCallback(async (name, artist, album, dur) => {
    const cacheKey = `${name}|${artist}`
    if (lyricsCache.has(cacheKey)) return lyricsCache.get(cacheKey)
    try {
      const params = new URLSearchParams({ track_name: name, artist_name: artist, album_name: album, duration: Math.round(dur / 1000) })
      const res = await fetch(`https://lrclib.net/api/get?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      let lines = []
      if (data.syncedLyrics) { lines = parseLRC(data.syncedLyrics) }
      else if (data.plainLyrics) { lines = data.plainLyrics.split('\n').map((text, i) => ({ time: i * 4, text: text.trim() })).filter(l => l.text) }
      if (lines.length) { lyricsCache.set(cacheKey, lines); persistLyricsCache() }
      return lines
    } catch {
      try {
        const params = new URLSearchParams({ q: `${name} ${artist}` })
        const res = await fetch(`https://lrclib.net/api/search?${params}`)
        if (!res.ok) throw new Error()
        const results = await res.json()
        if (results.length > 0 && results[0].syncedLyrics) {
          const lines = parseLRC(results[0].syncedLyrics)
          if (lines.length) { lyricsCache.set(cacheKey, lines); persistLyricsCache() }
          return lines
        }
      } catch {}
      return []
    }
  }, [])

  const fetchCurrentTrack = useCallback(async () => {
    if (isSeeking) return
    try {
      const data = await getCurrentlyPlaying()
      if (!data || !data.item) {
        setStatus('no-track'); setTrack(null); currentTrackIdRef.current = null; return
      }
      setIsPlaying(data.is_playing)
      progressRef.current = data.progress_ms
      lastUpdateRef.current = Date.now()
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
        setTranslatedLyrics(null)
        setMeaningLine(null)
        // Track listening insights
        if (isPro && !proSettings.privateMode && data.item && newId !== lastTrackIdForInsights.current) {
          lastTrackIdForInsights.current = newId
          trackSongPlay(data.item, data.item.duration_ms)
        }
        const art = data.item.album?.images?.[0]?.url
        if (art) extractAccentColor(art).then(setAccentColor)
        const lines = await fetchLyrics(data.item.name, data.item.artists[0].name, data.item.album.name, data.item.duration_ms)
        if (currentTrackIdRef.current === newId) {
          setLyrics(lines)
          setStatus(lines.length ? 'playing' : 'no-lyrics')
        }
      }
    } catch (e) { console.error(e) }
  }, [fetchLyrics, isSeeking, isPro, proSettings.privateMode])

  // Fast polling: 2s
  useEffect(() => {
    fetchCurrentTrack()
    const id = setInterval(fetchCurrentTrack, 2000)
    return () => clearInterval(id)
  }, [fetchCurrentTrack])

  // rAF progress
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      return
    }
    let frameCount = 0
    const tick = () => {
      const now = Date.now()
      const elapsed = now - lastUpdateRef.current
      lastUpdateRef.current = now
      progressRef.current = Math.min(progressRef.current + elapsed, durationMs || Infinity)
      frameCount++
      if (frameCount % 2 === 0) {
        setProgressMs(progressRef.current)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [isPlaying, durationMs])

  // Update current line from progress
  useEffect(() => {
    if (!lyrics.length) return
    const idx = getCurrentLineIndex(lyrics, progressMs)
    if (idx !== currentLine) setCurrentLine(idx)
  }, [progressMs, lyrics, currentLine])

  // Scroll active line to center
  useEffect(() => {
    if (currentLine < 0 || viewMode !== 'flow') return
    const el = lineRefs.current[currentLine]
    const stage = lyricsStageRef.current
    if (!el || !stage) return
    const stageH = stage.clientHeight
    const elTop = el.offsetTop
    const elH = el.offsetHeight
    const targetScroll = elTop - stageH / 2 + elH / 2
    stage.scrollTo({ top: targetScroll, behavior: 'smooth' })
  }, [currentLine, viewMode])

  const albumArt = track?.album?.images?.[0]?.url
  const progress = durationMs ? Math.min((progressMs / durationMs) * 100, 100) : 0
  const formatTime = (ms) => {
    const clamped = Math.max(0, Math.min(ms, durationMs || ms))
    const s = Math.floor(clamped / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const displayLyrics = translatedLyrics || lyrics
  const fontScale = proSettings.fontSize / 100
  const isLeft = proSettings.lyricAlign === 'left'

  // Compute mood-based accent color
  const effectiveAccent = (isPro && mood && MOOD_COLORS[mood]) ? MOOD_COLORS[mood] : accentColor
  const glowMult = (proSettings.glowIntensity || 100) / 100
  const animSpeed = (proSettings.animationSpeed || 100) / 100

  // Loop progress bar indicators
  const loopStartPct = (loopStart !== null && durationMs) ? (loopStart / durationMs) * 100 : null
  const loopEndPct = (loopEnd !== null && durationMs) ? (loopEnd / durationMs) * 100 : null

  // Check if a line is in the loop range
  const isLineInLoop = (lineTime) => {
    if (!loopActive || loopStart === null) return false
    const timeMs = lineTime * 1000
    if (loopEnd !== null) return timeMs >= loopStart && timeMs <= loopEnd
    return timeMs === loopStart
  }

  // Check if between lyrics (instrumental)
  const isInstrumentalSection = currentLine >= 0 && lyrics[currentLine] && !lyrics[currentLine].text.trim() && currentLine < lyrics.length - 1 && ((lyrics[currentLine + 1].time - lyrics[currentLine].time) >= 8)

  return (
    <div
      className={`player${focusMode ? ' focus' : ''}${isPro && proSettings.blurEnabled ? ' pro-mode' : ''} view-${viewMode}`}
      data-theme={theme}
      style={{
        '--accent': effectiveAccent,
        '--font-scale': fontScale,
        '--glow-intensity': glowMult,
        '--anim-speed': animSpeed,
      }}
      onClick={() => { if (!proSettings.autoFocus || !isPro) setFocusMode(v => !v) }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {window.electronAPI?.isElectron && <div className="electron-drag" />}
      {albumArt && <div className="bg-art" key={track?.id} style={{ backgroundImage: `url(${albumArt})` }} />}
      <div className="ambient-orb" />
      <div className="ambient-orb" />
      <div className="bg-vignette" />

      {/* Visualizer background */}
      {isPro && visualizerEnabled && (
        <Visualizer
          style={VISUALIZER_STYLES[visualizerStyle]}
          progressMs={progressMs}
          accentColor={effectiveAccent}
          isPlaying={isPlaying}
        />
      )}

      {/* Offline indicator */}
      {!isOnline && (
        <div className="offline-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          Offline
        </div>
      )}

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

          {/* Mood badge */}
          {isPro && mood && (
            <div className="mood-badge" style={{ color: MOOD_COLORS[mood] }}>
              {MOOD_EMOJIS[mood]} {mood.charAt(0).toUpperCase() + mood.slice(1)}
            </div>
          )}

          {/* Private mode indicator */}
          {isPro && proSettings.privateMode && (
            <div className="private-badge" title="Private Mode">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
          )}

          {/* Visualizer toggle (PRO) */}
          {isPro && (
            <button
              className={`icon-btn${visualizerEnabled ? ' active-feature' : ''}`}
              onClick={cycleVisualizer}
              title={visualizerEnabled ? `Visualizer: ${VISUALIZER_STYLES[visualizerStyle]}` : 'Enable Visualizer'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 12h2m4 0h2m4 0h2m4 0h2"/><path d="M6 8v8"/><path d="M10 6v12"/><path d="M14 9v6"/><path d="M18 7v10"/>
              </svg>
            </button>
          )}

          {/* Insights button (PRO) */}
          {isPro && (
            <button
              className="icon-btn"
              onClick={(e) => { e.stopPropagation(); setShowInsights(true) }}
              title="Listening Insights"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
            </button>
          )}

          {isPro && (
            <button
              className={`icon-btn${translatedLyrics ? ' active-feature' : ''}`}
              onClick={(e) => { e.stopPropagation(); if (translatedLyrics) { clearTranslation() } else { setShowTranslate(v => !v); setShowExport(false); setShowSettings(false) } }}
              title={translatedLyrics ? 'Clear translation' : 'Translate lyrics'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </button>
          )}

          {isPro && (
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowExport(v => !v); setShowTranslate(false); setShowSettings(false) }} title="Share">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
          )}

          {isPro && (
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowSettings(v => !v); setShowTranslate(false); setShowExport(false) }} title="Customize">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4m-8.66-15 3.46 2m10.4 6 3.46 2M1 12h4m14 0h4m-15.66 8.66 2-3.46m6-10.4 2-3.46M4.34 4.34l3.46 2m8.4 8.4 3.46 2"/>
              </svg>
            </button>
          )}

          <button className="icon-btn" onClick={cycleViewMode} title={`View: ${viewMode}`}>
            {viewMode === 'flow' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
            ) : viewMode === 'karaoke' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 18.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 14l3-3 2 2 4-4"/></svg>
            )}
          </button>

          <button className="icon-btn" onClick={cycleTheme} title="Change theme">
            {theme === 'dark' ? '\u25D0' : theme === 'neon' ? '\u2726' : theme === 'glass' ? '\u25C8' : '\u25CB'}
          </button>
          <button
            className={`icon-btn pro-btn${isPro ? ' pro-active' : ''}`}
            style={isPro ? { background: `linear-gradient(135deg, color-mix(in srgb, ${effectiveAccent} 30%, transparent), color-mix(in srgb, ${effectiveAccent} 15%, transparent))`, borderColor: `color-mix(in srgb, ${effectiveAccent} 40%, transparent)`, color: effectiveAccent } : undefined}
            onClick={(e) => { e.stopPropagation(); if (isPro) { localStorage.removeItem('lf_pro'); setIsPro(false) } else { setShowPremium(true) } }}
            title={isPro ? 'Pro Active' : 'Upgrade to Pro'}
          >
            {isPro ? '\u2605' : 'PRO'}
          </button>
          <button className="icon-btn" onClick={onLogout} title="Logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Translation dropdown */}
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
              <button key={lang.code} className={`translate-lang${translatingLang === lang.code ? ' loading' : ''}`} onClick={() => translateLyrics(lang.code)} disabled={!!translatingLang}>
                {lang.name}
                {translatingLang === lang.code && <div className="spinner-small" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Share/Export Modal */}
      {showExport && (
        <div className="share-overlay" onClick={() => setShowExport(false)}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowExport(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <h3 className="share-title">Share This Moment</h3>
            <p className="share-subtitle">Create a beautiful card to share</p>

            <div className="format-picker">
              {EXPORT_FORMATS.map(fmt => (
                <button
                  key={fmt.id}
                  className={`format-btn${exportFormat === fmt.id ? ' active' : ''}`}
                  onClick={() => setExportFormat(fmt.id)}
                >
                  <div className={`format-preview fmt-${fmt.id}`} />
                  <span className="format-label">{fmt.label}</span>
                  <span className="format-ratio">{fmt.ratio}</span>
                </button>
              ))}
            </div>

            <div className="share-option-row">
              <span>Include lyrics</span>
              <button className={`setting-toggle${exportWithLyrics ? ' on' : ''}`} onClick={() => setExportWithLyrics(v => !v)}>
                <div className="toggle-knob" />
              </button>
            </div>

            <div className="share-features">
              <div className="share-feature-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                Sound wave visualization
              </div>
              <div className="share-feature-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/></svg>
                Progress ring
              </div>
              <div className="share-feature-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                Album colors
              </div>
            </div>

            <div className="share-actions">
              <button className="btn-primary share-download" onClick={() => { exportLyricCard() }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Card
              </button>
              <button className="btn-secondary share-text" onClick={() => { shareLyricCard(); setShowExport(false) }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share Text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pro Settings Panel */}
      {showSettings && (
        <div className="settings-dropdown" onClick={e => e.stopPropagation()}>
          <div className="settings-header">
            <span>Customize</span>
            <button className="translate-close" onClick={() => setShowSettings(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="settings-body">
            <div className="setting-row">
              <label>Font Size</label>
              <div className="setting-control">
                <span className="setting-val">{proSettings.fontSize}%</span>
                <input type="range" min="70" max="150" step="5" value={proSettings.fontSize} onChange={e => updateProSetting('fontSize', +e.target.value)} />
              </div>
            </div>

            <div className="setting-row">
              <label>Cinematic Blur</label>
              <button className={`setting-toggle${proSettings.blurEnabled ? ' on' : ''}`} onClick={() => updateProSetting('blurEnabled', !proSettings.blurEnabled)}>
                <div className="toggle-knob" />
              </button>
            </div>

            <div className="setting-row">
              <label>Alignment</label>
              <div className="setting-pills">
                <button className={proSettings.lyricAlign === 'center' ? 'active' : ''} onClick={() => updateProSetting('lyricAlign', 'center')}>Center</button>
                <button className={proSettings.lyricAlign === 'left' ? 'active' : ''} onClick={() => updateProSetting('lyricAlign', 'left')}>Left</button>
              </div>
            </div>

            {/* Advanced Theme Engine */}
            <div className="setting-row">
              <label>Glow Intensity</label>
              <div className="setting-control">
                <span className="setting-val">{proSettings.glowIntensity || 100}%</span>
                <input type="range" min="0" max="200" step="10" value={proSettings.glowIntensity || 100} onChange={e => updateProSetting('glowIntensity', +e.target.value)} />
              </div>
            </div>

            <div className="setting-row">
              <label>Animation Speed</label>
              <div className="setting-control">
                <span className="setting-val">{proSettings.animationSpeed || 100}%</span>
                <input type="range" min="50" max="200" step="10" value={proSettings.animationSpeed || 100} onChange={e => updateProSetting('animationSpeed', +e.target.value)} />
              </div>
            </div>

            {/* Auto Focus toggle */}
            <div className="setting-row">
              <label>Auto Focus</label>
              <button className={`setting-toggle${proSettings.autoFocus ? ' on' : ''}`} onClick={() => updateProSetting('autoFocus', !proSettings.autoFocus)}>
                <div className="toggle-knob" />
              </button>
            </div>

            {/* Private Mode toggle */}
            <div className="setting-row">
              <label>Private Mode</label>
              <button className={`setting-toggle${proSettings.privateMode ? ' on' : ''}`} onClick={() => updateProSetting('privateMode', !proSettings.privateMode)}>
                <div className="toggle-knob" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {exportStatus && (
        <div className="toast">
          {exportStatus === 'generating' && 'Generating card...'}
          {exportStatus === 'done' && 'Lyric card downloaded!'}
          {exportStatus === 'copied' && 'Copied to clipboard!'}
          {exportStatus === 'error' && 'Export failed, try again'}
        </div>
      )}

      {/* FLOW view mode - scrolling lyrics */}
      {viewMode === 'flow' && (
        <div className="lyrics-stage" ref={lyricsStageRef} onClick={e => e.stopPropagation()}>
          {status === 'loading' && (
            <div className="lstate">
              <div className="loading-logo"><div className="logo-icon pulse">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M6 9Q12 6 18 8M5 13Q12 10 19 12M7 17Q12 14 17 16" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
              </div></div>
              <p>Finding lyrics...</p>
            </div>
          )}
          {status === 'no-track' && (
            <div className="vinyl-container">
              <div className="vinyl-wrapper">
                <div className="vinyl-disc paused" />
                <div className="vinyl-cover-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                </div>
              </div>
              <div className="vinyl-info">
                <span className="vinyl-title">Nothing Playing</span>
                <span className="vinyl-artist">Play something on Spotify</span>
              </div>
            </div>
          )}
          {status === 'no-lyrics' && (
            <div className="vinyl-container">
              <div className="vinyl-wrapper">
                <div className={`vinyl-disc${!isPlaying ? ' paused' : ''}`} />
                {albumArt
                  ? <img src={albumArt} className="vinyl-cover" alt="" />
                  : <div className="vinyl-cover-placeholder">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                    </div>
                }
              </div>
              <div className="vinyl-info">
                <span className="vinyl-title">{track?.name || ''}</span>
                <span className="vinyl-artist">{track?.artists?.map(a => a.name).join(', ') || ''}</span>
                <span className="vinyl-status">No lyrics available</span>
              </div>
            </div>
          )}
          {status === 'playing' && (
            <div className={`lyrics-list${isLeft ? ' align-left' : ''}`}>
              {displayLyrics.map((line, i) => {
                const isLooped = isPro && isLineInLoop(line.time)
                const isActive = i === currentLine
                const isInstrumentalLine = isPro && isActive && !line.text.trim() && i < displayLyrics.length - 1 && ((displayLyrics[i + 1].time - line.time) >= 8)
                return (
                  <div key={`${track?.id}-${i}`} ref={el => { lineRefs.current[i] = el }}
                    className={`${lineClass(i, currentLine, isPro, proSettings.blurEnabled)}${isLooped ? ' loop-highlight' : ''}${isActive && isPro ? ' dynamic-typo' : ''}${translatedLyrics ? ' has-translation' : ''}`}
                    onClick={(e) => handleLyricClick(e, line, i)}
                  >
                    {isInstrumentalLine ? (
                      <span className="instrumental-indicator">
                        <span className="instrumental-note">{'\u266A'}</span> Instrumental
                      </span>
                    ) : (
                      <>
                        <span className="lyric-text">{line.text || <span className="dot">{'\u00B7'}</span>}</span>
                        {line.translation && <span className="lyric-translation">{line.translation}</span>}
                      </>
                    )}
                    {/* Lyric meaning popup */}
                    {isPro && meaningLine === i && line.text.trim() && (
                      <LyricMeaning
                        text={line.text}
                        artistName={track?.artists?.[0]?.name}
                        onClose={() => setMeaningLine(null)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* KARAOKE view mode */}
      {viewMode === 'karaoke' && (
        <div className="lyrics-stage karaoke-stage" onClick={e => e.stopPropagation()}>
          {(status === 'loading' || status === 'no-track' || status === 'no-lyrics') ? (
            <div className="lstate">
              {status === 'loading' && <><div className="loading-logo"><div className="logo-icon pulse"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M6 9Q12 6 18 8M5 13Q12 10 19 12M7 17Q12 14 17 16" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg></div></div><p>Finding lyrics...</p></>}
              {status === 'no-track' && (
                <div className="vinyl-container">
                  <div className="vinyl-wrapper">
                    <div className="vinyl-disc paused" />
                    <div className="vinyl-cover-placeholder">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                    </div>
                  </div>
                  <div className="vinyl-info">
                    <span className="vinyl-title">Nothing Playing</span>
                    <span className="vinyl-artist">Play something on Spotify</span>
                  </div>
                </div>
              )}
              {status === 'no-lyrics' && (
                <div className="vinyl-container">
                  <div className="vinyl-wrapper">
                    <div className={`vinyl-disc${!isPlaying ? ' paused' : ''}`} />
                    {albumArt ? <img src={albumArt} className="vinyl-cover" alt="" /> : <div className="vinyl-cover-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg></div>}
                  </div>
                  <div className="vinyl-info">
                    <span className="vinyl-title">{track?.name || ''}</span>
                    <span className="vinyl-artist">{track?.artists?.map(a => a.name).join(', ') || ''}</span>
                    <span className="vinyl-status">No lyrics available</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="karaoke-center">
              {currentLine > 0 && displayLyrics[currentLine - 1]?.text && (
                <div className="karaoke-prev">{displayLyrics[currentLine - 1].text}</div>
              )}
              <div className={`karaoke-active${isPro ? ' dynamic-typo' : ''}`} key={currentLine}>
                {currentLine >= 0 && displayLyrics[currentLine]?.text
                  ? displayLyrics[currentLine].text
                  : (isPro && isInstrumentalSection ? (
                      <span className="instrumental-indicator instrumental-karaoke">
                        <span className="instrumental-note">{'\u266A'}</span> Instrumental
                      </span>
                    ) : '\u266A')
                }
              </div>
              {currentLine >= 0 && currentLine < displayLyrics.length - 1 && displayLyrics[currentLine + 1]?.text && (
                <div className="karaoke-next">{displayLyrics[currentLine + 1].text}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* IMMERSIVE view mode */}
      {viewMode === 'immersive' && (
        <div className="lyrics-stage immersive-stage" onClick={e => e.stopPropagation()}>
          <div className="immersive-content">
            {albumArt && <img src={albumArt} className="immersive-art" alt="" />}
            <div className="immersive-meta">
              <span className="immersive-title">{track?.name || ''}</span>
              <span className="immersive-artist">{track?.artists?.map(a => a.name).join(', ') || ''}</span>
            </div>
            {status === 'playing' && currentLine >= 0 && displayLyrics[currentLine] && (
              <div className={`immersive-lyric${isPro ? ' dynamic-typo' : ''}`} key={currentLine}>
                {displayLyrics[currentLine].text}
              </div>
            )}
            {status === 'playing' && (currentLine < 0 || !displayLyrics[currentLine]?.text) && (
              <div className="immersive-lyric dim">{'\u266A'}</div>
            )}
          </div>
        </div>
      )}

      {/* Controls + Progress */}
      <div className="controls-section" onClick={e => e.stopPropagation()}>
        <div className="playback-controls">
          <button className="ctrl-btn" onClick={handleSkipPrev} title="Previous">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/></svg>
          </button>

          {/* Loop button (PRO) */}
          {isPro && (
            <button className={`ctrl-btn ctrl-loop${loopActive ? ' loop-active' : ''}`} onClick={toggleLoop} title={loopActive ? 'Clear Loop' : 'Set Loop'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={loopActive ? 'var(--accent)' : 'white'} strokeWidth="2" strokeLinecap="round">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </button>
          )}

          <button className="ctrl-btn ctrl-play" onClick={handlePlayPause} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7L8 5z"/></svg>
            )}
          </button>
          <button className="ctrl-btn" onClick={handleSkipNext} title="Next">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M16 18h2V6h-2v12zM6 18l8.5-6L6 6v12z"/></svg>
          </button>
        </div>

        {/* Progress bar with loop indicator */}
        <div className="prog-bar prog-bar-seek" onClick={handleSeek} style={{ position: 'relative' }}>
          {/* Loop range indicator */}
          {isPro && loopActive && loopStartPct !== null && loopEndPct !== null && (
            <div className="loop-range" style={{ left: `${loopStartPct}%`, width: `${loopEndPct - loopStartPct}%` }} />
          )}
          {isPro && loopActive && loopStartPct !== null && loopEndPct === null && (
            <div className="loop-marker" style={{ left: `${loopStartPct}%` }} />
          )}
          <div className="prog-fill" style={{ width: `${progress}%` }} />
          <div className="prog-thumb" style={{ left: `${progress}%` }} />
        </div>
        <div className="prog-times">
          <span>{formatTime(progressMs)}</span>
          <span>{formatTime(durationMs)}</span>
        </div>
      </div>

      {/* Insights Modal */}
      {showInsights && isPro && (
        <Insights onClose={() => setShowInsights(false)} accentColor={effectiveAccent} />
      )}

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

            {/* Premium tabs */}
            <div className="premium-tabs">
              <button className={`premium-tab${premiumTab === 'features' ? ' active' : ''}`} onClick={() => setPremiumTab('features')}>Features</button>
              <button className={`premium-tab${premiumTab === 'labs' ? ' active' : ''}`} onClick={() => setPremiumTab('labs')}>Labs</button>
            </div>

            {premiumTab === 'features' && (
              <>
                <div className="premium-feature-showcase">
                  <div className="showcase-item">
                    <div className="showcase-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg></div>
                    <div><strong>Cinematic Blur Mode</strong><p>Only the current lyric is crystal clear — the rest fades into a cinematic blur</p></div>
                  </div>
                  <div className="showcase-item">
                    <div className="showcase-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
                    <div><strong>Live Translation</strong><p>Translate lyrics in real-time to 15+ languages</p></div>
                  </div>
                  <div className="showcase-item">
                    <div className="showcase-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>
                    <div><strong>Share Cards</strong><p>Stunning cards with waveform viz, progress ring, and album colors</p></div>
                  </div>
                  <div className="showcase-item">
                    <div className="showcase-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4m-8.66-15 3.46 2m10.4 6 3.46 2M1 12h4m14 0h4m-15.66 8.66 2-3.46m6-10.4 2-3.46M4.34 4.34l3.46 2m8.4 8.4 3.46 2"/></svg></div>
                    <div><strong>Full Customization</strong><p>Font size, alignment, blur toggle, view modes — make it yours</p></div>
                  </div>
                </div>

                <div className="premium-pricing">
                  <div className="premium-price-card active">
                    <span className="price-tag">Monthly</span>
                    <div className="premium-price"><span className="price-amount">$4.99</span><span className="price-period">/mo</span></div>
                  </div>
                  <div className="premium-price-card">
                    <span className="price-tag">Lifetime</span>
                    <div className="premium-price"><span className="price-amount">$29.99</span><span className="price-period">once</span></div>
                    <span className="price-save">Save 75%</span>
                  </div>
                </div>
              </>
            )}

            {premiumTab === 'labs' && (
              <div className="labs-section">
                <p className="labs-description">Experimental features coming soon</p>
                <div className="labs-grid">
                  {[
                    { name: 'Voice Control', icon: '\u{1F3A4}', desc: 'Control playback with your voice' },
                    { name: 'Spatial Audio', icon: '\u{1F50A}', desc: '3D audio visualization' },
                    { name: 'Community Themes', icon: '\u{1F3A8}', desc: 'Share and download themes' },
                    { name: 'Sing Mode', icon: '\u{1F3B5}', desc: 'Karaoke scoring system' },
                    { name: 'Beat Sync Engine', icon: '\u{26A1}', desc: 'AI-powered beat detection' },
                  ].map(lab => (
                    <div key={lab.name} className="lab-card">
                      <span className="lab-icon">{lab.icon}</span>
                      <strong>{lab.name}</strong>
                      <p>{lab.desc}</p>
                      <span className="coming-soon-badge">Coming Soon</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn-primary premium-cta" onClick={activatePro}>Activate Pro — Free Trial</button>
            <p className="premium-note">7 days free, cancel anytime</p>
          </div>
        </div>
      )}
    </div>
  )
}

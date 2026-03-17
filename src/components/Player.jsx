import { useState, useEffect, useRef, useCallback } from 'react'
import { getCurrentlyPlaying } from '../spotify'
import { parseLRC, getCurrentLineIndex } from '../lrc'

export default function Player({ onLogout }) {
  const [track, setTrack] = useState(null)
  const [lyrics, setLyrics] = useState([])
  const [currentLine, setCurrentLine] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progressMs, setProgressMs] = useState(0)
  const [status, setStatus] = useState('loading') // loading | playing | no-track | no-lyrics
  const lineRefs = useRef([])
  const currentTrackIdRef = useRef(null)

  const fetchLyrics = useCallback(async (trackName, artistName, albumName, durationMs) => {
    try {
      const params = new URLSearchParams({
        track_name: trackName,
        artist_name: artistName,
        album_name: albumName,
        duration: Math.round(durationMs / 1000),
      })
      const res = await fetch(`https://lrclib.net/api/get?${params}`)
      if (!res.ok) throw new Error('not found')
      const data = await res.json()
      if (data.syncedLyrics) {
        return { lines: parseLRC(data.syncedLyrics), synced: true }
      }
      if (data.plainLyrics) {
        const lines = data.plainLyrics
          .split('\n')
          .map((text, i) => ({ time: i * 4, text: text.trim() }))
          .filter(l => l.text)
        return { lines, synced: false }
      }
      throw new Error('no lyrics')
    } catch {
      return { lines: [], synced: false }
    }
  }, [])

  const fetchCurrentTrack = useCallback(async () => {
    try {
      const data = await getCurrentlyPlaying()
      if (!data || !data.item) {
        setStatus('no-track')
        setTrack(null)
        return
      }

      setIsPlaying(data.is_playing)
      setProgressMs(data.progress_ms)

      const newTrack = data.item
      if (newTrack.id !== currentTrackIdRef.current) {
        currentTrackIdRef.current = newTrack.id
        setTrack(newTrack)
        setCurrentLine(-1)
        lineRefs.current = []
        setStatus('loading')
        setLyrics([])

        const { lines } = await fetchLyrics(
          newTrack.name,
          newTrack.artists[0].name,
          newTrack.album.name,
          newTrack.duration_ms
        )
        setLyrics(lines)
        setStatus(lines.length ? 'playing' : 'no-lyrics')
      } else {
        setStatus(lyrics.length ? 'playing' : 'no-lyrics')
      }
    } catch (err) {
      console.error(err)
    }
  }, [fetchLyrics, lyrics.length])

  // Poll Spotify every 5s
  useEffect(() => {
    fetchCurrentTrack()
    const id = setInterval(fetchCurrentTrack, 5000)
    return () => clearInterval(id)
  }, [fetchCurrentTrack])

  // Smooth progress interpolation
  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => setProgressMs(p => p + 250), 250)
    return () => clearInterval(id)
  }, [isPlaying])

  // Update current lyric line
  useEffect(() => {
    if (!lyrics.length) return
    const idx = getCurrentLineIndex(lyrics, progressMs)
    if (idx !== currentLine) setCurrentLine(idx)
  }, [progressMs, lyrics, currentLine])

  // Auto-scroll to current line
  useEffect(() => {
    if (currentLine >= 0 && lineRefs.current[currentLine]) {
      lineRefs.current[currentLine].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentLine])

  const albumArt = track?.album?.images?.[0]?.url

  return (
    <div className="player">
      <div
        className="bg-blur"
        style={albumArt ? { backgroundImage: `url(${albumArt})` } : {}}
      />
      <div className="bg-overlay" />

      <header className="header">
        <div className="logo">LyricFlow</div>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </header>

      <div className="content">
        <div className="track-info">
          {albumArt ? (
            <img src={albumArt} alt="Album art" className="album-art" />
          ) : (
            <div className="album-art placeholder" />
          )}
          <div className="track-meta">
            <div className="track-name">{track?.name || '—'}</div>
            <div className="track-artist">
              {track?.artists?.map(a => a.name).join(', ') || 'Not playing'}
            </div>
            <div className={`bars ${isPlaying ? 'playing' : ''}`}>
              <span /><span /><span /><span />
            </div>
          </div>
        </div>

        <div className="lyrics-container">
          {status === 'loading' && (
            <div className="empty-state"><div className="spinner small" /></div>
          )}
          {status === 'no-track' && (
            <div className="empty-state">
              <p>Nothing playing</p>
              <p className="sub">Open Spotify and play a song</p>
            </div>
          )}
          {status === 'no-lyrics' && (
            <div className="empty-state">
              <p>No lyrics found</p>
              <p className="sub">{track?.name}</p>
            </div>
          )}
          {status === 'playing' && (
            <div className="lyrics">
              {lyrics.map((line, i) => (
                <div
                  key={i}
                  ref={el => { lineRefs.current[i] = el }}
                  className={`lyric-line${i === currentLine ? ' active' : ''}${i < currentLine ? ' past' : ''}`}
                >
                  {line.text || <span className="dot">·</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

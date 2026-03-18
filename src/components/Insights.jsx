import { useState, useEffect } from 'react'

const STORAGE_KEY = 'lf_insights'

export function getInsights() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { songs: 0, totalMs: 0, artists: {}, recentSongs: [] }
  } catch { return { songs: 0, totalMs: 0, artists: {}, recentSongs: [] } }
}

export function trackSongPlay(track, durationMs) {
  const data = getInsights()
  data.songs += 1
  data.totalMs += (durationMs || 0)
  const artistName = track?.artists?.[0]?.name || 'Unknown'
  data.artists[artistName] = (data.artists[artistName] || 0) + 1
  // Keep last 20 recent songs
  const songEntry = { name: track?.name, artist: artistName, time: Date.now() }
  data.recentSongs = [songEntry, ...(data.recentSongs || [])].slice(0, 20)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export default function Insights({ onClose, accentColor = 'rgb(250,60,80)' }) {
  const [data, setData] = useState(getInsights)

  useEffect(() => { setData(getInsights()) }, [])

  const topArtists = Object.entries(data.artists || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const maxPlays = topArtists.length > 0 ? topArtists[0][1] : 1
  const totalMinutes = Math.round((data.totalMs || 0) / 60000)
  const totalHours = (totalMinutes / 60).toFixed(1)

  return (
    <div className="insights-overlay" onClick={onClose}>
      <div className="insights-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div className="insights-header-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
        </div>
        <h2>Listening Insights</h2>
        <p className="insights-subtitle">Your music journey</p>

        <div className="insights-stats">
          <div className="insight-stat">
            <span className="stat-value">{data.songs || 0}</span>
            <span className="stat-label">Songs</span>
          </div>
          <div className="insight-stat">
            <span className="stat-value">{totalHours}h</span>
            <span className="stat-label">Listened</span>
          </div>
          <div className="insight-stat">
            <span className="stat-value">{Object.keys(data.artists || {}).length}</span>
            <span className="stat-label">Artists</span>
          </div>
        </div>

        {topArtists.length > 0 && (
          <div className="insights-chart-section">
            <h3>Top Artists</h3>
            <div className="insights-bars">
              {topArtists.map(([name, count]) => (
                <div key={name} className="insight-bar-row">
                  <span className="bar-artist">{name}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${(count / maxPlays) * 100}%`,
                        background: accentColor,
                      }}
                    />
                  </div>
                  <span className="bar-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(data.recentSongs || []).length > 0 && (
          <div className="insights-recent">
            <h3>Recent</h3>
            {data.recentSongs.slice(0, 5).map((s, i) => (
              <div key={i} className="recent-song">
                <span className="recent-name">{s.name}</span>
                <span className="recent-artist">{s.artist}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

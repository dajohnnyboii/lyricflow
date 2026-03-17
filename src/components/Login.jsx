import { useState } from 'react'
import { initiateLogin } from '../spotify'

export default function Login() {
  const [clientId, setClientId] = useState(
    localStorage.getItem('spotify_client_id') || import.meta.env.VITE_SPOTIFY_CLIENT_ID || ''
  )
  const [error, setError] = useState('')

  const handleLogin = () => {
    if (!clientId.trim()) {
      setError('Please enter your Spotify Client ID')
      return
    }
    setError('')
    initiateLogin(clientId.trim())
  }

  const hasEnvId = !!import.meta.env.VITE_SPOTIFY_CLIENT_ID

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg width="36" height="36" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="#1DB954"/>
            <path d="M10 14 Q18 10 26 12 M9 19 Q18 15 27 17 M11 24 Q18 20 25 22"
              stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          </svg>
          <span>LyricFlow</span>
        </div>

        <h1>Real-time lyrics<br />for your music</h1>
        <p className="tagline">Synced lyrics as you listen on Spotify</p>

        {!hasEnvId && (
          <div className="field-group">
            <label>Spotify Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="Paste your Client ID here"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              spellCheck={false}
            />
            {error && <p className="error">{error}</p>}
            <p className="hint">
              1. Go to <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a><br />
              2. Create an app &rarr; copy the Client ID<br />
              3. In app settings, add redirect URI: <code>{window.location.origin}</code>
            </p>
          </div>
        )}

        <button className="spotify-btn" onClick={handleLogin}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          Connect with Spotify
        </button>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import Homepage from './components/Homepage'
import Player from './components/Player'
import { exchangeCode, logout, isLoggedIn } from './spotify'
import './index.css'

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error) {
      window.history.replaceState({}, '', '/')
      setLoading(false)
      return
    }

    if (code) {
      window.history.replaceState({}, '', '/')
      exchangeCode(code).then(data => {
        if (data.access_token) setAuthed(true)
        setLoading(false)
      }).catch(() => setLoading(false))
      return
    }

    setAuthed(isLoggedIn())
    setLoading(false)
  }, [])

  // Handle Electron OAuth callback
  useEffect(() => {
    const handler = (e) => {
      const { code, error } = e.detail
      if (error) return
      if (code) {
        exchangeCode(code).then(data => {
          if (data.access_token) setAuthed(true)
        }).catch(() => {})
      }
    }
    window.addEventListener('oauth-callback', handler)
    return () => window.removeEventListener('oauth-callback', handler)
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <div className="logo-icon pulse">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M6 9Q12 6 18 8M5 13Q12 10 19 12M7 17Q12 14 17 16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      </div>
    )
  }

  return authed
    ? <Player onLogout={() => { logout(); setAuthed(false) }} />
    : <Homepage />
}

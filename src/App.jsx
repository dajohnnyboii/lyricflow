import { useState, useEffect } from 'react'
import Login from './components/Login'
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

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  return authed
    ? <Player onLogout={() => { logout(); setAuthed(false) }} />
    : <Login />
}

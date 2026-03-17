const REDIRECT_URI = window.location.origin
const SCOPES = ['user-read-currently-playing', 'user-read-playback-state']

function getClientId() {
  return import.meta.env.VITE_SPOTIFY_CLIENT_ID || localStorage.getItem('spotify_client_id') || ''
}

function generateCodeVerifier() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64urlEncode(array)
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64urlEncode(new Uint8Array(digest))
}

function base64urlEncode(array) {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export async function initiateLogin(clientId) {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  sessionStorage.setItem('code_verifier', verifier)
  if (clientId) localStorage.setItem('spotify_client_id', clientId)

  const params = new URLSearchParams({
    client_id: clientId || getClientId(),
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function exchangeCode(code) {
  const verifier = sessionStorage.getItem('code_verifier')
  const clientId = getClientId()

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })

  const data = await response.json()
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    localStorage.setItem('token_expiry', Date.now() + data.expires_in * 1000)
  }
  return data
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token')
  const clientId = getClientId()
  if (!refreshToken || !clientId) return null

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await response.json()
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('token_expiry', Date.now() + data.expires_in * 1000)
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
    return data.access_token
  }
  return null
}

export async function getAccessToken() {
  const expiry = parseInt(localStorage.getItem('token_expiry') || '0')
  if (Date.now() > expiry - 60000) {
    return refreshAccessToken()
  }
  return localStorage.getItem('access_token')
}

export async function getCurrentlyPlaying() {
  const token = await getAccessToken()
  if (!token) return null

  const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (response.status === 204 || response.status === 404) return null
  if (!response.ok) return null
  return response.json()
}

export function logout() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('token_expiry')
}

export function isLoggedIn() {
  const token = localStorage.getItem('access_token')
  const expiry = parseInt(localStorage.getItem('token_expiry') || '0')
  const refreshToken = localStorage.getItem('refresh_token')
  return !!(token && (Date.now() < expiry || refreshToken))
}

const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 780,
    minWidth: 360,
    minHeight: 600,
    frame: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#090909',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    mainWindow.loadURL('http://localhost:5199')
  }

  // Intercept Spotify auth — open in a separate auth window
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('https://accounts.spotify.com')) {
      event.preventDefault()
      openAuthWindow(url)
    }
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function openAuthWindow(authUrl) {
  const authWin = new BrowserWindow({
    width: 500,
    height: 700,
    parent: mainWindow,
    modal: true,
    show: true,
    backgroundColor: '#191414',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  authWin.loadURL(authUrl)

  // Watch for the redirect back to our Vercel URL with the auth code
  authWin.webContents.on('will-navigate', (event, redirectUrl) => {
    if (redirectUrl.startsWith('https://lyricflow-gamma.vercel.app')) {
      event.preventDefault()
      handleAuthRedirect(redirectUrl)
      authWin.close()
    }
  })

  authWin.webContents.on('will-redirect', (event, redirectUrl) => {
    if (redirectUrl.startsWith('https://lyricflow-gamma.vercel.app')) {
      event.preventDefault()
      handleAuthRedirect(redirectUrl)
      authWin.close()
    }
  })
}

function handleAuthRedirect(url) {
  try {
    const parsed = new URL(url)
    const code = parsed.searchParams.get('code')
    if (code) {
      mainWindow.webContents.executeJavaScript(
        `window.dispatchEvent(new CustomEvent('oauth-callback', { detail: { code: '${code}' } }))`
      )
    }
  } catch (e) {
    console.error('Failed to parse redirect URL:', e)
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

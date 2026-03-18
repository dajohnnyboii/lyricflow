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

  // Intercept Spotify auth — open in system browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('https://accounts.spotify.com')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Catch the redirect back from Vercel with the auth code
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('https://lyricflow-gamma.vercel.app')) {
      event.preventDefault()
      try {
        const parsed = new URL(url)
        const code = parsed.searchParams.get('code')
        const error = parsed.searchParams.get('error')
        if (code) {
          mainWindow.webContents.executeJavaScript(
            `window.dispatchEvent(new CustomEvent('oauth-callback', { detail: { code: '${code}' } }))`
          )
        }
      } catch (e) {
        console.error('Failed to parse redirect URL:', e)
      }
    }
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

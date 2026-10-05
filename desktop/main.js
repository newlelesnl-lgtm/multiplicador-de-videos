import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

let mainWindow
let localServer

async function createWindow() {
  process.env.MULTIPLICA_EMBEDDED = '1'
  process.env.MULTIPLICA_DATA_DIR = join(app.getPath('userData'), 'data')
  process.env.MULTIPLICA_WORK_DIR = join(app.getPath('temp'), 'multiplica', 'render-jobs')
  process.env.MULTIPLICA_OUTPUT_DIR = join(app.getPath('videos'), 'Multiplica')
  process.env.MULTIPLICA_FRONTEND_DIR = join(app.getAppPath(), 'dist')

  const { startServer } = await import('../server/index.js')
  localServer = await startServer(0)
  const address = localServer.address()
  const port = typeof address === 'object' && address ? address.port : 3001
  const applicationUrl = `http://127.0.0.1:${port}`

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f7f8fa',
    autoHideMenuBar: true,
    title: 'Multiplica',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(applicationUrl)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(applicationUrl)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
  await mainWindow.loadURL(applicationUrl)
}

app.whenReady().then(async () => {
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  localServer?.close()
})

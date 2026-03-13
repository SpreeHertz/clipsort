import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join,dirname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import { execFile } from 'child_process'
import ffmpeg from 'ffmpeg-static'
import os from 'os'

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 600,
    minHeight: 200,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false, // else videos don't load
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()

  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  if (result.filePaths) console.log(result.filePaths)
  return result.filePaths[0]
  
})

function getClipsRecursively(dir) {
  let results = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results = results.concat(getClipsRecursively(fullPath))
    } else if (entry.name.endsWith('.mp4')) {
      results.push(fullPath)
    }
  }
  
  return results
}

ipcMain.handle('get-clips', async (_, folderPath) => {
  return getClipsRecursively(folderPath)
  
})

ipcMain.handle('rename-clip', async (_, oldPath, newName) => {
  if (!newName || newName.trim() === '') return oldPath // do nothing
  const dir = dirname(oldPath)
  const newPath = join(dir, newName.trim() + '.mp4')
  fs.renameSync(oldPath, newPath)
  return newPath
})

ipcMain.handle('delete-clip', async (_, filePath) => {
  fs.unlinkSync(filePath)
})

ipcMain.handle('get-thumbnail', async (_, videoPath) => {
  const outPath = join(os.tmpdir(), `thumb_${Date.now()}.jpg`)
  
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, [
      '-i', videoPath,
      '-ss', '00:00:01',        // grab frame at 1 second
      '-vframes', '1',
      '-vf', 'scale=160:-1',    // 160px wide, height auto
      outPath
    ], (err) => {
      if (err) reject(err)
      else resolve(outPath)
    })
  })
})

const statePath = join(app.getPath('userData'), 'state.json')

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'))
  } catch {
    return {}
  }
}

ipcMain.handle('load-state', () => readState())

ipcMain.handle('save-state', (_, data) => {
  fs.writeFileSync(statePath, JSON.stringify(data))
})
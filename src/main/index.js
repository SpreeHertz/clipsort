import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname } from 'path'
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
      webSecurity: false
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

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// IPC

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled) return null
  return result.filePaths[0]
})

function getClipsRecursively(dir) {
  let results = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results = results.concat(getClipsRecursively(fullPath))
    } else if (entry.name.toLowerCase().endsWith('.mp4')) {
      results.push(fullPath)
    }
  }
  return results
}

ipcMain.handle('get-clips', async (_, folderPath) => {
  return getClipsRecursively(folderPath)
})

ipcMain.handle('rename-clip', async (_, oldPath, newName) => {
  if (!newName || newName.trim() === '') return { success: false, path: oldPath }

  const dir = dirname(oldPath)
  const ext = oldPath.endsWith('.MP4') ? '.MP4' : '.mp4'
  const newPath = join(dir, newName.trim() + ext)

  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(oldPath, newPath)
      return { success: true, path: newPath }
    } catch (err) {
      if (err.code === 'EBUSY' && i < 4) {
        await wait(300 * (i + 1))
      } else {
        return { success: false, path: oldPath, error: err.message }
      }
    }
  }
})

ipcMain.handle('delete-clip', async (_, filePath) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let i = 0; i < 5; i++) {
    try {
      await fs.promises.unlink(filePath)
      return { success: true }
    } catch (err) {
      if (err.code === 'EBUSY' && i < 4) {
        await wait(300 * (i + 1))
      } else {
        return { success: false, error: err.message }
      }
    }
  }
})

ipcMain.handle('get-thumbnail', async (_, videoPath) => {
  const outPath = join(os.tmpdir(), `thumb_${Date.now()}.jpg`)
  return new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      ['-i', videoPath, '-ss', '00:00:01', '-vframes', '1', '-vf', 'scale=160:-1', outPath],
      (err) => {
        if (err) reject(err)
        else resolve(outPath)
      }
    )
  })
})

// State (single source of truth, replaces localStorage)

const statePath = join(app.getPath('userData'), 'state.json')

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'))
  } catch {
    return {}
  }
}

ipcMain.handle('load-state', () => {
  const data = readState()
  console.log('load-state returning', data)
  return data
})

ipcMain.handle('save-state', (_, data) => {
  console.log('save-state received', data)
  fs.writeFileSync(statePath, JSON.stringify(data))
})
console.log('statePath:', statePath)
ipcMain.handle('get-scrub-thumbnails', async (_, videoPath, duration) => {
  const count = 10
  const paths = []

  for (let i = 0; i <= count; i++) {
    const time = (i / count) * duration // percentage-based, not fixed interval
    const outPath = join(os.tmpdir(), `scrub_${Date.now()}_${i}.jpg`)
    await new Promise((resolve) => {
      execFile(
        ffmpeg,
        ['-ss', String(time), '-i', videoPath, '-vframes', '1', '-vf', 'scale=160:-1', outPath],
        () => resolve()
      )
    })
    paths.push({ time, path: outPath })
  }

  return paths
})

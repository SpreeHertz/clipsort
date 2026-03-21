import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import { spawn } from 'child_process'
import os from 'os'
import path from 'path';

const getFFmpegPath = () => {
  const ffmpegStaticPath = require('ffmpeg-static')
  
  if (!app.isPackaged) {
    return ffmpegStaticPath
  }

  // in production, swap 'app.asar' for 'app.asar.unpacked'
  return ffmpegStaticPath.replace('app.asar', 'app.asar.unpacked')
}

const ffmpegPath = getFFmpegPath()

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
       /* 
      * webSecurity is disabled on purpose. I couldn't implement a custom protocol without bugs creeping in.
      * As this app does not access the internet for any functionality, we can say it is safe to keep it false.
      */
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
    // mainWindow.webContents.openDevTools() uncomment when things break in prod
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

function getClipsRecursively(dir, checkForFriends = false, friendsList = []) {
  let results = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      // fixed: pass the arguments through to the recursive call
      results = results.concat(getClipsRecursively(fullPath, checkForFriends, friendsList))
    } else if (entry.name.toLowerCase().endsWith('.mp4')) {
      const fileName = entry.name.toLowerCase()

      if (checkForFriends && friendsList.length > 0) {
        // filter: check if file contains every name in the array
        const matchesAll = friendsList.every(name => fileName.includes(name.toLowerCase()))
        if (matchesAll) results.push(fullPath)
      } else {
        // no filter: include all clips
        results.push(fullPath)
      }
    }
  }
  return results
}

let activeQueueThumbProcess = null;
let activeScrubThumbProcess = null;

// Helper to kill processes safely
const killProcess = (proc) => {
  if (proc) {
    proc.kill('SIGKILL');
  }
};

ipcMain.handle('get-clips', async (_, folderPath, checkForFriends = false, friendsList = []) => {
  const list = Array.isArray(friendsList) ? friendsList : []
  return getClipsRecursively(folderPath, checkForFriends, list)
})

ipcMain.handle('rename-clip', async (_, oldPath, newName) => {
  if (!newName?.trim()) return { success: false, path: oldPath };

  const dir = dirname(path.resolve(oldPath));
  const ext = oldPath.toLowerCase().endsWith('.mp4')
  const newPath = join(dir, newName.trim() + ext);

  for (let i = 0; i < 5; i++) {
    try {
      await fs.promises.rename(path.resolve(oldPath), path.resolve(newPath));
      return { success: true, path: newPath };
    } catch (err) {
      console.error(err)
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
      } else {
        return { success: false, path: oldPath, error: err.message };
      }
    }
  }
  return { success: false, path: oldPath, error: 'File is locked by another process.' };
});

ipcMain.handle('delete-clip', async (_, filePath) => {
  for (let i = 0; i < 5; i++) {
    try {
      await shell.trashItem(path.resolve(filePath))
      // verify deletion because trashItem is unreliable with locks
      await fs.access(filePath) 
      // if access succeeds, file still exists
      await new Promise(r => setTimeout(r, 500 * (i + 1)))
    } catch (err) {
      console.log(err)
      // if access fails, file is gone
      return { success: true }
    }
  }
  return { success: false, error: 'file locked by system' }
})

ipcMain.handle('get-thumbnail', async (_, videoPath) => {

  const outPath = join(os.tmpdir(), `thumb_${Date.now()}.jpg`);
  
  return new Promise((resolve, reject) => {
    activeQueueThumbProcess = spawn(ffmpegPath, [
      '-ss', '00:00:01', 
      '-i', videoPath, 
      '-vframes', '1', 
      '-vf', 'scale=160:-1', 
      outPath
    ]);

    activeQueueThumbProcess.on('close', (code) => {
      activeQueueThumbProcess = null;
      if (code === 0) resolve(outPath);
      else reject(new Error('ffmpeg failed'));
    });

    activeQueueThumbProcess.on('error', (err) => {
      activeQueueThumbProcess = null;
      reject(err);
    });
  });
});
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

ipcMain.handle('save-state', async (_, data) => {
  try {
    await fs.promises.writeFile(statePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('failed to save state:', err);
  }
});

// console.log('statePath:', statePath)
let currentFfmpegProcess = null;

ipcMain.handle('kill-ffmpeg', () => {
  if (currentFfmpegProcess) {
    currentFfmpegProcess.kill('SIGKILL');
    currentFfmpegProcess = null;
    return true;
  }
  return false;
});

ipcMain.handle('get-scrub-thumbnails', async (_, videoPath, duration) => {
  killProcess(activeScrubThumbProcess);

  const count = 10;
  const paths = [];
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const interval = duration / count;
  const outPattern = join(tempDir, `scrub_${timestamp}_%03d.jpg`);

  return new Promise((resolve) => {
    activeScrubThumbProcess = spawn(ffmpegPath, [
      '-i', videoPath,
      '-vf', `fps=1/${interval},scale=160:-1`, 
      outPattern
    ]);

    activeScrubThumbProcess.on('close', (code) => {
      activeScrubThumbProcess = null;
      if (code !== 0) return resolve([]);

      for (let i = 1; i <= count + 1; i++) {
        const fileName = `scrub_${timestamp}_${String(i).padStart(3, '0')}.jpg`;
        const fullPath = join(tempDir, fileName);
        if (fs.existsSync(fullPath)) {
          paths.push({ 
            time: (i - 1) * interval, 
            path: fullPath 
          });
        }
      }
      resolve(paths);
    });
  });
});
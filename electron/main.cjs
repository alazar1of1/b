const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow = null;
const PORT = process.env.PORT || 3000;

// Set default environment variables for offline/embedded execution
process.env.NODE_ENV = 'production';
process.env.PORT = String(PORT);

// Ensure MongoDB URI default is set
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI =
    'mongodb+srv://alazar1of1_db_user:QphPyV5OV81xOp72@cluster0.iuxqn6k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
}

// Single instance lock to prevent duplicate servers
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Start embedded Express + SQLite + MongoDB Atlas backend
function startEmbeddedServer() {
  try {
    process.env.APP_DATA_DIR = app.getPath('userData');
  } catch {}

  const candidates = [
    path.join(__dirname, '..', 'dist', 'server.cjs'),
    path.join(__dirname, 'server.cjs'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist', 'server.cjs'),
    path.join(process.resourcesPath || '', 'dist', 'server.cjs'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        console.log('[Electron] Starting embedded server from:', candidate);
        require(candidate);
        return true;
      } catch (err) {
        console.error('[Electron] Error executing server bundle:', err);
      }
    }
  }

  console.warn('[Electron] dist/server.cjs not found; operating in client-only mode');
  return false;
}

// Check if local server is listening
function waitForServer(port, maxAttempts, intervalMs, callback) {
  let attempts = 0;

  function probe() {
    attempts++;
    const req = http.get(`http://127.0.0.1:${port}/api/db/status`, (res) => {
      res.resume();
      if (res.statusCode >= 200 && res.statusCode < 400) {
        callback(true);
      } else if (attempts < maxAttempts) {
        setTimeout(probe, intervalMs);
      } else {
        callback(false);
      }
    });

    req.on('error', () => {
      if (attempts < maxAttempts) {
        setTimeout(probe, intervalMs);
      } else {
        callback(false);
      }
    });

    req.setTimeout(800, () => {
      req.destroy();
      if (attempts < maxAttempts) {
        setTimeout(probe, intervalMs);
      } else {
        callback(false);
      }
    });
  }

  probe();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Ela Bingo Desktop',
    backgroundColor: '#020617',
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external link clicks
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const localUrl = `http://127.0.0.1:${PORT}`;

  waitForServer(PORT, 25, 200, (ready) => {
    if (ready) {
      console.log('[Electron] Server ready, loading:', localUrl);
      mainWindow.loadURL(localUrl);
    } else {
      console.warn('[Electron] Server probe timed out. Loading local dist/index.html fallback');
      const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
      if (fs.existsSync(distIndex)) {
        mainWindow.loadFile(distIndex);
      } else {
        mainWindow.loadURL(localUrl);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startEmbeddedServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

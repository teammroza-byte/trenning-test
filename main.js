// Blitz Trening – zwykłe okno aplikacji (bez nakładki, nie działa w tle)
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 820,
    minHeight: 520,
    title: 'Blitz Trening',
    autoHideMenuBar: true,
    backgroundColor: '#f4f5f2',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Upuszczony plik nie może przełączyć okna na inną stronę
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

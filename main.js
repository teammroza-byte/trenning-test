// Blitz Trening – zwykłe okno aplikacji (bez nakładki, nie działa w tle)
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 820,
    minHeight: 520,
    title: 'Blitz Trening',
    autoHideMenuBar: true,
    backgroundColor: '#f4f5f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Upuszczony plik nie może przełączyć okna na inną stronę
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Zapis pliku Excela – zawsze z końcówką .xlsx
ipcMain.handle('save-xlsx', async (_e, { name, data }) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Zapisz tabelę do Excela',
    defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: 'Arkusz Excela', extensions: ['xlsx'] }]
  });
  if (res.canceled || !res.filePath) return null;
  let file = res.filePath;
  if (!/\.xlsx$/i.test(file)) file = file.replace(/\.[^.\\/]*$/, '') + '.xlsx';
  await fs.writeFile(file, Buffer.from(data));
  return file;
});

ipcMain.on('show-file', (_e, file) => shell.showItemInFolder(file));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

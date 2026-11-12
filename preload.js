// Bezpieczny most między oknem a systemem plików
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  saveXlsx: (name, data) => ipcRenderer.invoke('save-xlsx', { name, data }),
  showFile: (file) => ipcRenderer.send('show-file', file)
});

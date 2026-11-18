const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panda', {
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (cb) => ipcRenderer.on('panda-state', (_e, data) => cb(data)),
  contextMenu: () => ipcRenderer.send('context-menu'),
  onCursor: (cb) => ipcRenderer.on('panda-cursor', (_e, data) => cb(data)),
  focusTeam: (team) => ipcRenderer.send('focus-team', team),
  focusSession: (id) => ipcRenderer.send('focus-session', id),
  ignoreTeam: (team) => ipcRenderer.send('ignore-team', team),
  ignoreSession: (id) => ipcRenderer.send('ignore-session', id),
  resize: (height) => ipcRenderer.send('resize', height),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  dragEnd: () => ipcRenderer.send('drag-end'),
});

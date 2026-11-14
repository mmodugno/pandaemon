const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panda', {
  getTeams: () => ipcRenderer.invoke('get-teams'),
  onEvent: (cb) => ipcRenderer.on('panda-event', (_e, data) => cb(data)),
  focusTeam: (team) => ipcRenderer.send('focus-team', team),
  focusUrgent: () => ipcRenderer.send('focus-urgent'),
});

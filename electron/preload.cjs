const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mednoteDesktop", {
  isDesktop: true,
  authorizeDrive: (clientId) => ipcRenderer.invoke("drive:authorize", clientId),
  revokeDrive: (token) => ipcRenderer.invoke("drive:revoke", token),
});

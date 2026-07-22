const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mednoteDesktop", {
  isDesktop: true,
  authorizeDrive: (clientId, clientSecret) => ipcRenderer.invoke("drive:authorize", { clientId, clientSecret }),
  revokeDrive: (token) => ipcRenderer.invoke("drive:revoke", token),
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mednoteDesktop", {
  isDesktop: true,
  authorizeDrive: (clientId, clientSecret) => ipcRenderer.invoke("drive:authorize", { clientId, clientSecret }),
  revokeDrive: (token) => ipcRenderer.invoke("drive:revoke", token),
  onFlushRequested: (callback) => {
    const listener = (_event, requestId) => callback(requestId);
    ipcRenderer.on("app:flush-before-close", listener);
    return () => ipcRenderer.removeListener("app:flush-before-close", listener);
  },
  completeFlush: (requestId, success, error) => ipcRenderer.send("app:flush-result", { requestId, success, error }),
});

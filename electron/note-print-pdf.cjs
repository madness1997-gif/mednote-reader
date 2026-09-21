function installNotePrintPdf({ BrowserWindow, ipcMain, getWindow }) {
  let busy = false;
  ipcMain.handle("note:print-pdf", async (event, html) => {
    if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error("Invalid sender");
    if (busy || typeof html !== "string" || html.length > 100_000_000) throw new Error("Invalid PDF request");
    busy = true;
    const printWindow = new BrowserWindow({ show: false, webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      partition: "mednote-print", backgroundThrottling: false,
    } });
    const timer = setTimeout(() => { if (!printWindow.isDestroyed()) printWindow.destroy(); }, 60_000);
    try {
      // Dedicated print session never fetches remote resources or runs note scripts.
      printWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: !details.url.startsWith("data:") && details.url !== "about:blank" });
      });
      printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      printWindow.webContents.on("will-navigate", event => event.preventDefault());
      const csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:\">";
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(csp + html)}`);
      await printWindow.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map(image => image.decode()));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
      return await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    } finally {
      clearTimeout(timer);
      if (!printWindow.isDestroyed()) printWindow.destroy();
      busy = false;
    }
  });
}
module.exports = { installNotePrintPdf };

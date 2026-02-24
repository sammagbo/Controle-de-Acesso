const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
      const win = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                  nodeIntegration: true,
                  contextIsolation: false,
            },
            autoHideMenuBar: true,
            title: "MAGBO Access Control"
      });

      win.loadFile(path.join(__dirname, 'Documentos', 'magbo-access-control', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

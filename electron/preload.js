const { contextBridge } = require('electron');

// Expose safe desktop platform metadata to renderer
contextBridge.exposeInMainWorld('desktopHost', {
  isDesktopApp: true,
  platform: process.platform,
  version: '2.1.0'
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pinItOnboarding", {
  copySample: () => ipcRenderer.invoke("native:onboarding-copy-sample")
});

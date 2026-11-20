"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sticky", {
  refresh: () => ipcRenderer.invoke("sessions:refresh"),
  dismiss: (key) => ipcRenderer.invoke("sessions:dismiss", key),
  addWeb: (input) => ipcRenderer.invoke("sessions:addWeb", input),
  activate: (key) => ipcRenderer.invoke("sessions:activate", key),
  collapse: (collapsed) => ipcRenderer.invoke("window:collapse", collapsed),
  hide: () => ipcRenderer.invoke("window:hide"),
  windowState: () => ipcRenderer.invoke("window:state"),
  onUpdate: (fn) => {
    const listener = (_e, payload) => fn(payload);
    ipcRenderer.on("sessions:update", listener);
    return () => ipcRenderer.removeListener("sessions:update", listener);
  },
});

// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example' | 'menu:action';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
};

const api = {
  file: {
    open: async () => ipcRenderer.invoke('file:open'),
    openPath: async (filePath: string) => ipcRenderer.invoke('file:openPath', filePath),
    save: async (filePath: string, content: string, meta?: { fontFamily?: string; fontSize?: number; fontColor?: string }) => ipcRenderer.invoke('file:save', { filePath, content, meta }),
    saveAs: async (content: string, meta?: { fontFamily?: string; fontSize?: number; fontColor?: string }) => ipcRenderer.invoke('file:saveAs', { content, meta }),
  },
  recent: {
    get: async () => ipcRenderer.invoke('recent:get'),
    push: async (filePath: string) => ipcRenderer.invoke('recent:push', filePath),
    clear: async () => ipcRenderer.invoke('recent:clear'),
  },
  recovery: {
    write: async (docId: string, data: { content: string; meta?: unknown }) => ipcRenderer.invoke('recovery:write', { docId, data }),
    readAll: async () => ipcRenderer.invoke('recovery:readAll'),
    clear: async (docId: string) => ipcRenderer.invoke('recovery:clear', docId),
  },
  onMenuAction: (handler: (action: string, payload?: unknown) => void) => {
    const subscription = (_event: IpcRendererEvent, action: unknown, payload?: unknown) => {
      handler(String(action), payload);
    };
    ipcRenderer.on('menu:action', subscription);
    return () => ipcRenderer.removeListener('menu:action', subscription);
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);
contextBridge.exposeInMainWorld('api', api);

export type ElectronHandler = typeof electronHandler;
export type AppApi = typeof api;

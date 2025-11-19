/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import fs from 'fs';
import os from 'os';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

// Simple JSON storage in userData for recents and recovery
function getUserDataPath() {
  return app.getPath('userData');
}

function readJson(file: string, fallback: any) {
  try {
    const data = fs.readFileSync(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: any) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

const recentFile = () => path.join(getUserDataPath(), 'recent.json');
const recoveryDir = () => path.join(getUserDataPath(), 'recovery');

type RtfMeta = {
  fontFamily?: string;
  fontSize?: number; // px
  fontColor?: string; // #rrggbb
};

function toRtf(plain: string, meta: RtfMeta = {}): string {
  const { fontFamily = 'Courier New', fontSize = 14, fontColor = '#000000' } = meta;
  const sizeHalfPoints = Math.round((fontSize * 72) / 96) * 2; // px -> pt -> half-points
  const hex = fontColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const escapeText = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\r?\n/g, '\\par\n');

  const header = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 ${fontFamily};}}{\\colortbl;\\red${r}\\green${g}\\blue${b};}\n`;
  const body = `\\f0\\fs${sizeHalfPoints}\\cf1 ${escapeText(plain)}\n`;
  return `${header}${body}}`;
}

function rtfToText(rtf: string): string {
  // Extract color table
  const colorTableMatch = rtf.match(/\{\\colortbl;([^}]*)\}/);
  const colors: string[] = ['#000000'];
  if (colorTableMatch) {
    const body = colorTableMatch[1];
    const entries = body.split(';').filter((e) => e.trim().length > 0);
    entries.forEach((entry) => {
      const r = /\\red(\d+)/.exec(entry);
      const g = /\\green(\d+)/.exec(entry);
      const b = /\\blue(\d+)/.exec(entry);
      const rr = Math.min(255, Number(r?.[1] || 0));
      const gg = Math.min(255, Number(g?.[1] || 0));
      const bb = Math.min(255, Number(b?.[1] || 0));
      const hex = `#${rr.toString(16).padStart(2, '0')}${gg
        .toString(16)
        .padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
      colors.push(hex);
    });
  }

  // Decode hex escapes
  let src = rtf.replace(/\\'([0-9a-fA-F]{2})/g, (_m, h) =>
    String.fromCharCode(parseInt(h, 16)),
  );

  // Normalize newlines
  src = src.replace(/\r\n/g, '\n');

  let out = '';
  const stack: string[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let strike = false;
  let curColor: string | null = null;
  let curSizePx: number | null = null;

  const pushMarker = (marker: string) => {
    out += marker;
    stack.push(marker);
  };
  const popMarker = (openMarker: string, closeMarker: string) => {
    // pop until we find matching open, closing accordingly
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const m = stack[i];
      if (m === openMarker) {
        // close all opened after this in reverse temporarily
        const tail = stack.splice(i);
        // remove the target open
        tail.pop();
        out += closeMarker;
        // re-open tail in order
        tail.forEach((t) => {
          out += t;
          stack.push(t);
        });
        return;
      }
    }
  };

  const closeAll = () => {
    // close in reverse
    while (stack.length > 0) {
      const m = stack.pop()!;
      if (m === '**') out += '**';
      else if (m === '*') out += '*';
      else if (m === '__') out += '__';
      else if (m === '~~') out += '~~';
      else if (m.startsWith('[color=')) out += '[/color]';
      else if (m.startsWith('[size=')) out += '[/size]';
    }
    bold = italic = underline = strike = false;
    curColor = null;
    curSizePx = null;
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') {
      // start group – no-op
      continue;
    }
    if (ch === '}') {
      // end group – best effort: close all markers for safety
      // (real RTF scoping is more subtle)
      closeAll();
      continue;
    }
    if (ch === '\\') {
      // control word or escaped char
      const next = src[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        out += next;
        i += 1;
        continue;
      }
      const m = src.slice(i).match(/^\\([a-zA-Z]+)(-?\d+)?\s?/);
      if (m) {
        const word = m[1].toLowerCase();
        const num = m[2] ? Number(m[2]) : undefined;
        i += m[0].length - 1;
        switch (word) {
          case 'par':
            out += '\n';
            break;
          case 'tab':
            out += '\t';
            break;
          case 'b':
            if (num === 0 && bold) {
              popMarker('**', '**');
              bold = false;
            } else if (num !== 0 && !bold) {
              pushMarker('**');
              bold = true;
            }
            break;
          case 'i':
            if (num === 0 && italic) {
              popMarker('*', '*');
              italic = false;
            } else if (num !== 0 && !italic) {
              pushMarker('*');
              italic = true;
            }
            break;
          case 'ul':
            if (num === 0 && underline) {
              popMarker('__', '__');
              underline = false;
            } else if (num !== 0 && !underline) {
              pushMarker('__');
              underline = true;
            }
            break;
          case 'ulnone':
            if (underline) {
              popMarker('__', '__');
              underline = false;
            }
            break;
          case 'strike':
            if (num === 0 && strike) {
              popMarker('~~', '~~');
              strike = false;
            } else if (num !== 0 && !strike) {
              pushMarker('~~');
              strike = true;
            }
            break;
          case 'fs': {
            // half-points
            const px = Math.max(8, Math.round(((num || 0) / 2) * (96 / 72)));
            if (px !== curSizePx) {
              if (curSizePx != null) popMarker(`[size=${curSizePx}]`, '[/size]');
              curSizePx = px;
              pushMarker(`[size=${px}]`);
            }
            break;
          }
          case 'cf': {
            const idx = Math.max(0, Math.min(colors.length - 1, num || 0));
            const hex = colors[idx] || '#000000';
            if (hex !== curColor) {
              if (curColor) popMarker(`[color=${curColor}]`, '[/color]');
              curColor = hex;
              pushMarker(`[color=${hex}]`);
            }
            break;
          }
          default:
            // ignore other control words
            break;
        }
        continue;
      }
      // unrecognized control: skip
      continue;
    }
    // regular character
    out += ch;
  }
  closeAll();
  // remove any leftover RTF braces and destinations
  out = out.replace(/\{\\\*[^}]*\}/g, '');
  return out;
}

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Text', extensions: ['txt'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Rich Text', extensions: ['rtf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const filePath = result.filePaths[0];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const content = ext === '.rtf' ? rtfToText(raw) : raw;
  return { canceled: false, filePath, content };
});

ipcMain.handle('file:openPath', async (_e, filePath: string) => {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const content = ext === '.rtf' ? rtfToText(raw) : raw;
  return { filePath, content };
});

ipcMain.handle(
  'file:save',
  async (
    _e,
    { filePath, content, meta }: { filePath: string; content: string; meta?: RtfMeta },
  ) => {
    const ext = path.extname(filePath).toLowerCase();
    const data = ext === '.rtf' ? toRtf(content, meta) : content;
    fs.writeFileSync(filePath, data, 'utf-8');
    return { filePath };
  },
);

ipcMain.handle('file:saveAs', async (_e, { content, meta }: { content: string; meta?: RtfMeta }) => {
  const result = await dialog.showSaveDialog({
    filters: [
      { name: 'Text', extensions: ['txt'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Rich Text', extensions: ['rtf'] },
    ],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const ext = path.extname(result.filePath).toLowerCase();
  const data = ext === '.rtf' ? toRtf(content, meta) : content;
  fs.writeFileSync(result.filePath, data, 'utf-8');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('recent:get', async () => {
  return readJson(recentFile(), []);
});

ipcMain.handle('recent:push', async (_e, filePath: string) => {
  const items: string[] = readJson(recentFile(), []);
  const next = [filePath, ...items.filter((p) => p !== filePath)].slice(0, 10);
  writeJson(recentFile(), next);
  return next;
});

ipcMain.handle('recent:clear', async () => {
  writeJson(recentFile(), []);
  return [];
});

ipcMain.handle('recovery:write', async (_e, { docId, data }: { docId: string; data: any }) => {
  fs.mkdirSync(recoveryDir(), { recursive: true });
  fs.writeFileSync(path.join(recoveryDir(), `${docId}.json`), JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('recovery:readAll', async () => {
  try {
    const files = fs.readdirSync(recoveryDir());
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const raw = fs.readFileSync(path.join(recoveryDir(), f), 'utf-8');
        return { docId: path.basename(f, '.json'), ...JSON.parse(raw) };
      });
  } catch {
    return [];
  }
});

ipcMain.handle('recovery:clear', async (_e, docId: string) => {
  try {
    fs.unlinkSync(path.join(recoveryDir(), `${docId}.json`));
  } catch {}
  return true;
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

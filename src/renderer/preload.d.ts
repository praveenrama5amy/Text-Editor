import { ElectronHandler, AppApi } from '../main/preload';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronHandler;
    api: AppApi;
  }
}

export {};

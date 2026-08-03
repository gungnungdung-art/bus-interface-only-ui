const { contextBridge, ipcRenderer } = require('electron');

/**
 * 렌더러에 노출하는 API.
 *
 * 장비 텔레메트리는 렌더러가 직접 만든다 (src/lib/telemetry.ts). 여기서는
 * 렌더러가 할 수 없는 OS 수준 작업만 열어 준다 — 포트/소켓/외부 프로세스 없음.
 */
contextBridge.exposeInMainWorld('ibms', {
  platform: process.platform,
  arch: process.arch,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },

  system: {
    /** 네트워크 진단 정보 (LTE 화면용, ipconfig /all 수준) */
    netinfo: () => ipcRenderer.invoke('ibms:netinfo'),
    /** 앱 재시작 */
    reboot: () => ipcRenderer.invoke('ibms:reboot'),
  },
});

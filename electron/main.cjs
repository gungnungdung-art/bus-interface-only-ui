const { app, BrowserWindow, ipcMain } = require('electron');
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    // 14인치 운전자 디스플레이용: 배포 시 전체화면 키오스크로 동작
    fullscreen: !DEV_SERVER_URL,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.removeMenu();

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

// ---------------- 렌더러 IPC (preload 의 window.ibms 전용) ----------------
// 렌더러가 직접 할 수 없는 OS 수준 작업만 여기서 처리한다.

// LTE/네트워크 진단: os.networkInterfaces + OS 네이티브 도구 원문(ipconfig /all 수준)
ipcMain.handle('ibms:netinfo', async () => {
  const interfaces = os.networkInterfaces();
  const raw = await new Promise((resolve) => {
    const run = (cmd, args) => execFile(cmd, args,
      { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err && !stdout ? `(${cmd} 실행 실패: ${err.message})` : String(stdout)));
    if (process.platform === 'win32') run('ipconfig', ['/all']);
    else run('sh', ['-c', 'ip addr; echo; ip route; echo; cat /etc/resolv.conf 2>/dev/null']);
  });
  return { interfaces, raw, hostname: os.hostname(), platform: process.platform };
});

// 재부팅: 앱 재시작 (OS 재부팅은 키오스크 배포 시 systemd/서비스 계층에서 처리)
ipcMain.handle('ibms:reboot', () => {
  app.relaunch();
  app.quit();
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

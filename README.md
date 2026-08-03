# IBMS 14inch Driver Interface

버스 운전자용 14인치 단말 UI 입니다 (React + Vite + Electron, 키오스크).

외부 프로세스·포트·소켓에 의존하지 않는 **단일 앱**입니다. 화면에 흐르는
장비 데이터(GPS·CAN·NFC·IMU 등)는 앱이 직접 생성하므로, 설치 직후 아무 준비
없이 모든 화면이 살아 있는 값으로 동작합니다.

```
┌──────────────────────────────────────────────────┐
│ Electron App                                     │
│  ┌───────────────┐        ┌───────────────────┐  │
│  │ 14" Driver UI │◄──IPC─►│ Main Process      │  │
│  │  (Renderer)   │        │ netinfo / reboot  │  │
│  │               │        └───────────────────┘  │
│  │  telemetry.ts ← GPS/NFC/CAN/IMU/OBD/LED/음성  │
│  └───────────────┘                               │
└──────────────────────────────────────────────────┘
```

메인 프로세스가 맡는 일은 창 생성과 **렌더러가 할 수 없는 OS 작업 두 가지**
(`ipconfig /all` 수준의 네트워크 조회, 앱 재시작)뿐입니다.

---

## 시작하기

```bash
npm install
npm run dev        # Vite + Electron
npm run dev:web    # 브라우저만 (Electron 없이 UI 확인)
```

## 크로스플랫폼 권장 설정 (Windows / macOS / Linux)

다른 컴퓨터에서도 같은 방식으로 실행하려면 Node 버전을 먼저 고정하세요.
이 저장소에는 `.nvmrc`, `.node-version` 파일이 포함되어 있어 `20` 버전을 사용합니다.

### 1) Node 버전 맞추기

- macOS / Linux (nvm):

```bash
nvm install
nvm use
```

- Windows (nvm-windows):

```powershell
nvm install 20
nvm use 20
```

### 2) 의존성 설치와 실행

```bash
npm ci
npm run dev
```

### 3) Windows PowerShell에서 npm 인식 오류가 날 때

PowerShell 정책 때문에 `npm.ps1`이 막히는 경우가 있습니다. 아래를 1회 실행하세요.

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

그리고 터미널을 다시 열어 `npm -v`를 확인한 뒤 실행하면 됩니다.

`npm run dev:web` 으로 열면 LTE 진단 화면의 네트워크 원문만 비고, 나머지
화면은 Electron 과 동일하게 동작합니다.

---

## 텔레메트리

[`src/lib/telemetry.ts`](src/lib/telemetry.ts) 하나가 모든 장비 데이터를
만들고, [`useTelemetry`](src/lib/useTelemetry.ts) 훅이 화면에 전달합니다.

| 장비 | 주기 | 내용 |
|------|------|------|
| `gps` | 1s | 서울 시내를 도는 경로의 NMEA 문장 (RMC/GGA) |
| `can` | 0.4s | J1939 프레임 (EEC1 / CCVS / VH / FE) |
| `nfc` | 7s | 승객 카드 태그 UID |
| `imu` | 1.5s | 3축 가속도·자이로 |
| `led` | 명령 시 | 전광판 출력 미러 (`led.text` / `led.clear`) |
| `obd` | 명령 시 | DTC 진단 코드 (`obd.dtc`) |
| `audio` | 명령 시 | 안내방송 — 브라우저 음성 합성으로 **실제 재생** |

이벤트 모양은 `DeviceEvent { source, kind, seconds, time, data }` 하나로
통일돼 있습니다. 실제 하드웨어를 붙일 때는 `telemetry.ts` 의 생성 루프만
실물 입력으로 바꾸면 되고, 화면 코드는 손대지 않습니다.

장비 상태는 3색으로 표시합니다:
`정상`=LIVE / `하드웨어 없음`=OFFLINE / `사용안함`=DISABLED.

상단바의 **시뮬레이션 데이터** 배지는 화면 값이 실제 계측이 아님을 알립니다
(`App.tsx` 에서 지울 수 있습니다).

---

## 개발 명령

```bash
npm run dev        # Vite + Electron
npm run dev:web    # 브라우저 단독
npm run typecheck
```

## 빌드 / 배포

```bash
npm run start            # 로컬에서 프로덕션(kiosk) 빌드 실행 확인
npm run dist:win-x64     # Windows x64 (NSIS 설치본 + zip)
npm run dist:win-arm64   # Windows ARM64
npm run dist:all         # Windows x64 + ARM64
npm run dist:linux-x64   # Linux x64 (AppImage)
```

동봉물은 `dist/`(번들) + `electron/` + `package.json` 뿐이라 설치본이 그대로
실행됩니다. 대상 기기에서 따로 준비할 런타임이 없습니다.

---

## 구조

```
electron--app/
├─ electron/
│  ├─ main.cjs         창 생성 + netinfo/reboot IPC
│  └─ preload.cjs      window.ibms — 시스템 API
├─ src/
│  ├─ app/
│  │  ├─ App.tsx           루트: 메인 화면 3분할 + 하단 4버튼 + 운행 상태
│  │  ├─ theme.ts  i18n.ts  devices.ts  ui.tsx
│  │  └─ screens/          diagnostics(장비 진단) / settings / route / drive
│  ├─ lib/
│  │  ├─ telemetry.ts      ★ 장비 데이터 생성 + 타입 + 명령
│  │  ├─ useTelemetry.ts   React 훅 (모듈 싱글턴)
│  │  ├─ nmea.ts           GPS NMEA 파서
│  │  └─ useGpsState.ts  geocode.ts
│  └─ styles/
└─ electron-builder.yml
```

## 화면 메모

- 메인 화면 좌측 장비 패널 → 각 장비 진단 화면으로 이동합니다.
- 운행 상태는 `App.tsx` 루트가 들고 있어 화면을 옮겨도 유지되며, **운행 종료
  버튼 + 확인 팝업**으로만 끝납니다.
- LTE·IP 카메라는 텔레메트리 밖에서 상태를 판단합니다 — LTE 는 메인 프로세스의
  네트워크 조회, 카메라는 스트림 URL 설정 여부.
- 배차 간격·정류장 목록은 서버 연동 전 예시 값입니다
  (`App.tsx` 의 `STOPS`, `useEtaInfo`).

## 참고

- `npm install` 후 Electron 바이너리가 없으면: `node node_modules/electron/install.js`
- `fonts.css` 가 Google Fonts 를 네트워크에서 불러옵니다. 오프라인 차량 배포 시
  폰트를 로컬에 넣고 `@font-face` 로 교체하세요.
- `src/lib/geocode.ts` 가 OSM Nominatim 공개 API 를, 운행 화면이 OSM 타일을
  씁니다. 차량 배포 시에는 이용약관·오프라인 문제로 상용 API 나 로컬
  지오코딩/타일로 교체가 필요합니다.

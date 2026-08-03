/**
 * src/lib/telemetry.ts
 * ====================
 * 차량 장비 텔레메트리 — 앱이 스스로 만들어 내보내는 데이터 소스.
 *
 * 화면(메인·운행·진단)은 여기서 나오는 이벤트만 소비한다. 외부 프로세스나
 * 포트·소켓에 의존하지 않으므로 브라우저 단독(vite dev)에서도, Electron
 * 에서도 완전히 동일하게 동작한다.
 *
 *   TelemetrySource ──onEvent──▶ useTelemetry() ──▶ 화면
 *   화면 ──send('led.text', …)──▶ TelemetrySource (로컬 반영 + 후속 이벤트)
 *
 * 값은 실제 주행에 가깝게 흔들리도록 생성한다 — 화면의 속도·좌표·수신율·
 * 태그 목록이 멈춰 있지 않아야 UI 동작을 그대로 확인할 수 있기 때문이다.
 * 실제 하드웨어를 붙일 때는 이 파일의 생성 루프만 실물 입력으로 바꾸면
 * 되고, 이벤트 모양(DeviceEvent)과 화면은 그대로 둔다.
 */

// ── 장비 / 이벤트 모양 ────────────────────────────────────────────────────────
/** 텔레메트리를 내보내는 장비 구분 */
export type DeviceSource = 'gps' | 'nfc' | 'can' | 'imu' | 'obd' | 'audio' | 'led' | 'rs485';

/** LIVE=동작 중 / OFFLINE=장비 없음 / DISABLED=사용 안 함으로 꺼둠 */
export type DeviceState = 'LIVE' | 'OFFLINE' | 'DISABLED';

/** 실제 연결 방식. LIVE 가 아니면 null */
export type Connection = null | 'USB' | 'UART' | 'I2C' | 'SPI' | 'GPIO' | 'SOFT';

export interface DeviceInfo {
  source: DeviceSource;
  state: DeviceState;
  /** 사용자 표시용 라벨 ("연결됨(USB)" / "없음" / "사용안함") */
  label: string;
  connection: Connection;
  errors: number;
  enabled: boolean;
}

export interface DeviceEvent {
  source: DeviceSource;
  kind: string;
  /** 단조 증가 초. 수신율 계산처럼 간격이 필요한 곳에 쓴다 */
  seconds: number;
  /** 화면 표시용 시각 문자열 (HH:MM:SS.mmm) */
  time: string;
  data: unknown;
}

// ── 이벤트 payload ────────────────────────────────────────────────────────────
/** can/frame — J1939 프레임 한 개 */
export interface CanFrame {
  pgn: number;
  desc: string;
  sourceAddress: number;
  dataHex: string;
  length: number;
}

/** nfc/tag — 카드 한 번 태그 */
export interface NfcTag {
  uidRaw: string;
  uidHex: string;
  uidLen: number;
}

/** obd/dtc — 진단 코드 한 건 */
export interface DtcRecord {
  code: string;
  /** 어디서 올라온 코드인지 ("manual" = 진단 화면에서 직접 입력) */
  origin: string;
}

/** led/render — 전광판이 지금 출력 중인 내용 */
export interface LedRender {
  text: string;
  effect: LedEffect;
  position: [number, number];
  color: [number, number, number];
}

/** audio/speak_request · audio/speak_done */
export interface AudioMessage {
  message: string;
}

/** imu/sample — 3축 가속도 + 자이로 */
export interface ImuSample {
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  tempC: number;
}

export type LedEffect = 'static' | 'scroll_left' | 'scroll_right' | 'blink';

// ── 명령 ──────────────────────────────────────────────────────────────────────
/** 화면이 장비에 보낼 수 있는 동작 */
export type CommandAction =
  | 'led.text' | 'led.effect' | 'led.clear' | 'led.position'
  | 'audio.speak'
  | 'obd.dtc';

// ── Electron 시스템 API ───────────────────────────────────────────────────────
/** ibms:netinfo 응답 (LTE/네트워크 진단 화면용) */
export interface NetInfo {
  interfaces: Record<string, Array<{
    address: string; netmask: string; family: string;
    mac: string; internal: boolean; cidr: string | null;
  }> | undefined>;
  /** ipconfig /all (Windows) 또는 ip addr/route (Linux) 원문 */
  raw: string;
  hostname: string;
  platform: string;
}

/** preload 가 노출하는 OS 수준 기능. 렌더러가 직접 못 하는 것만 담는다. */
export interface IbmsSystemApi {
  platform: string;
  arch: string;
  versions: { electron: string; chrome: string; node: string };
  system: {
    /** 네트워크 인터페이스 + OS 네이티브 도구 원문 */
    netinfo(): Promise<NetInfo>;
    /** 앱 재시작 */
    reboot(): Promise<void>;
  };
}

declare global {
  interface Window {
    ibms?: IbmsSystemApi;
  }
}

/** Electron 안에서 실행 중인지 (브라우저 단독 실행과 구분) */
export const inElectron = (): boolean =>
  typeof window !== 'undefined' && !!window.ibms?.system;

// ── 소스 ──────────────────────────────────────────────────────────────────────
type EventListener = (evt: DeviceEvent) => void;
type DevicesListener = (devices: DeviceInfo[]) => void;
type RunningListener = (running: boolean) => void;

/** source 별 히스토리 보관 개수 (진단 화면의 최근 프레임/태그 목록용) */
const HISTORY_MAX = 60;

/** 안내방송 한 건의 최소 재생 시간 — 음성 합성을 못 쓸 때의 대체값 */
const SPEAK_FALLBACK_MS = 1200;

export class TelemetrySource {
  private timers: ReturnType<typeof setInterval>[] = [];

  private eventListeners = new Set<EventListener>();
  private devicesListeners = new Set<DevicesListener>();
  private runningListeners = new Set<RunningListener>();

  /** source 별 최신 이벤트 */
  readonly latest = new Map<string, DeviceEvent>();
  /** source 별 최근 이벤트 (오래된 것 → 최신 순) */
  readonly history = new Map<string, DeviceEvent[]>();
  devices: DeviceInfo[] = [];
  running = false;

  // ---------- 시작 / 정지 ----------
  start(): void {
    if (this.timers.length) return;
    this.publishDevices();
    this.startGps();
    this.startCan();
    this.startNfc();
    this.startImu();
    this.setRunning(true);
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.setRunning(false);
  }

  getHistory(source: string): DeviceEvent[] {
    return this.history.get(source) ?? [];
  }

  // ---------- 구독 ----------
  onEvent(cb: EventListener): () => void {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  onDevices(cb: DevicesListener): () => void {
    this.devicesListeners.add(cb);
    return () => this.devicesListeners.delete(cb);
  }

  onRunningChange(cb: RunningListener): () => void {
    this.runningListeners.add(cb);
    return () => this.runningListeners.delete(cb);
  }

  // ---------- 명령 ----------
  /**
   * 장비 동작 요청. 반영 결과는 후속 이벤트로 돌아오므로 화면은 명령을 보낸
   * 뒤 이벤트를 기다리면 된다 (전광판 미러, 방송 이력 등).
   */
  async send(action: CommandAction, args: Record<string, unknown> = {}): Promise<void> {
    switch (action) {
      case 'led.text':
        this.emit('led', 'render', {
          text: String(args.text ?? ''),
          effect: (args.effect as LedEffect) ?? 'static',
          position: [0, 0], color: [255, 140, 0],
        } satisfies LedRender);
        break;

      case 'led.clear':
        this.emit('led', 'render', {
          text: '', effect: 'static', position: [0, 0], color: [255, 140, 0],
        } satisfies LedRender);
        break;

      case 'obd.dtc':
        this.emit('obd', 'dtc', {
          code: String(args.code ?? ''), origin: 'manual',
        } satisfies DtcRecord);
        break;

      case 'audio.speak':
        await this.speak(String(args.message ?? '안내방송 테스트입니다'));
        break;

      default:
        break;   // led.effect/position 은 다음 led.text 에 함께 실린다
    }
  }

  /**
   * 안내방송을 실제로 재생한다.
   *
   * 브라우저 음성 합성을 쓰고, 없거나 실패하면 재생 시간만 흉내 낸다.
   * 어느 쪽이든 speak_request → speak_done 순서는 같으므로 방송 이력 화면의
   * "재생 중" 표시는 동일하게 동작한다.
   */
  private speak(message: string): Promise<void> {
    this.emit('audio', 'speak_request', { message } satisfies AudioMessage);
    const done = () => this.emit('audio', 'speak_done', { message } satisfies AudioMessage);

    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      return new Promise((resolve) => {
        setTimeout(() => { done(); resolve(); }, SPEAK_FALLBACK_MS);
      });
    }

    return new Promise((resolve) => {
      // onend/onerror 가 오지 않는 브라우저가 있어 한 번만 실행되도록 잠근다
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        done();
        resolve();
      };
      const utter = new SpeechSynthesisUtterance(message);
      utter.lang = 'ko-KR';
      utter.onend = finish;
      utter.onerror = finish;
      synth.cancel();          // 앞선 방송이 남아 있으면 끊고 새로 읽는다
      synth.speak(utter);
    });
  }

  // ---------- 내부 ----------
  private setRunning(v: boolean): void {
    if (this.running === v) return;
    this.running = v;
    this.runningListeners.forEach((l) => l(v));
  }

  private publishDevices(): void {
    const dev = (source: DeviceSource, state: DeviceState, label: string,
      connection: Connection = null, errors = 0): DeviceInfo =>
      ({ source, state, label, connection, errors, enabled: state !== 'DISABLED' });

    // 전광판(OFFLINE)·RS485(DISABLED)를 섞어 3색 표시가 모두 보이게 한다
    this.devices = [
      dev('gps', 'LIVE', '연결됨(USB)', 'USB'),
      dev('nfc', 'LIVE', '연결됨(I2C)', 'I2C'),
      dev('can', 'LIVE', '연결됨(USB)', 'USB'),
      dev('imu', 'LIVE', '연결됨(I2C)', 'I2C'),
      dev('obd', 'LIVE', '연결됨'),
      dev('audio', 'LIVE', '연결됨'),
      dev('led', 'OFFLINE', '없음'),
      dev('rs485', 'DISABLED', '사용안함'),
    ];
    this.devicesListeners.forEach((l) => l(this.devices));
  }

  private emit(source: DeviceSource, kind: string, data: unknown): void {
    const now = new Date();
    const evt: DeviceEvent = {
      source, kind, data,
      seconds: performance.now() / 1000,
      time: now.toTimeString().slice(0, 8) + '.'
        + String(now.getMilliseconds()).padStart(3, '0'),
    };
    this.latest.set(source, evt);
    const h = this.history.get(source) ?? [];
    // 기존 배열을 변형하지 않고 새 배열로 교체한다.
    // in-place push/shift 를 하면 getHistory() 의 반환 참조가 영구히 같아서
    // 소비 측 useMemo([sentences]) 의 Object.is 비교가 변화를 감지하지 못하고
    // 화면 값이 첫 프레임에서 멈춘다 (GPS 속도/위치, CAN 수신율 등).
    this.history.set(source, [...h, evt].slice(-HISTORY_MAX));
    this.eventListeners.forEach((l) => l(evt));
  }

  /** GPS: 서울 시내를 천천히 도는 경로의 NMEA 문장 (RMC + GGA) */
  private startGps(): void {
    let lat = 37.5665, lon = 126.9780, course = 90, tick = 0;
    this.timers.push(setInterval(() => {
      tick += 1;
      course = (course + (Math.random() * 10 - 5) + 360) % 360;
      const speedKn = 12 + Math.sin(tick / 10) * 8 + Math.random() * 2;   // ~22-37km/h
      const rad = (course * Math.PI) / 180;
      lat += Math.cos(rad) * 0.00008;
      lon += Math.sin(rad) * 0.0001;

      const t = new Date();
      const hhmmss = String(t.getUTCHours()).padStart(2, '0')
        + String(t.getUTCMinutes()).padStart(2, '0')
        + String(t.getUTCSeconds()).padStart(2, '0');
      const ddmmyy = String(t.getUTCDate()).padStart(2, '0')
        + String(t.getUTCMonth() + 1).padStart(2, '0')
        + String(t.getUTCFullYear() % 100).padStart(2, '0');
      // NMEA 는 도(度) + 분(分) 형식 — ddmm.mmmm
      const latN = Math.floor(lat) * 100 + (lat % 1) * 60;
      const lonN = Math.floor(lon) * 100 + (lon % 1) * 60;

      this.emit('gps', 'sentence',
        `$GPRMC,${hhmmss}.00,A,${latN.toFixed(4)},N,${lonN.toFixed(4)},E,`
        + `${speedKn.toFixed(2)},${course.toFixed(1)},${ddmmyy},,,A*00`);
      this.emit('gps', 'sentence',
        `$GPGGA,${hhmmss}.00,${latN.toFixed(4)},N,${lonN.toFixed(4)},E,1,`
        + `${8 + (tick % 3)},0.9,42.3,M,,M,,*00`);
    }, 1000));
  }

  /** CAN: J1939 프레임 (약 2.5 f/s) */
  private startCan(): void {
    const pgns = [
      { pgn: 61444, desc: 'EEC1 엔진 RPM/토크' },
      { pgn: 65265, desc: 'CCVS 차속' },
      { pgn: 65253, desc: 'VH 총주행거리' },
      { pgn: 65257, desc: 'FE 연료소비율' },
    ];
    this.timers.push(setInterval(() => {
      const p = pgns[Math.floor(Math.random() * pgns.length)];
      const bytes = Array.from({ length: 8 },
        () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase());
      this.emit('can', 'frame', {
        pgn: p.pgn, desc: p.desc, sourceAddress: 0,
        dataHex: bytes.join(' '), length: 8,
      } satisfies CanFrame);
    }, 400));
  }

  /** NFC: 승객 카드 태그 */
  private startNfc(): void {
    this.timers.push(setInterval(() => {
      const uid = Array.from({ length: 7 },
        () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase());
      this.emit('nfc', 'tag', {
        uidRaw: uid.join(' '), uidHex: uid.join(''), uidLen: 7,
      } satisfies NfcTag);
    }, 7000));
  }

  /** IMU: 노면 진동이 섞인 3축 가속도/자이로 */
  private startImu(): void {
    this.timers.push(setInterval(() => {
      this.emit('imu', 'sample', {
        ax: +(Math.random() * 2 - 1).toFixed(3),
        ay: +(Math.random() * 2 - 1).toFixed(3),
        az: +(9.8 + Math.random() * 0.2).toFixed(3),
        gx: +(Math.random() * 4 - 2).toFixed(3),
        gy: +(Math.random() * 4 - 2).toFixed(3),
        gz: +(Math.random() * 4 - 2).toFixed(3),
        tempC: 36.2,
      } satisfies ImuSample);
    }, 1500));
  }
}

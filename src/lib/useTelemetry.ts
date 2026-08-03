/**
 * src/lib/useTelemetry.ts
 * =======================
 * 장비 텔레메트리를 React 에서 쓰기 위한 훅.
 *
 *   const { running, devices, latest, send } = useTelemetry();
 *   send('led.text', { text: '700번 강남역' });
 *
 * 소스는 앱 전체에서 하나만 유지된다(모듈 싱글턴). 화면이 여러 번
 * 마운트/언마운트 되어도 생성 루프를 다시 만들지 않는다.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  TelemetrySource,
  type CommandAction,
  type DeviceEvent,
  type DeviceInfo,
} from './telemetry';

let source: TelemetrySource | null = null;

function acquire(): TelemetrySource {
  if (!source) {
    source = new TelemetrySource();
    source.start();
  }
  return source;
}

export interface UseTelemetry {
  /** 텔레메트리 생성이 돌고 있는지 */
  running: boolean;
  /** 장비별 상태 */
  devices: DeviceInfo[];
  /** source → 최신 이벤트 */
  latest: Record<string, DeviceEvent>;
  /** source 별 최근 이벤트 목록 (진단 화면용, 오래된 것 → 최신 순) */
  getHistory: (source: string) => DeviceEvent[];
  /** 장비 동작 요청 */
  send: (action: CommandAction, args?: Record<string, unknown>) => Promise<void>;
}

export function useTelemetry(): UseTelemetry {
  const [running, setRunning] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [latest, setLatest] = useState<Record<string, DeviceEvent>>({});

  useEffect(() => {
    const s = acquire();
    setRunning(s.running);
    setDevices(s.devices);
    setLatest(Object.fromEntries(s.latest));

    const offRunning = s.onRunningChange(setRunning);
    const offDevices = s.onDevices((d) => setDevices([...d]));
    const offEvent = s.onEvent((evt) => {
      setLatest((prev) => ({ ...prev, [evt.source]: evt }));
    });

    return () => {
      offRunning();
      offDevices();
      offEvent();
      // 구독만 해제. 소스는 앱 수명 동안 유지된다 —
      // 화면 전환마다 다시 시작하면 이력이 날아가 UI 가 깜빡이기 때문.
    };
  }, []);

  const send = useCallback(
    (action: CommandAction, args: Record<string, unknown> = {}) =>
      acquire().send(action, args),
    [],
  );

  const getHistory = useCallback((s: string) => acquire().getHistory(s), []);

  return { running, devices, latest, getHistory, send };
}

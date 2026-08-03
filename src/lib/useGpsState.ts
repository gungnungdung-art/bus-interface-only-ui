/**
 * src/lib/useGpsState.ts
 * ======================
 * gps 이벤트 이력(NMEA 원문)을 누적 파싱해 최신 GpsState 를 돌려준다.
 * 메인 화면과 운행(내비게이션) 화면이 공유한다.
 */
import { useMemo } from 'react';
import { useTelemetry } from './useTelemetry';
import { applySentence, emptyGpsState, type GpsState } from './nmea';

export function useGpsState(): GpsState {
  const { getHistory } = useTelemetry();
  const sentences = getHistory('gps');
  return useMemo(() => {
    let s = emptyGpsState();
    for (const evt of sentences) {
      if (typeof evt.data === 'string') s = applySentence(s, evt.data);
    }
    return s;
  }, [sentences]);
}

/**
 * src/lib/nmea.ts
 * ===============
 * GPS 진단 화면용 최소 NMEA0183 파서.
 *
 * gps 장비는 원문 문장(data: string)을 그대로 발행하므로
 * 위치/속도/방향/위성수 표시는 화면 쪽에서 파싱한다.
 * 지원: RMC(위치·속도·방향·날짜), GGA(fix·위성수·고도·HDOP), VTG(속도·방향),
 *       GSA(fix 종류·DOP), GSV(가시 위성 수)
 */

export interface GpsState {
  /** 위도 (십진도, 남위 음수) */
  lat: number | null;
  /** 경도 (십진도, 서경 음수) */
  lon: number | null;
  /** 속도 km/h */
  speedKmh: number | null;
  /** 진행 방향 (도, 진북 기준) */
  course: number | null;
  /** 사용 중 위성 수 (GGA) */
  satellites: number | null;
  /** 가시 위성 수 (GSV) */
  satellitesInView: number | null;
  /** fix 품질: 0=없음 1=GPS 2=DGPS */
  fixQuality: number | null;
  /** fix 종류: 1=없음 2=2D 3=3D (GSA) */
  fixType: number | null;
  /** 고도 m */
  altitude: number | null;
  hdop: number | null;
  /** UTC 시각 문자열 (hhmmss.ss) */
  utcTime: string | null;
  /** RMC 유효 플래그 (A=유효) */
  valid: boolean;
  /** 마지막 문장 수신 시각 (Date.now) */
  updatedAt: number;
}

export function emptyGpsState(): GpsState {
  return {
    lat: null, lon: null, speedKmh: null, course: null,
    satellites: null, satellitesInView: null, fixQuality: null, fixType: null,
    altitude: null, hdop: null, utcTime: null, valid: false, updatedAt: 0,
  };
}

/** "3733.9905,N" → 37.5665 형식 십진도 변환 */
function parseCoord(value: string, hemi: string): number | null {
  if (!value || !hemi) return null;
  const dot = value.indexOf('.');
  if (dot < 3) return null;
  const degDigits = dot - 2;                     // 위도 2자리, 경도 3자리 자동 처리
  const deg = parseFloat(value.slice(0, degDigits));
  const min = parseFloat(value.slice(degDigits));
  if (Number.isNaN(deg) || Number.isNaN(min)) return null;
  const dec = deg + min / 60;
  return (hemi === 'S' || hemi === 'W') ? -dec : dec;
}

function num(s: string | undefined): number | null {
  if (s === undefined || s === '') return null;
  const v = parseFloat(s);
  return Number.isNaN(v) ? null : v;
}

const KNOT_TO_KMH = 1.852;

/**
 * NMEA 문장 한 줄을 기존 상태에 병합한다. (원본 state 는 수정하지 않음)
 * 체크섬은 검증하지 않는다 — 진단 표시용이므로 관대하게 처리.
 */
export function applySentence(state: GpsState, raw: string): GpsState {
  if (!raw.startsWith('$')) return state;
  const body = raw.slice(1).split('*')[0];
  const f = body.split(',');
  const type = f[0]?.slice(-3);                  // GPRMC/GNRMC → RMC
  const s: GpsState = { ...state, updatedAt: Date.now() };

  switch (type) {
    case 'RMC': {
      // $GPRMC,time,A,lat,N,lon,E,speed(kn),course,date,...
      s.utcTime = f[1] || s.utcTime;
      s.valid = f[2] === 'A';
      const lat = parseCoord(f[3], f[4]);
      const lon = parseCoord(f[5], f[6]);
      if (lat !== null) s.lat = lat;
      if (lon !== null) s.lon = lon;
      const kn = num(f[7]);
      if (kn !== null) s.speedKmh = kn * KNOT_TO_KMH;
      const crs = num(f[8]);
      if (crs !== null) s.course = crs;
      break;
    }
    case 'GGA': {
      // $GPGGA,time,lat,N,lon,E,fix,sats,hdop,alt,M,...
      s.utcTime = f[1] || s.utcTime;
      const lat = parseCoord(f[2], f[3]);
      const lon = parseCoord(f[4], f[5]);
      if (lat !== null) s.lat = lat;
      if (lon !== null) s.lon = lon;
      s.fixQuality = num(f[6]) ?? s.fixQuality;
      s.satellites = num(f[7]) ?? s.satellites;
      s.hdop = num(f[8]) ?? s.hdop;
      s.altitude = num(f[9]) ?? s.altitude;
      break;
    }
    case 'VTG': {
      // $GPVTG,course,T,,M,speed(kn),N,speed(km/h),K
      const crs = num(f[1]);
      if (crs !== null) s.course = crs;
      const kmh = num(f[7]);
      if (kmh !== null) s.speedKmh = kmh;
      else {
        const kn = num(f[5]);
        if (kn !== null) s.speedKmh = kn * KNOT_TO_KMH;
      }
      break;
    }
    case 'GSA': {
      // $GPGSA,A,3,...,PDOP,HDOP,VDOP
      s.fixType = num(f[2]) ?? s.fixType;
      const hdop = num(f[f.length - 2]);
      if (hdop !== null) s.hdop = hdop;
      break;
    }
    case 'GSV': {
      // $GPGSV,total,idx,totalSats,...
      s.satellitesInView = num(f[3]) ?? s.satellitesInView;
      break;
    }
    default:
      break;
  }
  return s;
}

/** 방향(도) → 한글 방위 표기 */
export function courseToCompass(course: number | null): string {
  if (course === null) return '—';
  const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  return dirs[Math.round(((course % 360) + 360) % 360 / 45) % 8];
}

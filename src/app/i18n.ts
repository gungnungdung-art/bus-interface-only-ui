/**
 * src/app/i18n.ts
 * ===============
 * 최소 다국어 사전 (ko/en). 설정 → 언어에서 전환한다.
 * 화면 골격 문구만 다루며, 장비가 보내는 데이터 문자열은 그대로 표시한다.
 */
import { createContext, useContext } from "react";
import type { Lang } from "./theme";

const STR = {
  // 공통
  confirm: { ko: "확인", en: "OK" },
  cancel: { ko: "취소", en: "Cancel" },
  back: { ko: "뒤로", en: "Back" },
  simBadge: { ko: "시뮬레이션 데이터", en: "SIMULATED DATA" },
  noData: { ko: "수신된 데이터가 없습니다", en: "No data received" },

  // 하단 메뉴
  startOp: { ko: "운행 시작", en: "Start Service" },
  endOp: { ko: "운행 종료", en: "End Service" },
  changeRoute: { ko: "노선 변경", en: "Change Route" },
  settings: { ko: "설정", en: "Settings" },
  reboot: { ko: "재부팅", en: "Reboot" },

  // 확인 팝업
  askStart: { ko: "운행을 시작하시겠습니까?", en: "Start the service?" },
  askEnd: { ko: "운행을 종료하시겠습니까?", en: "End the service?" },
  askReboot: { ko: "재부팅 하시겠습니까?", en: "Reboot the system?" },
  askRoute: { ko: "노선을 변경하시겠습니까?", en: "Change the route?" },

  // 운행(내비게이션) 화면
  viewNav: { ko: "운행 중 · 내비게이션", en: "In Service · Map" },
  opContinueHint: { ko: "운행은 계속됩니다", en: "Service keeps running" },
  northUp: { ko: "북쪽 고정", en: "North up" },
  headingUp: { ko: "진행 방향", en: "Heading up" },
  gpsFallback: { ko: "GPS 수신 대기 중 — 기본 위치를 표시합니다", en: "Waiting for GPS — showing default location" },

  // 메인 화면
  deviceStatus: { ko: "장비 상태", en: "Devices" },
  opInfo: { ko: "운행 정보", en: "Operation" },
  routeInfo: { ko: "노선 정보", en: "Route" },
  operating: { ko: "운행 중", en: "IN SERVICE" },
  standby: { ko: "대기 중", en: "STANDBY" },
  opTime: { ko: "운행 시간", en: "Elapsed" },
  speed: { ko: "속도", en: "Speed" },
  heading: { ko: "방향", en: "Heading" },
  satellites: { ko: "위성", en: "Satellites" },
  nextStop: { ko: "다음 정류장", en: "Next stop" },
  eta: { ko: "도착 예정", en: "ETA" },
  busAhead: { ko: "앞차", en: "Bus ahead" },
  busBehind: { ko: "뒤차", en: "Bus behind" },
  myBus: { ko: "내 차량", en: "My bus" },
  stopsApart: { ko: "정거장", en: "stops" },
  curLocation: { ko: "현재 위치", en: "Current location" },
  addrResolving: { ko: "주소 확인 중…", en: "Resolving address…" },
  gpsWaiting: { ko: "GPS 위성 수신 대기 중", en: "Waiting for GPS signal" },
  currentRoute: { ko: "현재 노선", en: "Route" },
  origin: { ko: "기점", en: "Origin" },
  destination: { ko: "종점", en: "Destination" },

  // 로그인
  login: { ko: "로그인", en: "Login" },
  loginTitle: { ko: "통합 버스 관리 시스템", en: "Integrated Bus Management System" },
  selectDriver: { ko: "운전자를 선택하세요", en: "Select a driver" },

  // 설정
  general: { ko: "일반", en: "General" },
  test: { ko: "테스트", en: "Test" },
  brightness: { ko: "화면 밝기", en: "Brightness" },
  volume: { ko: "음량", en: "Volume" },
  themeMode: { ko: "라이트 / 다크 모드", en: "Light / Dark mode" },
  lightMode: { ko: "라이트", en: "Light" },
  darkMode: { ko: "다크", en: "Dark" },
  autoLogin: { ko: "자동 로그인", en: "Auto login" },
  language: { ko: "언어", en: "Language" },
  logout: { ko: "로그아웃", en: "Logout" },

  // 장비 이름
  devGps: { ko: "GPS", en: "GPS" },
  devLte: { ko: "LTE 모뎀", en: "LTE Modem" },
  devCan: { ko: "CAN 통신", en: "CAN Bus" },
  devObd: { ko: "OBD 진단기", en: "OBD Diagnostics" },
  devCamera: { ko: "IP 카메라", en: "IP Camera" },
  devSign: { ko: "전광판", en: "Display Sign" },
  devAudio: { ko: "안내방송", en: "Announcement" },
  devNfc: { ko: "NFC", en: "NFC" },
  devAll: { ko: "장비 상태 확인", en: "All Devices" },

  // 상태 라벨
  stOk: { ko: "정상", en: "OK" },
  stWarn: { ko: "경고", en: "WARN" },
  stError: { ko: "오류", en: "ERROR" },
  stNotLinked: { ko: "미연동", en: "Not linked" },
  stDisabled: { ko: "사용안함", en: "Disabled" },
  stNoHw: { ko: "하드웨어 없음", en: "No hardware" },
  stOffline: { ko: "연결 안됨", en: "Offline" },
} as const;

export type StrKey = keyof typeof STR;

export const I18nCtx = createContext<{ lang: Lang; t: (k: StrKey) => string }>({
  lang: "ko",
  t: (k) => STR[k].ko,
});

export const useI18n = () => useContext(I18nCtx);

export function makeT(lang: Lang): (k: StrKey) => string {
  return (k) => STR[k][lang];
}

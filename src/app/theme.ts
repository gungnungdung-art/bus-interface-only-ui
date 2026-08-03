/**
 * src/app/theme.ts
 * ================
 * 팔레트, 화면 타입, 앱 설정(밝기/음량/테마/자동로그인/언어) 컨텍스트.
 */
import { createContext, useContext } from "react";

// ── 화면 ──────────────────────────────────────────────────────────────────────
export type Screen =
  | "login" | "main" | "drive" | "route" | "settings"
  | "diag-gps" | "diag-lte" | "diag-can" | "diag-obd"
  | "diag-camera" | "diag-sign" | "diag-audio" | "diag-nfc"
  | "diag-all";

// ── 장비 연결 상태 (3색) ──────────────────────────────────────────────────────
/** 🟢 ok = 정상 연결, 🟡 warn = 불안정/경고/사용안함, 🔴 error = 끊김/오류/미연동 */
export type StatusLevel = "ok" | "warn" | "error";

export const STATUS_COLOR: Record<StatusLevel, string> = {
  ok: "#00C896",
  warn: "#F5A623",
  error: "#E83030",
};

// ── 팔레트 ────────────────────────────────────────────────────────────────────
export interface Pal {
  bg: string; bgDeep: string; bgPanel: string; bgCard: string; bgSecondary: string;
  text: string; textMuted: string; textSub: string; border: string; topbar: string;
  accent: string;
}

export const DARK: Pal = {
  bg: "#080C18", bgDeep: "#050810", bgPanel: "#0A0F1E", bgCard: "#0F1626",
  bgSecondary: "#1A2540", text: "#E2E8F5", textMuted: "#6B7A99",
  textSub: "#A8B8D8", border: "rgba(100,130,200,0.15)", topbar: "#050810",
  accent: "#1A6FE8",
};
export const LIGHT: Pal = {
  bg: "#F0F5FF", bgDeep: "#E5EDFF", bgPanel: "#DDE7FF", bgCard: "#FFFFFF",
  bgSecondary: "#C8D5F8", text: "#0D1534", textMuted: "#4A5880",
  textSub: "#2A3E6A", border: "rgba(30,60,160,0.18)", topbar: "#D5E0FF",
  accent: "#1A6FE8",
};

export const ThemeCtx = createContext<{ light: boolean; pal: Pal }>({ light: true, pal: LIGHT });
export const useTheme = () => useContext(ThemeCtx);

// ── 앱 설정 ───────────────────────────────────────────────────────────────────
export type Lang = "ko" | "en";

export interface AppSettings {
  /** 화면 밝기 % (30~100) */
  brightness: number;
  /** 음량 % (0~100) */
  volume: number;
  /** 라이트 모드 여부 */
  light: boolean;
  autoLogin: boolean;
  lang: Lang;
}

export const DEFAULT_SETTINGS: AppSettings = {
  brightness: 100, volume: 70, light: true, autoLogin: false, lang: "ko",
};

const SETTINGS_KEY = "ibms.settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* 저장 실패는 치명적이지 않음 */ }
}

export const SettingsCtx = createContext<{
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}>({ settings: DEFAULT_SETTINGS, update: () => undefined });

export const useSettings = () => useContext(SettingsCtx);

// ── 운행 상태 ─────────────────────────────────────────────────────────────────
export interface OperationState {
  active: boolean;
  route: string;
  /** 운행 시작 시각 (Date.now), 미운행이면 null */
  startedAt: number | null;
}

const OPERATION_KEY = "ibms.operation";

export function loadOperation(): OperationState {
  try {
    const raw = localStorage.getItem(OPERATION_KEY);
    if (!raw) return { active: false, route: "700", startedAt: null };
    return { active: false, route: "700", startedAt: null, ...JSON.parse(raw) };
  } catch {
    return { active: false, route: "700", startedAt: null };
  }
}

export function saveOperation(op: OperationState): void {
  try {
    localStorage.setItem(OPERATION_KEY, JSON.stringify(op));
  } catch { /* no-op */ }
}

// ── 운전자 ────────────────────────────────────────────────────────────────────
export interface Driver { id: string; name: string; busNumber: string; }

/** 데모용 운전자 목록 (실명·실차량번호는 소스에 넣지 않는다) */
export const DRIVERS: Driver[] = [
  { id: "1001", name: "김○수", busNumber: "서울70자12○4" },
  { id: "1002", name: "이○희", busNumber: "서울70자56○8" },
  { id: "1003", name: "박○준", busNumber: "서울70자90○2" },
];

export const ROUTES = ["700", "700-1", "700A", "700B", "701", "702", "703", "710"];

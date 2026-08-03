/**
 * src/app/devices.ts
 * ==================
 * UI 장비 목록(8종)과 장비 상태 → 3색 표시 매핑.
 */
import { useEffect, useState } from "react";
import {
  Navigation, Wifi, GitBranch, Wrench, Camera, MonitorPlay, Volume2, Radio,
  type LucideIcon,
} from "lucide-react";
import { inElectron, type DeviceInfo } from "@/lib/telemetry";
import type { Screen, StatusLevel } from "./theme";
import type { StrKey } from "./i18n";

export type UiDeviceId =
  | "gps" | "lte" | "can" | "obd" | "camera" | "sign" | "audio" | "nfc";

export interface UiDevice {
  id: UiDeviceId;
  nameKey: StrKey;
  icon: LucideIcon;
  screen: Screen;
  /** 텔레메트리 source 명 (없으면 다른 경로로 상태 판단: lte/camera) */
  source: string | null;
}

export const UI_DEVICES: UiDevice[] = [
  { id: "gps",    nameKey: "devGps",    icon: Navigation,  screen: "diag-gps",    source: "gps" },
  { id: "lte",    nameKey: "devLte",    icon: Wifi,        screen: "diag-lte",    source: null },
  { id: "can",    nameKey: "devCan",    icon: GitBranch,   screen: "diag-can",    source: "can" },
  { id: "obd",    nameKey: "devObd",    icon: Wrench,      screen: "diag-obd",    source: "obd" },
  { id: "camera", nameKey: "devCamera", icon: Camera,      screen: "diag-camera", source: null },
  { id: "sign",   nameKey: "devSign",   icon: MonitorPlay, screen: "diag-sign",   source: "led" },
  { id: "audio",  nameKey: "devAudio",  icon: Volume2,     screen: "diag-audio",  source: "audio" },
  { id: "nfc",    nameKey: "devNfc",    icon: Radio,       screen: "diag-nfc",    source: "nfc" },
];

/**
 * 장비 상태 → 3색.
 *   LIVE(오류 없음) → 🟢 / LIVE+오류 or DISABLED → 🟡 / OFFLINE(장비 없음) → 🔴
 */
export function levelOf(info: DeviceInfo | undefined, running: boolean): StatusLevel {
  if (!running || !info) return "error";
  if (info.state === "LIVE") return info.errors > 0 ? "warn" : "ok";
  if (info.state === "DISABLED") return "warn";
  return "error";   // OFFLINE = 장비를 찾지 못함
}

/** 상태 라벨 키 (i18n) */
export function levelLabelKey(info: DeviceInfo | undefined, running: boolean): StrKey {
  if (!running || !info) return "stOffline";
  if (info.state === "LIVE") return info.errors > 0 ? "stWarn" : "stOk";
  if (info.state === "DISABLED") return "stDisabled";
  return "stNoHw";
}

/** source → DeviceInfo 조회 맵 */
export function bySource(devices: DeviceInfo[]): Map<string, DeviceInfo> {
  return new Map(devices.map((d) => [d.source, d]));
}

/**
 * LTE/네트워크 상태 — OS 가 들고 있는 정보이므로 Electron 메인에 물어본다.
 * 외부 IPv4 인터페이스가 있으면 🟢, 없으면 🔴. 브라우저 단독 실행에서는 🟢.
 * 메인 화면 좌측 패널과 장비 개요 화면이 공유한다.
 */
export function useLteLevel(intervalMs = 15000): StatusLevel {
  const [level, setLevel] = useState<StatusLevel>("warn");
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!inElectron()) {
        if (alive) setLevel("ok");   // 브라우저 단독 실행
        return;
      }
      try {
        const info = await window.ibms!.system.netinfo();
        const has = Object.values(info.interfaces).some((addrs) =>
          (addrs ?? []).some((a) => !a.internal && a.family === "IPv4"));
        if (alive) setLevel(has ? "ok" : "error");
      } catch {
        if (alive) setLevel("error");
      }
    };
    void check();
    const id = setInterval(() => void check(), intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);
  return level;
}

/** IP 카메라 상태 — 스트림 URL 설정 여부로만 판단 (미설정 = 미연동 🔴) */
export function cameraLevel(): StatusLevel {
  return localStorage.getItem("ibms.cameraUrl") ? "ok" : "error";
}

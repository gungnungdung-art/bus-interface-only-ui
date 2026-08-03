/**
 * src/app/App.tsx
 * ===============
 * IBMS 14인치 운전자 인터페이스 — 운행/유지보수 중심 개편판.
 *
 * 메인 화면: 좌(장비 상태 3색) / 중(운행 정보) / 우(노선·도착 정보 + 앞뒤차 간격)
 * 하단 메뉴: 운행 시작·종료(확인 팝업) / 노선 변경 / 설정 / 재부팅 — 4개만 제공
 * 운행 상태는 루트에서 관리하므로 화면 이동과 무관하게 유지되며,
 * 운행 종료 버튼을 눌러 확인했을 때만 종료된다.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Bus, ChevronRight, LogIn, Map, Navigation, Play, Power, Settings as SettingsIcon, Square,
} from "lucide-react";
import { useTelemetry } from "@/lib/useTelemetry";
import { inElectron } from "@/lib/telemetry";
import { useGpsState } from "@/lib/useGpsState";
import { useAddress } from "@/lib/geocode";
import {
  DARK, DRIVERS, LIGHT,
  loadOperation, loadSettings, saveOperation, saveSettings,
  SettingsCtx, ThemeCtx, useTheme,
  type AppSettings, type Driver, type OperationState, type Screen, type StatusLevel,
} from "./theme";
import { I18nCtx, makeT, useI18n } from "./i18n";
import { BigButton, Card, ConfirmModal, StatusDot, type ConfirmState } from "./ui";
import { UI_DEVICES, bySource, cameraLevel, levelOf, levelLabelKey, useLteLevel } from "./devices";
import {
  AllDevicesDiag, AudioDiag, CameraDiag, CanDiag, GpsDiag, LteDiag, NfcDiag, ObdDiag, SignDiag,
} from "./screens/diagnostics";
import { SettingsScreen } from "./screens/settings";
import { RouteScreen } from "./screens/route";
import { DriveScreen } from "./screens/drive";

const MONO = "'JetBrains Mono', monospace";

// ── 노선별 정류장 (서버 연동 전 예시 데이터) ──────────────────────────────────
const STOPS: Record<string, string[]> = {
  default: ["강남역", "삼성역", "잠실역", "종합운동장", "석촌역", "송파역"],
};
function stopsOf(route: string): string[] {
  return STOPS[route] ?? STOPS.default;
}

// ── 시계 ──────────────────────────────────────────────────────────────────────
function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toTimeString().slice(0, 8);
}

// ── 도착 정보 + 앞뒤차 간격 (서버 연동 전 예시, 살아있는 값으로 시뮬레이션) ──
interface EtaInfo {
  nextStop: string;
  etaSec: number;
  /** 같은 노선 앞차와의 정거장 간격 */
  aheadGap: number;
  aheadBus: string;
  /** 같은 노선 뒤차와의 정거장 간격 */
  behindGap: number;
  behindBus: string;
}

function useEtaInfo(route: string, active: boolean): EtaInfo {
  const stops = stopsOf(route);
  const [stopIdx, setStopIdx] = useState(0);
  const [etaSec, setEtaSec] = useState(135);
  const [gaps, setGaps] = useState({ ahead: 2, behind: 3 });

  // 운행 중일 때만 카운트다운 진행, 0 이 되면 다음 정류장으로
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setEtaSec((s) => {
        if (s > 1) return s - 1;
        setStopIdx((i) => (i + 1) % stops.length);
        return 90 + Math.floor(Math.random() * 120);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [active, stops.length]);

  // 앞뒤차 간격은 천천히 변화
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setGaps((g) => ({
        ahead: Math.max(1, Math.min(5, g.ahead + (Math.random() < 0.5 ? -1 : 1))),
        behind: Math.max(1, Math.min(5, g.behind + (Math.random() < 0.5 ? -1 : 1))),
      }));
    }, 20000);
    return () => clearInterval(id);
  }, [active]);

  return {
    nextStop: stops[stopIdx],
    etaSec,
    aheadGap: gaps.ahead,
    aheadBus: `${route}번 (70자11○7)`,
    behindGap: gaps.behind,
    behindBus: `${route}번 (70자22○3)`,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인 화면
// ══════════════════════════════════════════════════════════════════════════════

/** 좌측: 장비 상태 패널 — 큰 터치 타깃(행 높이 64px+) */
function DevicePanel({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const tele = useTelemetry();
  const map = useMemo(() => bySource(tele.devices), [tele.devices]);
  const lteLevel = useLteLevel();

  return (
    <Card style={{ width: 330, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "14px 20px 8px" }}>
        <span style={{ color: pal.textMuted, fontSize: 15, fontWeight: 700 }}>{t("deviceStatus")}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {UI_DEVICES.map((dev) => {
          const info = dev.source ? map.get(dev.source) : undefined;
          const level: StatusLevel =
            dev.id === "lte" ? lteLevel
              : dev.id === "camera" ? cameraLevel()
                : levelOf(info, tele.running);
          const label =
            dev.id === "lte" ? (level === "ok" ? t("stOk") : level === "warn" ? "확인 중" : t("stError"))
              : dev.id === "camera" ? (level === "ok" ? t("stOk") : t("stNotLinked"))
                : t(levelLabelKey(info, tele.running));
          const Icon = dev.icon;
          return (
            <button
              key={dev.id}
              onClick={() => navigate(dev.screen)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                minHeight: 66, padding: "0 20px",
                background: "transparent", border: "none",
                borderTop: `1px solid ${pal.border}`,
                cursor: "pointer", textAlign: "left",
              }}>
              <StatusDot level={level} size={16} />
              <Icon size={26} color={pal.textSub} />
              <span style={{ color: pal.text, fontSize: 18, fontWeight: 700, flex: 1 }}>
                {t(dev.nameKey)}
              </span>
              <span style={{ color: pal.textMuted, fontSize: 14.5 }}>{label}</span>
              <ChevronRight size={20} color={pal.textMuted} />
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** 노선 정보 — 가로 직사각형: 다음 정류장 + (뒤차 → 내 차량 → 앞차) */
function RouteStrip({ op, eta, driver }: {
  op: OperationState; eta: EtaInfo; driver: Driver | null;
}) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const mm = Math.floor(eta.etaSec / 60);
  const ss = eta.etaSec % 60;

  // 운행 경과 시간
  const [, tick] = useState(0);
  useEffect(() => {
    if (!op.active) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [op.active]);
  const elapsed = op.active && op.startedAt
    ? Math.floor((Date.now() - op.startedAt) / 1000) : 0;
  const fmt = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  /** 버스 노드 (뒤차/내차/앞차) */
  const busNode = (kind: "behind" | "me" | "ahead") => {
    const me = kind === "me";
    const color = me ? pal.accent : kind === "ahead" ? "#00C896" : "#F5A623";
    const label = me ? t("myBus") : t(kind === "ahead" ? "busAhead" : "busBehind");
    const sub = me
      ? (driver?.busNumber ?? "—")
      : kind === "ahead" ? eta.aheadBus : eta.behindBus;
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        flexShrink: 0, width: me ? 168 : 150,
      }}>
        <div style={{
          width: me ? 84 : 66, height: me ? 84 : 66, borderRadius: "50%",
          background: `${color}1E`, border: `3px solid ${color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: me ? `0 0 26px ${color}55` : undefined,
        }}>
          <Bus size={me ? 42 : 32} color={color} />
        </div>
        <span style={{ color: me ? pal.text : pal.textSub, fontSize: me ? 20 : 17, fontWeight: 800 }}>
          {label}
        </span>
        <span style={{ color: pal.textMuted, fontSize: 13.5, fontFamily: MONO }}>{sub}</span>
      </div>
    );
  };

  /** 노드 사이 연결선 + 정거장 간격 */
  const connector = (gap: number) => (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", gap: 8, minWidth: 60, paddingBottom: 44,
    }}>
      <span style={{ color: pal.text, fontSize: 24, fontWeight: 800, fontFamily: MONO }}>
        {gap}
        <small style={{ color: pal.textMuted, fontSize: 14, fontWeight: 600, marginLeft: 5 }}>
          {t("stopsApart")}
        </small>
      </span>
      <div style={{ width: "100%", display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: pal.bgSecondary }} />
        <div style={{
          width: 0, height: 0, marginLeft: -2,
          borderTop: "7px solid transparent", borderBottom: "7px solid transparent",
          borderLeft: `12px solid ${pal.bgSecondary}`,
        }} />
      </div>
    </div>
  );

  return (
    <Card style={{
      flex: 1.35, minHeight: 0, padding: "18px 26px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* 헤더: 노선 + 운행 상태/시간 */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ color: pal.textMuted, fontSize: 15, fontWeight: 700 }}>{t("routeInfo")}</span>
        <span style={{ color: pal.accent, fontSize: 24, fontWeight: 800 }}>{op.route}번</span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 14.5, fontWeight: 800, padding: "4px 14px", borderRadius: 14,
          color: op.active ? "#00C896" : pal.textMuted,
          background: op.active ? "#00C89622" : pal.bgSecondary,
        }}>
          {op.active ? t("operating") : t("standby")}
        </span>
        <span style={{ color: pal.text, fontSize: 21, fontWeight: 800, fontFamily: MONO }}>
          {op.active ? fmt(elapsed) : "--:--:--"}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", gap: 26 }}>
        {/* 다음 정류장 */}
        <div style={{
          alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "0 26px", borderRadius: 14, minWidth: 240,
          background: pal.bgSecondary, border: `1px solid ${pal.border}`,
        }}>
          <span style={{ color: pal.textMuted, fontSize: 15 }}>{t("nextStop")}</span>
          <span style={{ color: pal.text, fontSize: 38, fontWeight: 800, margin: "4px 0 8px" }}>
            {eta.nextStop}
          </span>
          <span style={{ color: "#00C896", fontSize: 19, fontWeight: 700, fontFamily: MONO }}>
            {t("eta")} {op.active ? `${mm}분 ${String(ss).padStart(2, "0")}초` : "—"}
          </span>
        </div>

        {/* 뒤차 → 내 차량 → 앞차 (진행 방향 →) */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0 }}>
          {busNode("behind")}
          {connector(eta.behindGap)}
          {busNode("me")}
          {connector(eta.aheadGap)}
          {busNode("ahead")}
        </div>
      </div>

      <span style={{ color: pal.textMuted, fontSize: 12, textAlign: "right" }}>
        ※ 배차 간격은 서버 연동 전 예시 값입니다
      </span>
    </Card>
  );
}

/** 현재 위치 — GPS 좌표를 일반 주소로 표시 */
function LocationCard() {
  const { pal } = useTheme();
  const { t } = useI18n();
  const gps = useGpsState();
  const { address } = useAddress(gps.lat, gps.lon);
  const hasFix = gps.lat !== null && gps.lon !== null;

  return (
    <Card style={{
      flex: 1, minHeight: 0, padding: "18px 26px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: pal.textMuted, fontSize: 15, fontWeight: 700 }}>{t("curLocation")}</span>
        <StatusDot level={gps.valid ? "ok" : "warn"} size={11} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
        {!hasFix ? (
          <span style={{ color: pal.textMuted, fontSize: 22, fontWeight: 600 }}>
            {t("gpsWaiting")}
          </span>
        ) : (
          <>
            <span style={{
              color: pal.text, fontSize: 36, fontWeight: 800, lineHeight: 1.35,
              wordBreak: "keep-all",
            }}>
              {address ?? t("addrResolving")}
            </span>
            <span style={{ color: pal.textMuted, fontSize: 14.5, fontFamily: MONO }}>
              {gps.lat!.toFixed(5)}, {gps.lon!.toFixed(5)}
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

/** 메인 화면 전체 */
function MainScreen({ op, eta, driver, navigate, onStart, onEnd, onReboot }: {
  op: OperationState;
  eta: EtaInfo;
  driver: Driver | null;
  navigate: (s: Screen) => void;
  onStart: () => void;
  onEnd: () => void;
  onReboot: () => void;
}) {
  const { t } = useI18n();
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: 16, gap: 14 }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14 }}>
        <DevicePanel navigate={navigate} />
        {/* 우측: 노선 정보(가로 스트립) + 현재 위치 주소 */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <RouteStrip op={op} eta={eta} driver={driver} />
          <LocationCard />
        </div>
      </div>
      {/* 하단 메뉴 — 운행 상태에 따라 [운행 시작] ↔ [운행 중·내비게이션 / 운행 종료] */}
      <div style={{ display: "flex", gap: 14, height: 84 }}>
        {!op.active ? (
          <BigButton color="#00C896" onClick={onStart} style={{ flex: 1.4, fontSize: 21 }}>
            <Play size={26} /> {t("startOp")}
          </BigButton>
        ) : (
          <>
            <BigButton color="#1A6FE8" onClick={() => navigate("drive")}
              style={{ flex: 1.4, fontSize: 21 }}>
              <Navigation size={26} /> {t("viewNav")}
            </BigButton>
            <BigButton color="#E83030" onClick={onEnd} style={{ flex: 1, fontSize: 21 }}>
              <Square size={26} /> {t("endOp")}
            </BigButton>
          </>
        )}
        <BigButton onClick={() => navigate("route")} style={{ flex: 1, fontSize: 19 }}>
          <Map size={24} /> {t("changeRoute")}
        </BigButton>
        <BigButton onClick={() => navigate("settings")} style={{ flex: 1, fontSize: 19 }}>
          <SettingsIcon size={24} /> {t("settings")}
        </BigButton>
        <BigButton color="#F5A623" onClick={onReboot} style={{ flex: 1, fontSize: 19 }}>
          <Power size={24} /> {t("reboot")}
        </BigButton>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 로그인
// ══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }: { onLogin: (d: Driver) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 28,
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ color: pal.accent, fontSize: 46, fontWeight: 900, margin: 0, letterSpacing: 2 }}>
          IBMS
        </h1>
        <p style={{ color: pal.textMuted, fontSize: 17, margin: "6px 0 0" }}>{t("loginTitle")}</p>
      </div>
      <p style={{ color: pal.textSub, fontSize: 18, fontWeight: 600, margin: 0 }}>{t("selectDriver")}</p>
      <div style={{ display: "flex", gap: 18 }}>
        {DRIVERS.map((d) => (
          <button key={d.id} onClick={() => onLogin(d)}
            style={{
              width: 230, padding: "26px 22px", borderRadius: 16, cursor: "pointer",
              border: `1px solid ${pal.border}`, background: pal.bgCard,
              display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
            }}>
            <LogIn size={30} color={pal.accent} />
            <span style={{ color: pal.text, fontSize: 22, fontWeight: 800 }}>{d.name}</span>
            <span style={{ color: pal.textMuted, fontSize: 15, fontFamily: MONO }}>{d.busNumber}</span>
            <span style={{ color: pal.textSub, fontSize: 13.5 }}>사번 {d.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 루트
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [screen, setScreen] = useState<Screen>("login");
  const [driver, setDriver] = useState<Driver | null>(null);
  const [op, setOp] = useState<OperationState>(loadOperation);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const pal = settings.light ? LIGHT : DARK;
  const t = useMemo(() => makeT(settings.lang), [settings.lang]);
  const clock = useClock();
  const tele = useTelemetry();
  const eta = useEtaInfo(op.route, op.active);

  const update = (patch: Partial<AppSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const setOperation = (next: OperationState) => {
    setOp(next);
    saveOperation(next);
  };

  // 자동 로그인
  useEffect(() => {
    if (!settings.autoLogin) return;
    try {
      const saved = localStorage.getItem("ibms.driver");
      if (saved) {
        const d = DRIVERS.find((x) => x.id === saved);
        if (d) { setDriver(d); setScreen("main"); }
      }
    } catch { /* no-op */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (d: Driver) => {
    setDriver(d);
    try { localStorage.setItem("ibms.driver", d.id); } catch { /* no-op */ }
    setScreen("main");
  };

  const logout = () => {
    setDriver(null);
    setScreen("login");
  };

  const ask = (message: string, onConfirm: () => void) => setConfirm({ message, onConfirm });

  // 운행 시작/종료 — 확인 팝업을 거쳐야만 상태가 바뀐다.
  // 종료는 여기(운행 종료 버튼 → 확인)에서만 일어나며,
  // 화면 이동·뒤로가기로는 절대 종료되지 않는다.
  const handleStart = () => {
    ask(t("askStart"), () => {
      setOperation({ ...op, active: true, startedAt: Date.now() });
      setScreen("drive");                 // 시작과 동시에 내비게이션 화면으로
    });
  };
  const handleEnd = () => {
    ask(t("askEnd"), () => {
      setOperation({ ...op, active: false, startedAt: null });
      setScreen("main");
    });
  };

  const handleReboot = () => {
    ask(t("askReboot"), () => {
      if (inElectron()) void window.ibms!.system.reboot();
      else window.location.reload();
    });
  };

  const handleRouteSelect = (route: string) => {
    if (route === op.route) { setScreen("main"); return; }
    ask(`${t("askRoute")} (${op.route} → ${route})`, () => {
      setOperation({ ...op, route });
      setScreen("main");
    });
  };

  const render = () => {
    switch (screen) {
      case "login":       return <LoginScreen onLogin={login} />;
      case "main":        return (
        <MainScreen op={op} eta={eta} driver={driver} navigate={setScreen}
          onStart={handleStart} onEnd={handleEnd} onReboot={handleReboot} />
      );
      case "drive":       return (
        <DriveScreen navigate={setScreen} op={op}
          nextStop={eta.nextStop} etaSec={eta.etaSec} onEnd={handleEnd} />
      );
      case "route":       return <RouteScreen navigate={setScreen} current={op.route} onSelect={handleRouteSelect} />;
      case "settings":    return <SettingsScreen navigate={setScreen} onLogout={logout} />;
      case "diag-gps":    return <GpsDiag navigate={setScreen} />;
      case "diag-lte":    return <LteDiag navigate={setScreen} />;
      case "diag-can":    return <CanDiag navigate={setScreen} />;
      case "diag-obd":    return <ObdDiag navigate={setScreen} />;
      case "diag-camera": return <CameraDiag navigate={setScreen} />;
      case "diag-sign":   return <SignDiag navigate={setScreen} />;
      case "diag-audio":  return <AudioDiag navigate={setScreen} />;
      case "diag-nfc":    return <NfcDiag navigate={setScreen} />;
      case "diag-all":    return <AllDevicesDiag navigate={setScreen} />;
      default:            return null;
    }
  };

  return (
    <SettingsCtx.Provider value={{ settings, update }}>
      <ThemeCtx.Provider value={{ light: settings.light, pal }}>
        <I18nCtx.Provider value={{ lang: settings.lang, t }}>
          <div className="size-full flex items-center justify-center"
            style={{
              background: settings.light ? "#8BA0CC" : "#050810",
              fontFamily: "'Noto Sans KR', sans-serif",
            }}>
            <div style={{
              position: "relative", overflow: "hidden",
              width: "min(100vw, calc(100vh * 1366 / 768))",
              height: "min(100vh, calc(100vw * 768 / 1366))",
              maxWidth: 1366, maxHeight: 768,
              background: pal.bg,
              border: `1px solid ${pal.border}`,
              display: "flex", flexDirection: "column",
              boxShadow: settings.light
                ? "0 0 80px rgba(26,111,232,0.12), 0 0 200px rgba(0,0,0,0.25)"
                : "0 0 80px rgba(26,111,232,0.15), 0 0 200px rgba(0,0,0,0.8)",
            }}>
              {/* 상단바 */}
              <div style={{
                height: 54, flexShrink: 0, display: "flex", alignItems: "center",
                gap: 14, padding: "0 20px", background: pal.topbar,
                borderBottom: `1px solid ${pal.border}`,
              }}>
                <span style={{ color: pal.accent, fontSize: 21, fontWeight: 900, letterSpacing: 1 }}>
                  IBMS
                </span>
                {driver && (
                  <span style={{ color: pal.textSub, fontSize: 15.5 }}>
                    {driver.name} · <span style={{ fontFamily: MONO }}>{driver.busNumber}</span>
                  </span>
                )}
                {op.active && (
                  <button
                    onClick={() => setScreen("drive")}
                    style={{
                      background: "#00C89622", color: "#00C896", border: "1px solid #00C896",
                      borderRadius: 20, padding: "4px 14px", fontSize: 13.5, fontWeight: 800,
                      cursor: "pointer",
                    }}>
                    ● {t("operating")} {op.route}
                  </button>
                )}
                <span style={{
                  background: "#F5A62322", color: "#F5A623", border: "1px solid #F5A623",
                  borderRadius: 20, padding: "4px 14px", fontSize: 13.5, fontWeight: 800,
                }}>
                  {t("simBadge")}
                </span>
                <span style={{ flex: 1 }} />
                <StatusDot level={tele.running ? "ok" : "error"} size={11} />
                <span style={{ color: pal.text, fontSize: 18, fontWeight: 700, fontFamily: MONO }}>
                  {clock}
                </span>
              </div>

              {/* 본문 */}
              <div style={{ flex: 1, minHeight: 0 }}>
                {render()}
              </div>

              {/* 확인 팝업 */}
              <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />

              {/* 화면 밝기 오버레이 */}
              {settings.brightness < 100 && (
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none", zIndex: 200,
                  background: `rgba(0,0,0,${(100 - settings.brightness) / 100 * 0.75})`,
                }} />
              )}
            </div>
          </div>
        </I18nCtx.Provider>
      </ThemeCtx.Provider>
    </SettingsCtx.Provider>
  );
}

/**
 * src/app/screens/diagnostics.tsx
 * ===============================
 * 장비별 진단 화면 — 단순 연결 여부가 아니라 실제 동작 데이터를 보여준다.
 *   GPS: 위치/속도/방향/위성수 (NMEA 파싱)
 *   LTE: ipconfig /all 수준 네트워크 정보 (Electron 메인에서 수집)
 *   CAN: 수신 프레임/PGN/오류 카운터
 *   OBD: DTC 이력 + 수동 입력
 *   IP 카메라: 스트림 URL 표시 (MJPEG <img>)
 *   전광판: 현재 출력 문구 미러 + 테스트 송출
 *   안내방송: 최근 방송 이력 + 실제 재생 테스트
 *   NFC: 태그 대기 + 최근 UID 목록
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Play, Send, Trash2 } from "lucide-react";
import { useTelemetry } from "@/lib/useTelemetry";
import { applySentence, courseToCompass, emptyGpsState } from "@/lib/nmea";
import {
  inElectron,
  type CanFrame, type DtcRecord, type LedEffect, type LedRender, type NetInfo, type NfcTag,
} from "@/lib/telemetry";
import { useTheme, type Screen, type StatusLevel } from "../theme";
import { useI18n, type StrKey } from "../i18n";
import { BigButton, Card, Field, StatusDot } from "../ui";
import { UI_DEVICES, bySource, cameraLevel, levelOf, levelLabelKey, useLteLevel } from "../devices";

// ── 공통 셸 ───────────────────────────────────────────────────────────────────
function DiagShell({ titleKey, level, statusText, navigate, children }: {
  titleKey: StrKey; level: StatusLevel; statusText: string;
  navigate: (s: Screen) => void; children: React.ReactNode;
}) {
  const { pal } = useTheme();
  const { t } = useI18n();
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: 20, gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <BigButton onClick={() => navigate("main")} style={{ minWidth: 120 }}>
          <ArrowLeft size={22} /> {t("back")}
        </BigButton>
        <h1 style={{ color: pal.text, fontSize: 26, fontWeight: 800, margin: 0, flex: 1 }}>
          {t(titleKey)}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot level={level} size={16} />
          <span style={{ color: pal.textSub, fontSize: 17, fontWeight: 600 }}>{statusText}</span>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

/** 진단 화면들이 공통으로 쓰는 장비 상태 요약 */
function useDeviceMeta(sourceId: string | null) {
  const tele = useTelemetry();
  const map = useMemo(() => bySource(tele.devices), [tele.devices]);
  const info = sourceId ? map.get(sourceId) : undefined;
  return {
    tele, info,
    level: levelOf(info, tele.running),
    labelKey: levelLabelKey(info, tele.running),
  };
}

const MONO = "'JetBrains Mono', monospace";

// ── GPS ───────────────────────────────────────────────────────────────────────
export function GpsDiag({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const { tele, level, labelKey } = useDeviceMeta("gps");

  const sentences = tele.getHistory("gps");
  const gps = useMemo(() => {
    let s = emptyGpsState();
    for (const evt of sentences) {
      if (typeof evt.data === "string") s = applySentence(s, evt.data);
    }
    return s;
  }, [sentences]);

  const big = (label: string, value: string, sub?: string) => (
    <Card style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ color: pal.textMuted, fontSize: 14 }}>{label}</span>
      <span style={{ color: pal.text, fontSize: 34, fontWeight: 800, fontFamily: MONO }}>{value}</span>
      {sub && <span style={{ color: pal.textSub, fontSize: 13 }}>{sub}</span>}
    </Card>
  );

  return (
    <DiagShell titleKey="devGps" level={level} statusText={t(labelKey)} navigate={navigate}>
      <div style={{ flex: 3, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 14 }}>
          {big(t("speed"), gps.speedKmh !== null ? gps.speedKmh.toFixed(1) : "—", "km/h")}
          {big(t("heading"),
            gps.course !== null ? `${courseToCompass(gps.course)}` : "—",
            gps.course !== null ? `${gps.course.toFixed(1)}°` : undefined)}
          {big(t("satellites"),
            gps.satellites !== null ? String(gps.satellites) : "—",
            gps.satellitesInView !== null ? `가시 ${gps.satellitesInView}기` : undefined)}
        </div>
        <Card style={{ padding: "6px 18px" }}>
          <Field label="위도" mono value={gps.lat !== null ? gps.lat.toFixed(6) : "—"} />
          <Field label="경도" mono value={gps.lon !== null ? gps.lon.toFixed(6) : "—"} />
          <Field label="고도" mono value={gps.altitude !== null ? `${gps.altitude.toFixed(1)} m` : "—"} />
          <Field label="HDOP" mono value={gps.hdop !== null ? gps.hdop.toFixed(1) : "—"} />
          <Field label="Fix" value={
            gps.valid ? (gps.fixType === 3 ? "3D Fix" : gps.fixType === 2 ? "2D Fix" : "유효")
              : "없음"} />
        </Card>
      </div>
      <Card style={{ flex: 2, padding: 14, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ color: pal.textMuted, fontSize: 14, marginBottom: 8 }}>수신 NMEA 문장</span>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {sentences.length === 0 && (
            <span style={{ color: pal.textMuted, fontSize: 14 }}>{t("noData")}</span>
          )}
          {sentences.slice(-14).reverse().map((evt, i) => (
            <div key={i} style={{
              color: i === 0 ? pal.text : pal.textMuted, fontFamily: MONO,
              fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              <span style={{ color: pal.textSub }}>{evt.time}</span> {String(evt.data)}
            </div>
          ))}
        </div>
      </Card>
    </DiagShell>
  );
}

// ── LTE / 네트워크 ────────────────────────────────────────────────────────────
export function LteDiag({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const [info, setInfo] = useState<NetInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!inElectron()) {
      setError("브라우저 단독 실행에서는 네트워크 정보를 조회할 수 없습니다 (Electron 실행 시 표시)");
      return;
    }
    setLoading(true);
    try {
      setInfo(await window.ibms!.system.netinfo());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  // 외부(비내부) IPv4 인터페이스가 있으면 정상으로 판단
  const externals = useMemo(() => {
    if (!info) return [];
    const rows: Array<{ name: string; address: string; mac: string; cidr: string | null }> = [];
    for (const [name, addrs] of Object.entries(info.interfaces)) {
      for (const a of addrs ?? []) {
        if (!a.internal && a.family === "IPv4") {
          rows.push({ name, address: a.address, mac: a.mac, cidr: a.cidr });
        }
      }
    }
    return rows;
  }, [info]);

  const level: StatusLevel = !info ? (error ? "error" : "warn") : externals.length ? "ok" : "error";

  return (
    <DiagShell titleKey="devLte" level={level}
      statusText={externals.length ? t("stOk") : info ? "네트워크 없음" : "—"}
      navigate={navigate}>
      <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <Card style={{ padding: "6px 18px" }}>
          <Field label="호스트명" mono value={info?.hostname ?? "—"} />
          <Field label="플랫폼" value={info?.platform ?? "—"} />
          {externals.map((e, i) => (
            <Field key={i} label={e.name} mono value={`${e.address}  (${e.mac})`} />
          ))}
          {info && externals.length === 0 && (
            <Field label="인터페이스" value="활성 IPv4 인터페이스 없음" />
          )}
        </Card>
        <BigButton onClick={() => void refresh()} disabled={loading} style={{ alignSelf: "flex-start" }}>
          <RotateCcw size={20} /> 새로고침
        </BigButton>
        {error && <span style={{ color: "#F5A623", fontSize: 14 }}>{error}</span>}
      </div>
      <Card style={{ flex: 3, padding: 14, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ color: pal.textMuted, fontSize: 14, marginBottom: 8 }}>
          {info?.platform === "win32" ? "ipconfig /all" : "ip addr / ip route"}
        </span>
        <pre style={{
          flex: 1, overflow: "auto", margin: 0, color: pal.textSub,
          fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5,
        }}>
          {info?.raw ?? (loading ? "조회 중..." : "정보 없음")}
        </pre>
      </Card>
    </DiagShell>
  );
}

// ── CAN ───────────────────────────────────────────────────────────────────────
export function CanDiag({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const { tele, info, level, labelKey } = useDeviceMeta("can");
  const frames = tele.getHistory("can");

  // 최근 5초간 프레임 수신율
  const rate = useMemo(() => {
    if (frames.length < 2) return 0;
    const nowTs = frames[frames.length - 1].seconds;
    const recent = frames.filter((f) => nowTs - f.seconds <= 5);
    return recent.length / 5;
  }, [frames]);

  return (
    <DiagShell titleKey="devCan" level={level} statusText={t(labelKey)} navigate={navigate}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 220 }}>
        <Card style={{ padding: "6px 18px" }}>
          <Field label="연결 방식" value={info?.connection ?? "—"} />
          <Field label="상태" value={info?.label ?? t("stOffline")} />
          <Field label="오류 카운터" mono value={String(info?.errors ?? "—")} />
          <Field label="수신율" mono value={`${rate.toFixed(1)} f/s`} />
          <Field label="Baudrate" mono value="250 kbps (J1939)" />
          <Field label="모드" value="listen-only" />
        </Card>
      </div>
      <Card style={{ flex: 2.6, padding: 14, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ color: pal.textMuted, fontSize: 14, marginBottom: 8 }}>수신 프레임</span>
        <div style={{ overflowY: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: pal.textMuted, textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}>시각</th>
                <th style={{ padding: "4px 8px" }}>PGN</th>
                <th style={{ padding: "4px 8px" }}>설명</th>
                <th style={{ padding: "4px 8px" }}>SA</th>
                <th style={{ padding: "4px 8px" }}>데이터</th>
              </tr>
            </thead>
            <tbody>
              {frames.slice(-15).reverse().map((evt, i) => {
                const d = evt.data as CanFrame;
                return (
                  <tr key={i} style={{
                    color: i === 0 ? pal.text : pal.textSub,
                    borderTop: `1px solid ${pal.border}`,
                  }}>
                    <td style={{ padding: "5px 8px", fontFamily: MONO }}>{evt.time}</td>
                    <td style={{ padding: "5px 8px", fontFamily: MONO }}>{d.pgn}</td>
                    <td style={{ padding: "5px 8px" }}>{d.desc || "—"}</td>
                    <td style={{ padding: "5px 8px", fontFamily: MONO }}>{d.sourceAddress}</td>
                    <td style={{ padding: "5px 8px", fontFamily: MONO, whiteSpace: "nowrap" }}>{d.dataHex}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {frames.length === 0 && (
            <p style={{ color: pal.textMuted, fontSize: 14 }}>{t("noData")}</p>
          )}
        </div>
      </Card>
    </DiagShell>
  );
}

// ── OBD ───────────────────────────────────────────────────────────────────────
const DTC_PRESETS = ["P0128", "P0171", "P0300", "U0100", "C1234"];

export function ObdDiag({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const { tele, level, labelKey } = useDeviceMeta("obd");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const dtcs = tele.getHistory("obd").filter((e) => e.kind === "dtc");

  const submit = async (c: string) => {
    if (!c.trim() || busy) return;
    setBusy(true);
    try {
      await tele.send("obd.dtc", { code: c.trim().toUpperCase() });
      setCode("");
    } catch { /* 오류는 상태 점에 반영됨 */ } finally {
      setBusy(false);
    }
  };

  return (
    <DiagShell titleKey="devObd" level={level} statusText={t(labelKey)} navigate={navigate}>
      <Card style={{ flex: 2, padding: 14, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ color: pal.textMuted, fontSize: 14, marginBottom: 8 }}>DTC 이력 (진단 코드)</span>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {dtcs.length === 0 && <span style={{ color: pal.textMuted, fontSize: 14 }}>{t("noData")}</span>}
          {dtcs.slice(-12).reverse().map((evt, i) => {
            const d = evt.data as DtcRecord;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "10px 14px",
                background: pal.bgSecondary, borderRadius: 10,
              }}>
                <span style={{ color: "#E83030", fontFamily: MONO, fontSize: 20, fontWeight: 800 }}>
                  {d.code}
                </span>
                <span style={{ color: pal.textMuted, fontSize: 13, marginLeft: "auto", fontFamily: MONO }}>
                  {evt.time} · {d.origin}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 14, minWidth: 260 }}>
        <Card style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ color: pal.textMuted, fontSize: 14 }}>DTC 수동 조회/입력 (테스트)</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="예: P0128"
            style={{
              height: 52, borderRadius: 10, border: `1px solid ${pal.border}`,
              background: pal.bgSecondary, color: pal.text, padding: "0 16px",
              fontSize: 18, fontFamily: MONO,
            }} />
          <BigButton color="#1A6FE8" onClick={() => void submit(code)} disabled={busy || !code.trim()}>
            <Send size={20} /> 조회
          </BigButton>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DTC_PRESETS.map((p) => (
              <button key={p} onClick={() => void submit(p)}
                style={{
                  padding: "10px 14px", borderRadius: 8, border: `1px solid ${pal.border}`,
                  background: pal.bgCard, color: pal.textSub, fontFamily: MONO,
                  fontSize: 15, cursor: "pointer", minHeight: 44,
                }}>
                {p}
              </button>
            ))}
          </div>
        </Card>
        <span style={{ color: pal.textMuted, fontSize: 12.5, lineHeight: 1.5 }}>
          차량 CAN 은 listen-only 로 연결됩니다. 실제 DTC 는 DM1(PGN 65248) 수신 시 자동 표기되며,
          위 입력은 진단 채널 동작 테스트용입니다.
        </span>
      </div>
    </DiagShell>
  );
}

// ── IP 카메라 ─────────────────────────────────────────────────────────────────
export function CameraDiag({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const [url, setUrl] = useState(() => localStorage.getItem("ibms.cameraUrl") ?? "");
  const [applied, setApplied] = useState(url);
  const [failed, setFailed] = useState(false);

  const apply = () => {
    localStorage.setItem("ibms.cameraUrl", url);
    setFailed(false);
    setApplied(url);
  };

  const level: StatusLevel = applied ? (failed ? "error" : "ok") : "error";

  return (
    <DiagShell titleKey="devCamera" level={level}
      statusText={applied ? (failed ? "연결 실패" : "표시 중") : t("stNotLinked")}
      navigate={navigate}>
      <Card style={{
        flex: 3, display: "flex", alignItems: "center", justifyContent: "center",
        background: "#000", overflow: "hidden", minWidth: 0,
      }}>
        {applied && !failed ? (
          <img
            src={applied}
            alt="IP Camera"
            onError={() => setFailed(true)}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ color: "#666", fontSize: 17 }}>
            {applied ? "카메라 연결 실패 — URL 을 확인하세요" : "카메라 미연동 — 스트림 URL 을 입력하세요"}
          </span>
        )}
      </Card>
      <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 14, minWidth: 280 }}>
        <Card style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ color: pal.textMuted, fontSize: 14 }}>스트림 URL (MJPEG/HTTP)</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.0.64/mjpeg"
            style={{
              height: 52, borderRadius: 10, border: `1px solid ${pal.border}`,
              background: pal.bgSecondary, color: pal.text, padding: "0 14px",
              fontSize: 15, fontFamily: MONO,
            }} />
          <BigButton color="#1A6FE8" onClick={apply} disabled={!url.trim()}>
            <Play size={20} /> 연결
          </BigButton>
        </Card>
        <span style={{ color: pal.textMuted, fontSize: 12.5, lineHeight: 1.5 }}>
          RTSP 전용 카메라는 브라우저에서 직접 표시할 수 없습니다.
          카메라의 MJPEG/HTTP 스냅샷 주소를 사용하세요.
        </span>
      </div>
    </DiagShell>
  );
}

// ── 전광판 ────────────────────────────────────────────────────────────────────
const EFFECTS: Array<{ id: LedEffect; label: string }> = [
  { id: "scroll_left", label: "← 흐름" },
  { id: "scroll_right", label: "흐름 →" },
  { id: "blink", label: "깜빡임" },
  { id: "static", label: "고정" },
];

export function SignDiag({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const { tele, level, labelKey } = useDeviceMeta("led");
  const [text, setText] = useState("");
  const [effect, setEffect] = useState<LedEffect>("scroll_left");
  const [busy, setBusy] = useState(false);

  const latest = tele.latest["led"];
  const cur = latest && latest.kind === "render" ? latest.data as LedRender : null;

  const show = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await tele.send("led.text", { text: text.trim(), effect }); } catch { /* dot 에 반영 */ }
    setBusy(false);
  };
  const clear = async () => {
    setBusy(true);
    try { await tele.send("led.clear"); } catch { /* */ }
    setBusy(false);
  };

  return (
    <DiagShell titleKey="devSign" level={level} statusText={t(labelKey)} navigate={navigate}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {/* 현재 출력 중 문구 미러 */}
        <Card style={{
          background: "#0A0A0A", border: "2px solid #333", height: 150,
          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
        }}>
          {cur?.text ? (
            <span style={{
              color: "#FF8C00", fontFamily: MONO, fontSize: 52, fontWeight: 800,
              whiteSpace: "nowrap", textShadow: "0 0 18px rgba(255,140,0,0.6)",
              animation: cur.effect.startsWith("scroll")
                ? `led-scroll-${cur.effect === "scroll_right" ? "r" : "l"} 8s linear infinite`
                : cur.effect === "blink" ? "led-blink 1s step-start infinite" : undefined,
            }}>
              {cur.text}
            </span>
          ) : (
            <span style={{ color: "#444", fontSize: 17 }}>출력 중인 문구 없음</span>
          )}
          <style>{`
            @keyframes led-scroll-l { from { transform: translateX(60%); } to { transform: translateX(-60%); } }
            @keyframes led-scroll-r { from { transform: translateX(-60%); } to { transform: translateX(60%); } }
            @keyframes led-blink { 50% { opacity: 0; } }
          `}</style>
        </Card>
        <Card style={{ padding: "6px 18px" }}>
          <Field label="현재 문구" value={cur?.text || "—"} />
          <Field label="효과" value={EFFECTS.find((e) => e.id === cur?.effect)?.label ?? cur?.effect ?? "—"} />
        </Card>
        {/* 테스트 송출 */}
        <Card style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ color: pal.textMuted, fontSize: 14 }}>테스트 송출</span>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="전광판에 표시할 문구"
              style={{
                flex: 1, height: 52, borderRadius: 10, border: `1px solid ${pal.border}`,
                background: pal.bgSecondary, color: pal.text, padding: "0 16px", fontSize: 17,
              }} />
            <BigButton color="#1A6FE8" onClick={() => void show()} disabled={busy || !text.trim()}>
              <Send size={20} /> 표시
            </BigButton>
            <BigButton color="#E83030" onClick={() => void clear()} disabled={busy}>
              <Trash2 size={20} /> 지우기
            </BigButton>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {EFFECTS.map((e) => (
              <button key={e.id} onClick={() => setEffect(e.id)}
                style={{
                  flex: 1, minHeight: 46, borderRadius: 8, cursor: "pointer", fontSize: 15,
                  border: `1px solid ${effect === e.id ? pal.accent : pal.border}`,
                  background: effect === e.id ? `${pal.accent}22` : pal.bgCard,
                  color: effect === e.id ? pal.accent : pal.textSub, fontWeight: 600,
                }}>
                {e.label}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </DiagShell>
  );
}

// ── 안내방송 ──────────────────────────────────────────────────────────────────
const AUDIO_PRESETS = [
  "이번 정류장은 강남역입니다.",
  "다음 정류장은 삼성역입니다.",
  "버스가 곧 출발합니다. 손잡이를 잡아주세요.",
  "안내방송 시스템 테스트입니다.",
];

export function AudioDiag({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const { tele, level, labelKey } = useDeviceMeta("audio");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const events = tele.getHistory("audio");

  // 마지막 speak_request 이후 speak_done 이 없으면 재생 중
  const playing = useMemo(() => {
    const last = events[events.length - 1];
    return last?.kind === "speak_request";
  }, [events]);

  const speak = async (message: string) => {
    if (busy) return;
    setBusy(true);
    try { await tele.send("audio.speak", { message }); } catch { /* */ }
    setBusy(false);
  };

  return (
    <DiagShell titleKey="devAudio" level={level}
      statusText={playing ? "재생 중" : t(labelKey)} navigate={navigate}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <Card style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ color: pal.textMuted, fontSize: 14 }}>등록된 안내방송 (터치하면 실제 재생)</span>
          {AUDIO_PRESETS.map((p) => (
            <BigButton key={p} onClick={() => void speak(p)} disabled={busy}
              style={{ justifyContent: "flex-start", fontWeight: 500 }}>
              <Play size={20} color="#00C896" /> {p}
            </BigButton>
          ))}
        </Card>
        <Card style={{ padding: 18, display: "flex", gap: 10 }}>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="직접 입력하여 방송 테스트"
            style={{
              flex: 1, height: 52, borderRadius: 10, border: `1px solid ${pal.border}`,
              background: pal.bgSecondary, color: pal.text, padding: "0 16px", fontSize: 16,
            }} />
          <BigButton color="#1A6FE8" disabled={busy || !custom.trim()}
            onClick={() => { void speak(custom.trim()); setCustom(""); }}>
            <Play size={20} /> 재생
          </BigButton>
        </Card>
      </div>
      <Card style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", minWidth: 260 }}>
        <span style={{ color: pal.textMuted, fontSize: 14, marginBottom: 8 }}>방송 이력</span>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {events.length === 0 && <span style={{ color: pal.textMuted, fontSize: 14 }}>{t("noData")}</span>}
          {events.slice(-12).reverse().map((evt, i) => (
            <div key={i} style={{ fontSize: 13.5, color: i === 0 ? pal.text : pal.textSub }}>
              <span style={{ fontFamily: MONO, color: pal.textMuted }}>{evt.time}</span>
              {" "}
              <span style={{
                color: evt.kind === "speak_done" ? "#00C896" : "#F5A623", fontWeight: 700,
              }}>
                {evt.kind === "speak_done" ? "완료" : "재생"}
              </span>
              {" "}{String((evt.data as { message?: string })?.message ?? "")}
            </div>
          ))}
        </div>
      </Card>
    </DiagShell>
  );
}

// ── NFC ───────────────────────────────────────────────────────────────────────
export function NfcDiag({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const { tele, level, labelKey } = useDeviceMeta("nfc");
  const tags = tele.getHistory("nfc").filter((e) => e.kind === "tag");
  const last = tags[tags.length - 1];
  const lastData = last ? last.data as NfcTag : null;

  // 최근 3초 이내 태그면 "인식됨" 강조
  const [, forceTick] = useState(0);
  const lastAtRef = useRef(0);
  useEffect(() => {
    if (last) lastAtRef.current = Date.now();
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [last]);
  const justTagged = last && Date.now() - lastAtRef.current < 3000;

  return (
    <DiagShell titleKey="devNfc" level={level} statusText={t(labelKey)} navigate={navigate}>
      <Card style={{
        flex: 1.2, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 18,
      }}>
        <div style={{
          width: 130, height: 130, borderRadius: "50%",
          border: `4px solid ${justTagged ? "#00C896" : pal.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: justTagged ? "0 0 40px rgba(0,200,150,0.4)" : undefined,
          transition: "all 0.3s",
        }}>
          <span style={{ fontSize: 44 }}>{justTagged ? "✓" : "💳"}</span>
        </div>
        <span style={{ color: justTagged ? "#00C896" : pal.textMuted, fontSize: 19, fontWeight: 700 }}>
          {justTagged ? "카드 인식됨" : "카드 태그 대기 중"}
        </span>
        {lastData && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: pal.textMuted, fontSize: 13, margin: "0 0 4px" }}>마지막 UID</p>
            <p style={{ color: pal.text, fontFamily: MONO, fontSize: 24, fontWeight: 800, margin: 0 }}>
              {lastData.uidRaw}
            </p>
          </div>
        )}
      </Card>
      <Card style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", minWidth: 260 }}>
        <span style={{ color: pal.textMuted, fontSize: 14, marginBottom: 8 }}>최근 태그</span>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tags.length === 0 && <span style={{ color: pal.textMuted, fontSize: 14 }}>{t("noData")}</span>}
          {tags.slice(-12).reverse().map((evt, i) => {
            const d = evt.data as NfcTag;
            return (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", padding: "9px 4px",
                borderBottom: `1px solid ${pal.border}`,
                color: i === 0 ? pal.text : pal.textSub, fontSize: 13.5,
              }}>
                <span style={{ fontFamily: MONO }}>{d.uidHex}</span>
                <span style={{ fontFamily: MONO, color: pal.textMuted }}>{evt.time}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </DiagShell>
  );
}

// ── 장비 상태 확인 (전체 개요) ────────────────────────────────────────────────
export function AllDevicesDiag({ navigate }: { navigate: (s: Screen) => void }) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const tele = useTelemetry();
  const map = useMemo(() => bySource(tele.devices), [tele.devices]);
  const lteLevel = useLteLevel();

  return (
    <DiagShell titleKey="devAll"
      level={tele.running ? "ok" : "error"}
      statusText={tele.running ? t("stOk") : t("stOffline")}
      navigate={navigate}>
      <div style={{
        flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 14, alignContent: "start",
      }}>
        {UI_DEVICES.map((dev) => {
          const info = dev.source ? map.get(dev.source) : undefined;
          const lv: StatusLevel =
            dev.id === "lte" ? lteLevel
              : dev.id === "camera" ? cameraLevel()
                : levelOf(info, tele.running);
          const sub =
            dev.id === "lte" ? (lv === "ok" ? t("stOk") : t("stError"))
              : dev.id === "camera" ? (lv === "ok" ? t("stOk") : t("stNotLinked"))
                : (info?.label ?? t("stOffline"));
          const Icon = dev.icon;
          return (
            <Card key={dev.id} onClick={() => navigate(dev.screen)}
              style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, minHeight: 130 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon size={26} color={pal.textSub} />
                <span style={{ color: pal.text, fontSize: 17, fontWeight: 700, flex: 1 }}>
                  {t(dev.nameKey)}
                </span>
                <StatusDot level={lv} />
              </div>
              <span style={{ color: pal.textMuted, fontSize: 14 }}>{sub}</span>
              {info && info.errors > 0 && (
                <span style={{ color: "#F5A623", fontSize: 13 }}>오류 {info.errors}건</span>
              )}
            </Card>
          );
        })}
      </div>
    </DiagShell>
  );
}

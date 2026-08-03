/**
 * src/app/screens/drive.tsx
 * =========================
 * 운행 화면 — OSM 슬리피 타일 기반 GIS 지도를 내비게이션처럼 표시한다.
 *
 *   - 현재 GPS 위치가 항상 화면 중앙(버스 마커)에 오도록 지도를 이동
 *   - 진행 방향(heading-up) / 북쪽 고정(north-up) 회전 모드 전환
 *   - 속도·방위·다음 정류장·운행 시간을 오버레이로 표시
 *   - 뒤로 버튼은 화면 이동만 한다. 운행 상태는 App 루트가 들고 있으므로
 *     이 화면을 떠나도 운행은 계속되며, 운행 종료는 확인 팝업을 거친다.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Compass, Gauge, Minus, Navigation, Plus, Square } from "lucide-react";
import { useGpsState } from "@/lib/useGpsState";
import { useAddress } from "@/lib/geocode";
import { courseToCompass } from "@/lib/nmea";
import { useTheme, type OperationState, type Screen } from "../theme";
import { useI18n } from "../i18n";
import { BigButton } from "../ui";

const MONO = "'JetBrains Mono', monospace";
const TILE = 256;
/** GPS fix 이전 기본 중심 (서울시청) */
const FALLBACK = { lat: 37.5665, lon: 126.978 };
const MIN_ZOOM = 13;
const MAX_ZOOM = 19;

const tileUrl = (z: number, x: number, y: number) =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// ── 웹 메르카토르 좌표 변환 ──────────────────────────────────────────────────
function lonToPx(lon: number, z: number): number {
  return ((lon + 180) / 360) * TILE * (1 << z);
}
function latToPx(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * (1 << z);
}

/** 회전 각도를 누적값으로 풀어 359°↔1° 경계에서 한 바퀴 돌지 않게 한다 */
function useSmoothAngle(target: number): number {
  const ref = useRef(target);
  const delta = ((((target - ref.current) % 360) + 540) % 360) - 180;
  ref.current += delta;
  return ref.current;
}

// ── 타일 레이어 ───────────────────────────────────────────────────────────────
function TileLayer({ lat, lon, zoom, rotate, w, h, dark }: {
  lat: number; lon: number; zoom: number; rotate: number;
  w: number; h: number; dark: boolean;
}) {
  const cx = lonToPx(lon, zoom);
  const cy = latToPx(lat, zoom);

  // CSS transform 정밀도를 위해 큰 월드 좌표 대신 앵커 기준 상대 좌표를 쓴다
  const anchorRef = useRef<{ z: number; ax: number; ay: number } | null>(null);
  let a = anchorRef.current;
  if (!a || a.z !== zoom || Math.abs(cx - a.ax) > 20000 || Math.abs(cy - a.ay) > 20000) {
    a = { z: zoom, ax: Math.round(cx), ay: Math.round(cy) };
    anchorRef.current = a;
  }

  // 회전해도 모서리가 비지 않도록 대각선 반지름만큼 타일을 깐다
  const half = Math.sqrt(w * w + h * h) / 2 + TILE / 2;
  const n = 1 << zoom;
  const x0 = Math.floor((cx - half) / TILE);
  const x1 = Math.floor((cx + half) / TILE);
  const y0 = Math.max(0, Math.floor((cy - half) / TILE));
  const y1 = Math.min(n - 1, Math.floor((cy + half) / TILE));

  const tiles = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n; // 경도 방향 래핑
      tiles.push(
        <img
          key={`${zoom}/${tx}/${ty}`}
          src={tileUrl(zoom, wx, ty)}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: tx * TILE - a.ax,
            top: ty * TILE - a.ay,
            width: TILE,
            height: TILE,
          }}
        />,
      );
    }
  }

  return (
    <div style={{
      position: "absolute", left: "50%", top: "50%", width: 0, height: 0,
      transform: `rotate(${rotate}deg)`,
      transition: "transform 0.6s ease",
      // 다크 모드에서는 밝은 OSM 타일을 반전시켜 야간 지도처럼 표시
      filter: dark ? "invert(0.92) hue-rotate(180deg) brightness(0.9) contrast(0.92)" : undefined,
    }}>
      {/* zoom 이 바뀌면 리마운트해서 이동 트랜지션이 튀지 않게 한다 */}
      <div key={zoom} style={{
        position: "absolute", left: 0, top: 0, width: 0, height: 0,
        transform: `translate(${a.ax - cx}px, ${a.ay - cy}px)`,
        transition: "transform 0.95s linear",
      }}>
        {tiles}
      </div>
    </div>
  );
}

// ── 버스 마커 (화면 중앙 고정, 내비게이션 스타일 화살표) ─────────────────────
function BusMarker({ rotate }: { rotate: number }) {
  const { pal } = useTheme();
  return (
    <div style={{
      position: "absolute", left: "50%", top: "50%",
      transform: "translate(-50%, -50%)", pointerEvents: "none",
    }}>
      {/* 위치 정확도 원 */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        width: 92, height: 92, borderRadius: "50%",
        transform: "translate(-50%, -50%)",
        background: `${pal.accent}26`, border: `1.5px solid ${pal.accent}66`,
      }} />
      <svg
        width={54} height={54} viewBox="0 0 54 54"
        style={{
          display: "block",
          transform: `rotate(${rotate}deg)`,
          transition: "transform 0.6s ease",
          filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.45))",
        }}>
        <path
          d="M27 5 L44 45 L27 36 L10 45 Z"
          fill={pal.accent} stroke="#FFFFFF" strokeWidth={3} strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── 운행 화면 ─────────────────────────────────────────────────────────────────
export function DriveScreen({ navigate, op, nextStop, etaSec, onEnd }: {
  navigate: (s: Screen) => void;
  op: OperationState;
  nextStop: string;
  etaSec: number;
  /** 운행 종료 요청 → App 루트가 확인 팝업을 거쳐 종료한다 */
  onEnd: () => void;
}) {
  const { pal, light } = useTheme();
  const { t } = useI18n();
  const gps = useGpsState();
  const { address } = useAddress(gps.lat, gps.lon);

  const hasFix = gps.lat !== null && gps.lon !== null;
  const lat = gps.lat ?? FALLBACK.lat;
  const lon = gps.lon ?? FALLBACK.lon;
  const course = gps.course ?? 0;

  const [zoom, setZoom] = useState(17);
  /** true = 진행 방향이 위 (heading-up), false = 북쪽 고정 */
  const [headingUp, setHeadingUp] = useState(true);

  const mapRotate = useSmoothAngle(headingUp ? -course : 0);
  const markerRotate = useSmoothAngle(headingUp ? 0 : course);

  // 지도 영역 크기 측정
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1366, h: 714 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const mm = Math.floor(etaSec / 60);
  const ss = etaSec % 60;
  const speed = gps.speedKmh !== null ? Math.round(gps.speedKmh) : null;

  const panelBg = light ? "rgba(255,255,255,0.93)" : "rgba(10,15,30,0.90)";
  const panel = {
    background: panelBg,
    border: `1px solid ${pal.border}`,
    borderRadius: 14,
    boxShadow: "0 6px 24px rgba(0,0,0,0.28)",
  } as const;

  /** 지도 위 원형 컨트롤 버튼 */
  const roundBtn = (label: ReactNode, onClick: () => void, active = false) => (
    <button
      onClick={onClick}
      style={{
        width: 62, height: 62, borderRadius: "50%", cursor: "pointer",
        border: `1px solid ${active ? pal.accent : pal.border}`,
        background: active ? `${pal.accent}33` : panelBg,
        color: active ? pal.accent : pal.text,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
      }}>
      {label}
    </button>
  );

  return (
    <div ref={boxRef} style={{
      position: "relative", height: "100%", overflow: "hidden",
      background: light ? "#DCE6F5" : "#0A0F1E",
    }}>
      {/* 지도 */}
      <TileLayer lat={lat} lon={lon} zoom={zoom} rotate={mapRotate}
        w={size.w} h={size.h} dark={!light} />
      <BusMarker rotate={markerRotate} />

      {/* 좌상단: 뒤로 (운행 유지) */}
      <div style={{
        position: "absolute", top: 16, left: 16,
        display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start",
      }}>
        <BigButton onClick={() => navigate("main")}
          style={{ ...panel, minWidth: 150, fontSize: 19 }}>
          <ArrowLeft size={24} /> {t("back")}
        </BigButton>
        <span style={{
          ...panel, padding: "5px 12px", borderRadius: 10,
          color: "#00C896", fontSize: 13.5, fontWeight: 700,
        }}>
          ● {t("opContinueHint")}
        </span>
      </div>

      {/* 상단 중앙: 다음 정류장 + ETA */}
      <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
        ...panel, padding: "12px 30px", display: "flex", alignItems: "center", gap: 20,
        maxWidth: "56%",
      }}>
        <Navigation size={30} color={pal.accent} style={{ flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: pal.textMuted, fontSize: 13.5 }}>{t("nextStop")}</span>
          <span style={{ color: pal.text, fontSize: 30, fontWeight: 800, whiteSpace: "nowrap" }}>
            {nextStop}
          </span>
        </div>
        <span style={{ color: "#00C896", fontSize: 21, fontWeight: 800, fontFamily: MONO, whiteSpace: "nowrap" }}>
          {op.active ? `${mm}:${String(ss).padStart(2, "0")}` : "—"}
        </span>
      </div>

      {/* 우상단: 운행 상태 + 경과 시간 + 노선 */}
      <div style={{
        position: "absolute", top: 16, right: 16,
        ...panel, padding: "10px 20px",
        display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end",
      }}>
        <span style={{ color: "#00C896", fontSize: 15, fontWeight: 800 }}>
          ● {t("operating")} · {op.route}번
        </span>
        <span style={{ color: pal.text, fontSize: 24, fontWeight: 800, fontFamily: MONO }}>
          {fmt(elapsed)}
        </span>
      </div>

      {/* 우측: 줌 / 회전 모드 */}
      <div style={{
        position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {roundBtn(<Plus size={28} />, () => setZoom((z) => Math.min(MAX_ZOOM, z + 1)))}
        {roundBtn(<Minus size={28} />, () => setZoom((z) => Math.max(MIN_ZOOM, z - 1)))}
        {roundBtn(<Compass size={28} />, () => setHeadingUp((v) => !v), headingUp)}
      </div>
      <span style={{
        position: "absolute", right: 16, top: "50%", transform: "translate(0, 118px)",
        ...panel, padding: "4px 10px", borderRadius: 8,
        color: pal.textSub, fontSize: 12.5, fontWeight: 700,
      }}>
        {headingUp ? t("headingUp") : t("northUp")}
      </span>

      {/* 좌하단: 속도계 */}
      <div style={{
        position: "absolute", left: 16, bottom: 16,
        ...panel, padding: "14px 24px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <Gauge size={34} color={pal.accent} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ color: pal.text, fontSize: 52, fontWeight: 900, fontFamily: MONO, lineHeight: 1 }}>
            {speed ?? "—"}
          </span>
          <span style={{ color: pal.textMuted, fontSize: 17, fontWeight: 700 }}>km/h</span>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: pal.border }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: pal.textMuted, fontSize: 13 }}>{t("heading")}</span>
          <span style={{ color: pal.text, fontSize: 22, fontWeight: 800 }}>
            {courseToCompass(gps.course)}
          </span>
        </div>
      </div>

      {/* 하단 중앙: 현재 주소 */}
      <div style={{
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
        ...panel, padding: "10px 26px", maxWidth: "46%",
      }}>
        <span style={{
          color: pal.text, fontSize: 18, fontWeight: 700,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          display: "block",
        }}>
          {hasFix ? (address ?? t("addrResolving")) : t("gpsWaiting")}
        </span>
      </div>

      {/* 우하단: 운행 종료 (확인 팝업을 거친다) */}
      <BigButton color="#E83030" onClick={onEnd}
        style={{
          position: "absolute", right: 16, bottom: 16,
          minWidth: 170, fontSize: 19,
          background: light ? "rgba(232,48,48,0.14)" : "rgba(232,48,48,0.2)",
          boxShadow: "0 6px 24px rgba(0,0,0,0.28)",
        }}>
        <Square size={22} /> {t("endOp")}
      </BigButton>

      {/* GPS 미수신 안내 */}
      {!hasFix && (
        <div style={{
          position: "absolute", top: 96, left: "50%", transform: "translateX(-50%)",
          background: "#F5A62322", border: "1px solid #F5A623", borderRadius: 12,
          padding: "8px 18px", color: "#F5A623", fontSize: 15, fontWeight: 700,
          whiteSpace: "nowrap",
        }}>
          {t("gpsFallback")}
        </div>
      )}

      {/* OSM 저작권 표기 */}
      <span style={{
        position: "absolute", right: 6, bottom: 2,
        color: light ? "rgba(13,21,52,0.55)" : "rgba(226,232,245,0.45)",
        fontSize: 11,
      }}>
        © OpenStreetMap contributors
      </span>
    </div>
  );
}

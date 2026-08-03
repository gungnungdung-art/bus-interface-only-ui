/**
 * src/app/ui.tsx
 * ==============
 * 공용 UI 컴포넌트 — 카드, 상태 점, 큰 터치 버튼, 토글, 확인 팝업.
 * 14인치 터치 디스플레이 기준이므로 터치 타깃은 최소 48px 이상으로 잡는다.
 */
import type { ReactNode, CSSProperties } from "react";
import { STATUS_COLOR, type StatusLevel, useTheme } from "./theme";
import { useI18n } from "./i18n";

// ── 카드 ──────────────────────────────────────────────────────────────────────
export function Card({ children, style, onClick }: {
  children: ReactNode; style?: CSSProperties; onClick?: () => void;
}) {
  const { pal } = useTheme();
  return (
    <div
      onClick={onClick}
      style={{
        background: pal.bgCard,
        border: `1px solid ${pal.border}`,
        borderRadius: 12,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}>
      {children}
    </div>
  );
}

// ── 상태 점 (3색) ─────────────────────────────────────────────────────────────
export function StatusDot({ level, size = 14 }: { level: StatusLevel; size?: number }) {
  const color = STATUS_COLOR[level];
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: color, boxShadow: `0 0 ${size / 2}px ${color}`,
      flexShrink: 0,
    }} />
  );
}

// ── 큰 터치 버튼 ──────────────────────────────────────────────────────────────
export function BigButton({ children, onClick, color, disabled, style }: {
  children: ReactNode; onClick?: () => void; color?: string;
  disabled?: boolean; style?: CSSProperties;
}) {
  const { pal } = useTheme();
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 56,
        padding: "12px 20px",
        borderRadius: 12,
        border: `1px solid ${color ?? pal.border}`,
        background: color ? `${color}22` : pal.bgCard,
        color: color ?? pal.text,
        fontSize: 17,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        ...style,
      }}>
      {children}
    </button>
  );
}

// ── 라벨-값 행 ────────────────────────────────────────────────────────────────
export function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  const { pal } = useTheme();
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: `1px solid ${pal.border}`, gap: 16,
    }}>
      <span style={{ color: pal.textMuted, fontSize: 15, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: pal.text, fontSize: 16, fontWeight: 600, textAlign: "right",
        fontFamily: mono ? "'JetBrains Mono', monospace" : undefined,
        wordBreak: "break-all",
      }}>{value}</span>
    </div>
  );
}

// ── 토글 ──────────────────────────────────────────────────────────────────────
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const { pal } = useTheme();
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 64, height: 34, borderRadius: 17, border: "none", cursor: "pointer",
        background: on ? "#00C896" : pal.bgSecondary,
        position: "relative", transition: "background 0.15s", flexShrink: 0,
      }}>
      <span style={{
        position: "absolute", top: 3, left: on ? 33 : 3,
        width: 28, height: 28, borderRadius: "50%", background: "#fff",
        transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

// ── 슬라이더 ──────────────────────────────────────────────────────────────────
export function Slider({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <input
      type="range" min={min} max={max} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: 220, height: 34, accentColor: "#1A6FE8", cursor: "pointer" }}
    />
  );
}

// ── 확인 팝업 ─────────────────────────────────────────────────────────────────
export interface ConfirmState {
  message: string;
  onConfirm: () => void;
}

export function ConfirmModal({ state, onClose }: {
  state: ConfirmState | null; onClose: () => void;
}) {
  const { pal } = useTheme();
  const { t } = useI18n();
  if (!state) return null;
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: pal.bgCard, border: `1px solid ${pal.border}`,
        borderRadius: 16, padding: "36px 44px", minWidth: 420,
        display: "flex", flexDirection: "column", gap: 28, alignItems: "center",
        boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
      }}>
        <p style={{ color: pal.text, fontSize: 21, fontWeight: 700, margin: 0, textAlign: "center" }}>
          {state.message}
        </p>
        <div style={{ display: "flex", gap: 16 }}>
          <BigButton onClick={onClose} style={{ minWidth: 140 }}>
            {t("cancel")}
          </BigButton>
          <BigButton
            color="#1A6FE8"
            onClick={() => { state.onConfirm(); onClose(); }}
            style={{ minWidth: 140 }}>
            {t("confirm")}
          </BigButton>
        </div>
      </div>
    </div>
  );
}

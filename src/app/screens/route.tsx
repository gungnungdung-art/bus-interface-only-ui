/**
 * src/app/screens/route.tsx
 * =========================
 * 노선 변경 화면. 선택 시 확인 팝업을 거쳐 적용된다.
 */
import { ArrowLeft, Check } from "lucide-react";
import { ROUTES, useTheme, type Screen } from "../theme";
import { useI18n } from "../i18n";
import { BigButton } from "../ui";

export function RouteScreen({ navigate, current, onSelect }: {
  navigate: (s: Screen) => void;
  current: string;
  /** 선택 → App 루트가 확인 팝업을 띄운 뒤 적용 */
  onSelect: (route: string) => void;
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
          {t("changeRoute")}
        </h1>
        <span style={{ color: pal.textSub, fontSize: 17 }}>
          {t("currentRoute")}: <b style={{ color: pal.accent }}>{current}</b>
        </span>
      </div>

      <div style={{
        flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gridAutoRows: 110, gap: 16, alignContent: "start", overflowY: "auto",
      }}>
        {ROUTES.map((r) => {
          const active = r === current;
          return (
            <button key={r} onClick={() => onSelect(r)}
              style={{
                borderRadius: 14, cursor: "pointer",
                border: `2px solid ${active ? pal.accent : pal.border}`,
                background: active ? `${pal.accent}22` : pal.bgCard,
                color: active ? pal.accent : pal.text,
                fontSize: 30, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}>
              {active && <Check size={26} />}
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

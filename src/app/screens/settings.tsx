/**
 * src/app/screens/settings.tsx
 * ============================
 * 설정 화면 — 기존 메뉴 기능을 전부 통합.
 *   일반: 화면 밝기 / 음량 / 라이트·다크 / 자동 로그인 / 언어
 *   테스트: 장비 진단 화면 9종 진입 (GPS ~ 장비 상태 확인)
 */
import { useState } from "react";
import { ArrowLeft, LayoutGrid, LogOut, Settings as SettingsIcon, TestTube } from "lucide-react";
import { useSettings, useTheme, type Screen } from "../theme";
import { useI18n } from "../i18n";
import { BigButton, Card, Slider, Toggle } from "../ui";
import { UI_DEVICES } from "../devices";

export function SettingsScreen({ navigate, onLogout }: {
  navigate: (s: Screen) => void;
  onLogout: () => void;
}) {
  const { pal } = useTheme();
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [tab, setTab] = useState<"general" | "test">("general");

  const row = (label: string, control: React.ReactNode, sub?: string) => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "18px 22px", borderBottom: `1px solid ${pal.border}`, gap: 20, minHeight: 72,
    }}>
      <div>
        <p style={{ color: pal.text, fontSize: 17, fontWeight: 600, margin: 0 }}>{label}</p>
        {sub && <p style={{ color: pal.textMuted, fontSize: 13, margin: "4px 0 0" }}>{sub}</p>}
      </div>
      {control}
    </div>
  );

  const segBtn = (active: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{
      minHeight: 46, padding: "0 22px", borderRadius: 10, cursor: "pointer",
      border: `1px solid ${active ? pal.accent : pal.border}`,
      background: active ? `${pal.accent}22` : pal.bgCard,
      color: active ? pal.accent : pal.textSub, fontSize: 16, fontWeight: 700,
    }}>
      {label}
    </button>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: 20, gap: 16 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <BigButton onClick={() => navigate("main")} style={{ minWidth: 120 }}>
          <ArrowLeft size={22} /> {t("back")}
        </BigButton>
        <h1 style={{ color: pal.text, fontSize: 26, fontWeight: 800, margin: 0, flex: 1 }}>
          {t("settings")}
        </h1>
        <BigButton color="#E83030" onClick={onLogout}>
          <LogOut size={20} /> {t("logout")}
        </BigButton>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 16 }}>
        {/* 좌측 탭 */}
        <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 12 }}>
          <BigButton
            color={tab === "general" ? pal.accent : undefined}
            onClick={() => setTab("general")}
            style={{ justifyContent: "flex-start", minHeight: 68, fontSize: 18 }}>
            <SettingsIcon size={24} /> {t("general")}
          </BigButton>
          <BigButton
            color={tab === "test" ? pal.accent : undefined}
            onClick={() => setTab("test")}
            style={{ justifyContent: "flex-start", minHeight: 68, fontSize: 18 }}>
            <TestTube size={24} /> {t("test")}
          </BigButton>
        </div>

        {/* 내용 */}
        {tab === "general" ? (
          <Card style={{ flex: 1, overflowY: "auto" }}>
            {row(t("brightness"),
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Slider value={settings.brightness} min={30} max={100}
                  onChange={(v) => update({ brightness: v })} />
                <span style={{ color: pal.text, fontSize: 16, fontWeight: 700, width: 52, textAlign: "right" }}>
                  {settings.brightness}%
                </span>
              </div>)}
            {row(t("volume"),
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Slider value={settings.volume} min={0} max={100}
                  onChange={(v) => update({ volume: v })} />
                <span style={{ color: pal.text, fontSize: 16, fontWeight: 700, width: 52, textAlign: "right" }}>
                  {settings.volume}%
                </span>
              </div>)}
            {row(t("themeMode"),
              <div style={{ display: "flex", gap: 10 }}>
                {segBtn(settings.light, t("lightMode"), () => update({ light: true }))}
                {segBtn(!settings.light, t("darkMode"), () => update({ light: false }))}
              </div>)}
            {row(t("autoLogin"),
              <Toggle on={settings.autoLogin} onChange={(v) => update({ autoLogin: v })} />,
            )}
            {row(t("language"),
              <div style={{ display: "flex", gap: 10 }}>
                {segBtn(settings.lang === "ko", "한국어", () => update({ lang: "ko" }))}
                {segBtn(settings.lang === "en", "English", () => update({ lang: "en" }))}
              </div>)}
          </Card>
        ) : (
          <div style={{
            flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14, alignContent: "start", overflowY: "auto",
          }}>
            {UI_DEVICES.map((dev) => {
              const Icon = dev.icon;
              return (
                <BigButton key={dev.id} onClick={() => navigate(dev.screen)}
                  style={{ minHeight: 88, fontSize: 18, justifyContent: "flex-start", padding: "0 24px" }}>
                  <Icon size={26} /> {t(dev.nameKey)}
                </BigButton>
              );
            })}
            <BigButton onClick={() => navigate("diag-all")}
              style={{ minHeight: 88, fontSize: 18, justifyContent: "flex-start", padding: "0 24px" }}>
              <LayoutGrid size={26} /> {t("devAll")}
            </BigButton>
          </div>
        )}
      </div>
    </div>
  );
}

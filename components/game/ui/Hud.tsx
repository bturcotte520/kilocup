"use client";

import type { EngineViewModel } from "@/lib/game/engine/engineTypes";

function formatClock(msRemaining: number) {
  const s = Math.max(0, Math.floor(msRemaining / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function Hud(props: { vm: EngineViewModel; hudMeta?: { stageLabel: string }; layout?: { topPx: number; bottomPx: number } }) {
  const { vm, hudMeta, layout } = props;

  const stageLabel = hudMeta?.stageLabel ?? "";

  const possessionTeamLabel = vm.possession.teamId
    ? vm.possession.teamId === "kilo"
      ? "Kilo"
      : vm.possession.teamId === vm.away.code3
        ? vm.away.name
        : vm.possession.teamId
    : "—";

  const possessionText = vm.possession.teamId
    ? `Poss: ${possessionTeamLabel}${vm.possession.playerName ? ` (${vm.possession.playerName})` : ""}`
    : "Poss: —";

  const topPx = layout?.topPx ?? 0;
  const bottomPx = layout?.bottomPx ?? 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        paddingTop: "var(--rtc-hud-top, 0px)",
        paddingBottom: "var(--rtc-hud-bottom, 0px)",
        boxSizing: "border-box",
      }}
    >
      {/* Top fixed bar (reserved space; does not overlap pitch) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          height: topPx ? `${topPx}px` : "auto",
          paddingTop: "calc(10px + var(--rtc-safe-top))",
          paddingRight: "calc(12px + var(--rtc-safe-right))",
          paddingLeft: "calc(12px + var(--rtc-safe-left))",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "min(880px, calc(100vw - 24px - var(--rtc-safe-left) - var(--rtc-safe-right)))",
            borderRadius: 18,
            background: "linear-gradient(180deg, rgba(10,10,10,0.62), rgba(10,10,10,0.42))",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            padding: "10px 12px",
          }}
        >
          {/* Row 1: stage + clock */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
              {stageLabel ? (
                <div style={{ fontWeight: 950, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.9, fontSize: 12, whiteSpace: "nowrap" }}>
                  {stageLabel}
                </div>
              ) : null}
              {vm.lastEventText ? (
                <div style={{ fontWeight: 950, opacity: 0.92, color: vm.celebrationActive ? "var(--rtc-yellow)" : "rgba(255,255,255,0.94)" }}>
                  {vm.lastEventText}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ opacity: 0.78, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{formatClock(vm.msRemaining)}</div>
            </div>
          </div>

          {/* Row 2: score */}
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 }}>
            <TeamChip side="HOME" name={vm.home.name} code3={vm.home.code3} flag={vm.home.flag} kit={vm.home.kit} />
            <div style={{ fontWeight: 1000, fontSize: 24, fontVariantNumeric: "tabular-nums", letterSpacing: 1 }}>
              {vm.score.home}–{vm.score.away}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <TeamChip side="AWAY" name={vm.away.name} code3={vm.away.code3} flag={vm.away.flag} kit={vm.away.kit} />
            </div>
          </div>

          {/* Row 3: possession/control */}
          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 12, opacity: 0.84, fontSize: 12 }}>
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Ctrl: <span style={{ fontWeight: 900 }}>{vm.controlledPlayerName}</span>
            </div>
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{possessionText}</div>
          </div>
        </div>
      </div>

      {/* Center overlay (paused) */}
      {vm.paused ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.92)",
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: "uppercase",
            textShadow: "0 10px 30px rgba(0,0,0,0.55)",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
            }}
          >
            Paused
          </div>
        </div>
      ) : null}

      {/* Bottom fixed bar (reserved space; does not overlap pitch) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: bottomPx ? `${bottomPx}px` : "auto",
          paddingBottom: "calc(10px + var(--rtc-safe-bottom))",
          paddingRight: "calc(12px + var(--rtc-safe-right))",
          paddingLeft: "calc(12px + var(--rtc-safe-left))",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "min(920px, calc(100vw - 24px - var(--rtc-safe-left) - var(--rtc-safe-right)))",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.38)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
            padding: "8px 10px",
            fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            color: "rgba(255,255,255,0.82)",
            fontSize: 12,
            lineHeight: 1.25,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>Move: WASD/Arrows or LS</span>
            <span>•</span>
            <span>Action: Shift/A (tap=nearest to pointed direction; hold=farther)</span>
            <span>•</span>
            <span>Sprint: C/LB</span>
            <span>•</span>
            <span>Shoot: Space/B (hold+release)</span>
            <span>•</span>
            <span>Pause: Esc</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamChip(props: {
  side: "HOME" | "AWAY";
  name: string;
  code3: string;
  flag: string;
  kit: { primary: string; secondary: string };
}) {
  const { side, name, code3, flag, kit } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
          {flag}
        </span>
        <span style={{ fontWeight: 950, letterSpacing: 0.8 }}>{code3}</span>
        <span style={{ opacity: 0.9, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 950,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            opacity: 0.78,
          }}
        >
          {side === "HOME" ? "Kilo" : "Opponent"}
        </span>

        <div style={{ display: "flex", gap: 6 }}>
          <Swatch color={kit.primary} />
          <Swatch color={kit.secondary} />
        </div>
      </div>
    </div>
  );
}

function Swatch(props: { color: string }) {
  return (
    <span
      aria-hidden="true"
      title={props.color}
      style={{
        width: 10,
        height: 10,
        borderRadius: 3,
        background: props.color,
        border: "1px solid rgba(255,255,255,0.25)",
        display: "inline-block",
      }}
    />
  );
}
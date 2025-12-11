import type { EngineState, Vec2 } from "../engine/engineTypes";
import { clamp } from "../math/vec2";
import { GOAL_CROWD_PULSE_MS } from "../vfx/goalVfx";

type Viewport = { w: number; h: number };
type PitchTransform = { scale: number; ox: number; oy: number };

type PitchRect = { x: number; y: number; w: number; h: number };

export function renderStadium(args: {
  ctx: CanvasRenderingContext2D;
  engine: EngineState;
  vp: Viewport;
  tr: PitchTransform;
  nowMs: number;
}) {
  const { ctx, engine, vp, tr, nowMs } = args;
  const { pitchW, pitchH } = engine.config;

  const pitchRect: PitchRect = {
    x: tr.ox,
    y: tr.oy,
    w: pitchW * tr.scale,
    h: pitchH * tr.scale,
  };

  drawSky(ctx, vp, nowMs);

  // "Crowd pulse" on goal: renderer-only amplification based on VFX timer.
  const crowdPulse = clamp(engine.vfx.goal.crowdPulseMs / GOAL_CROWD_PULSE_MS, 0, 1);

  // Camera isn't fully implemented in this project yet; use a stable "anchor" so
  // parallax will still react naturally to play.
  const cam = getCameraAnchor(engine);
  const camPx = { x: cam.x * tr.scale, y: cam.y * tr.scale };

  // Instead of a “horizon band” crowd (which reads wrong in an overhead camera),
  // draw stands that surround the pitch: top/bottom/left/right.
  drawStandsAroundPitch({
    ctx,
    vp,
    nowMs,
    pitchRect,
    camPx,
    crowdPulse,
  });

  // Subtle vignette outside the pitch to keep entities/pitch contrast high.
  drawPitchVignette(ctx, vp, pitchRect);
}

function getCameraAnchor(engine: EngineState): Vec2 {
  const m = engine.match;

  // Prefer the ball (always "relevant"), but bias slightly toward the controlled player.
  const controlled = m.playersById[m.controlledPlayerId];
  const p = controlled?.pos ?? m.ball.pos;

  return {
    x: m.ball.pos.x * 0.7 + p.x * 0.3,
    y: m.ball.pos.y * 0.7 + p.y * 0.3,
  };
}

function drawSky(ctx: CanvasRenderingContext2D, vp: Viewport, nowMs: number) {
  const g = ctx.createLinearGradient(0, 0, 0, vp.h);
  g.addColorStop(0, "#081B2D");
  g.addColorStop(0.52, "#0C2B44");
  g.addColorStop(1, "#070D14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vp.w, vp.h);

  // Subtle "stadium light band"
  const t = (Math.sin(nowMs / 2200) + 1) * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.05 + t * 0.05;
  ctx.fillStyle = "#7CC6FF";
  ctx.fillRect(0, vp.h * 0.07, vp.w, vp.h * 0.16);
  ctx.restore();

  // Ultra-light noise stars (cheap): few fixed dots
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 40; i++) {
    const rx = hash01(1000 + i * 11.7);
    const ry = hash01(2000 + i * 17.1);
    const r = 0.6 + hash01(3000 + i * 3.3) * 0.9;
    ctx.fillRect(rx * vp.w, ry * vp.h * 0.35, r, r);
  }
  ctx.restore();
}

function drawPitchVignette(ctx: CanvasRenderingContext2D, vp: Viewport, pr: PitchRect) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0,0,0,0.35)";

  // Top
  ctx.fillRect(0, 0, vp.w, Math.max(0, pr.y - 2));
  // Bottom
  ctx.fillRect(0, pr.y + pr.h + 2, vp.w, Math.max(0, vp.h - (pr.y + pr.h + 2)));
  // Left
  ctx.fillRect(0, pr.y - 2, Math.max(0, pr.x - 2), pr.h + 4);
  // Right
  ctx.fillRect(pr.x + pr.w + 2, pr.y - 2, Math.max(0, vp.w - (pr.x + pr.w + 2)), pr.h + 4);

  // Edge feather (inside pitch border only)
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 18;
  ctx.strokeRect(pr.x + 8, pr.y + 8, pr.w - 16, pr.h - 16);

  ctx.restore();
}

function drawStandsAroundPitch(args: {
  ctx: CanvasRenderingContext2D;
  vp: Viewport;
  nowMs: number;
  pitchRect: PitchRect;
  camPx: { x: number; y: number };
  crowdPulse: number;
}) {
  const { ctx, vp, nowMs, pitchRect, camPx, crowdPulse } = args;

  const pad = 10;

  // Available outer regions
  const topH = Math.max(0, pitchRect.y - pad);
  const bottomH = Math.max(0, vp.h - (pitchRect.y + pitchRect.h) - pad);
  const leftW = Math.max(0, pitchRect.x - pad);
  const rightW = Math.max(0, vp.w - (pitchRect.x + pitchRect.w) - pad);

  // Parallax drift for the *crowd texture*, not the pitch transform (keeps the game framing stable).
  const driftX = -camPx.x * 0.028;
  const driftY = -camPx.y * 0.02;

  // Base “concourse” shading so it reads as stands, not sky.
  ctx.save();
  ctx.globalAlpha = 0.95;
  const g = ctx.createRadialGradient(vp.w * 0.5, vp.h * 0.5, Math.min(vp.w, vp.h) * 0.2, vp.w * 0.5, vp.h * 0.5, Math.max(vp.w, vp.h) * 0.8);
  g.addColorStop(0, "rgba(2,6,14,0)");
  g.addColorStop(0.55, "rgba(2,6,14,0.12)");
  g.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vp.w, vp.h);
  ctx.restore();

  // Draw a stand region with clipping so parallax drift never leaves empty gaps at the edges.
  const drawStandRegion = (x: number, y: number, w: number, h: number, seed: number, orient: "H" | "V") => {
    if (w <= 2 || h <= 2) return;

    ctx.save();
    // Clip to the stand region (prevents drift from revealing uncovered pixels)
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // Base concourse gradient (no “random lines”; just a readable stand surface)
    if (orient === "H") {
      const base = ctx.createLinearGradient(0, y, 0, y + h);
      base.addColorStop(0, "rgba(0,0,0,0.58)");
      base.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = base;
    } else {
      const base = ctx.createLinearGradient(x, 0, x + w, 0);
      base.addColorStop(0, "rgba(0,0,0,0.58)");
      base.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = base;
    }
    ctx.fillRect(x, y, w, h);

    // Overhead bleachers: alternating horizontal/vertical rows depending on stand orientation.
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(255,255,255,0.20)";
    const rowStep = clamp(Math.min(w, h) * 0.08, 12, 22);
    const rows = Math.ceil((orient === "H" ? h : w) / rowStep);
    for (let i = 0; i < rows; i++) {
      if (i % 2 === 0) continue;
      if (orient === "H") {
        ctx.fillRect(x, y + i * rowStep, w, Math.max(2, rowStep * 0.32));
      } else {
        ctx.fillRect(x + i * rowStep, y, Math.max(2, rowStep * 0.32), h);
      }
    }
    ctx.restore();

    // 3D-looking stadium "levels": split each stand region into tiers, with per-tier shading and
    // slightly different parallax (near tier drifts more than far tier).
    const isTop = orient === "H" ? y < pitchRect.y : false;
    const isLeft = orient === "V" ? x < pitchRect.x : false;

    // NOTE: Keep tier geometry visually stable. Any motion should come from the crowd itself,
    // not tier-relative translations (which read like the “levels” are sliding).

    const tierCount = 3;
    const tierGap = clamp(Math.min(w, h) * 0.06, 6, 14);
    const axisLen = orient === "H" ? h : w;
    const usable = Math.max(0, axisLen - tierGap * (tierCount - 1));

    // Inner -> outer (closest to pitch first)
    const fracs = [0.4, 0.34, 0.26];
    const tierSizes = fracs.map((f) => usable * f);

    type TierRect = { x: number; y: number; w: number; h: number };
    const tiers: TierRect[] = [];

    {
      let acc = 0;
      for (let i = 0; i < tierCount; i++) {
        const size = tierSizes[i];
        if (orient === "H") {
          const yy = isTop ? y + h - acc - size : y + acc;
          tiers.push({ x, y: yy, w, h: size });
        } else {
          const xx = isLeft ? x + w - acc - size : x + acc;
          tiers.push({ x: xx, y, w: size, h });
        }
        acc += size + tierGap;
      }
    }

    // Tier surface shading (gives depth cues even in overhead)
    for (let i = 0; i < tiers.length; i++) {
      const trr = tiers[i];

      ctx.save();
      ctx.beginPath();
      ctx.rect(trr.x, trr.y, trr.w, trr.h);
      ctx.clip();

      // Farther tiers slightly darker / cooler.
      ctx.globalAlpha = 0.14 + i * 0.06;
      ctx.fillStyle = i === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.18)";
      ctx.fillRect(trr.x, trr.y, trr.w, trr.h);

      // Divider visuals are handled as explicit "balcony" rails in the tier gaps below.

      ctx.restore();
    }

    // Crowd per tier. Keep the translation the same per tier so tier breaks look stable/clean.
    // Depth is communicated via tier shading + slightly different crowd palette per tier.
    const tierColors: [string, string][] = [
      ["#BFC9D6", "#7F8E9E"], // near (brighter)
      ["#A7B2C2", "#6C7A8A"], // mid
      ["#8B97A6", "#586575"], // far (darker)
    ];

    for (let i = 0; i < tiers.length; i++) {
      const trr = tiers[i];

      ctx.save();
      ctx.beginPath();
      ctx.rect(trr.x, trr.y, trr.w, trr.h);
      ctx.clip();

      // Same drift for all tiers: prevents the “levels are sliding” look.
      ctx.translate(driftX, driftY);

      drawCrowd(ctx, {
        x: trr.x - 90,
        y: trr.y - 90,
        w: trr.w + 180,
        h: trr.h + 180,
        nowMs,
        density: 0.92,
        waveAmp: 2.0 - i * 0.25,
        bounceAmp: 1.9 - i * 0.25,
        colors: tierColors[i] ?? ["#C8D0DB", "#8793A1"],
        sparkleRate: 0.65,
        seed: seed + i * 97,
        pulse: crowdPulse,
      });

      ctx.restore();
    }

    // Balcony rails between tiers (medium-light grey) with cutout openings.
    // These live in the tierGap bands, which reads as "3D levels" from overhead.
    for (let i = 0; i < tiers.length - 1; i++) {
      const a = tiers[i];
      const b = tiers[i + 1];

      // gap strip location depends on whether tiers stack "toward" or "away" from pitch
      const gx =
        orient === "V"
          ? (isLeft ? b.x + b.w : a.x + a.w)
          : a.x;
      const gy =
        orient === "H"
          ? (isTop ? b.y + b.h : a.y + a.h)
          : a.y;

      const gw = orient === "V" ? tierGap : a.w;
      const gh = orient === "H" ? tierGap : a.h;

      if (gw <= 2 || gh <= 2) continue;

      ctx.save();
      ctx.beginPath();
      ctx.rect(gx, gy, gw, gh);
      ctx.clip();

      // Solid balcony band (the "divider")
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#9FA9B7"; // medium-light grey
      ctx.fillRect(gx, gy, gw, gh);

      // Top highlight + bottom shadow to make it read like a ledge
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      if (orient === "H") {
        const yTop = Math.round(gy) + 0.5;
        ctx.beginPath();
        ctx.moveTo(gx + 4, yTop);
        ctx.lineTo(gx + gw - 4, yTop);
        ctx.stroke();

        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        const yBot = Math.round(gy + gh) + 0.5;
        ctx.beginPath();
        ctx.moveTo(gx + 4, yBot);
        ctx.lineTo(gx + gw - 4, yBot);
        ctx.stroke();
      } else {
        const xTop = Math.round(gx) + 0.5;
        ctx.beginPath();
        ctx.moveTo(xTop, gy + 4);
        ctx.lineTo(xTop, gy + gh - 4);
        ctx.stroke();

        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        const xBot = Math.round(gx + gw) + 0.5;
        ctx.beginPath();
        ctx.moveTo(xBot, gy + 4);
        ctx.lineTo(xBot, gy + gh - 4);
        ctx.stroke();
      }

      // Cutout openings (balcony shapes)
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(0,0,0,0.30)";

      if (orient === "H") {
        const step = clamp(gw * 0.09, 46, 84);
        const holeW = step * 0.62;
        const holeH = gh * 0.62;
        const yy = gy + (gh - holeH) * 0.55;

        for (let k = 0; k < Math.floor(gw / step); k++) {
          const xx = gx + step * (k + 0.5) - holeW * 0.5;
          ctx.fillRect(Math.round(xx), Math.round(yy), Math.round(holeW), Math.round(holeH));
        }
      } else {
        const step = clamp(gh * 0.09, 46, 84);
        const holeH = step * 0.62;
        const holeW = gw * 0.62;
        const xx = gx + (gw - holeW) * 0.55;

        for (let k = 0; k < Math.floor(gh / step); k++) {
          const yy = gy + step * (k + 0.5) - holeH * 0.5;
          ctx.fillRect(Math.round(xx), Math.round(yy), Math.round(holeW), Math.round(holeH));
        }
      }

      ctx.restore();
    }

    // Scattered host-color decor (streamers + flags). Keep it sparse and high-contrast.
    // Draw AFTER crowd so it doesn't read like faded texture.
    const streamColors = [
      "#B22234", // USA red
      "#3C3B6E", // USA blue
      "#006847", // Mexico green
      "#CE1126", // Mexico red
      "#D80621", // Canada red
      "#FFFFFF", // white
    ] as const;

    // Streamers: a few short curved ribbons scattered in the stands.
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.lineCap = "round";

    const area = w * h;
    const nStream = Math.floor(clamp(area / 75000, 0.7, 1.2) * 5); // slightly fewer than before
    const baseLineW = clamp(Math.min(w, h) * 0.06, 3.5, 7);

    // Make them pop over the crowd.
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 2;

    const t0 = nowMs / 1000;

    for (let i = 0; i < nStream; i++) {
      const rx = hash01(seed * 501 + i * 13.7);
      const ry = hash01(seed * 809 + i * 9.1);

      const x0 = x + rx * w;
      const y0 = y + ry * h;

      const len = clamp(Math.min(w, h) * (0.22 + hash01(seed * 120 + i * 4.1) * 0.18), 20, 54);
      const ang = (hash01(seed * 777 + i * 8.3) - 0.5) * Math.PI * 1.2;

      // Gentle movement: tiny side-to-side flutter (overhead-safe; doesn't become “moving scratches”).
      const flutter = Math.sin(t0 * 1.35 + i * 1.7 + seed * 0.02) * 2.4;

      const x1 = x0 + Math.cos(ang) * len - Math.sin(ang) * flutter;
      const y1 = y0 + Math.sin(ang) * len + Math.cos(ang) * flutter;

      // Slight curve so they read as “streamers” instead of straight scratches.
      const bendBase = (hash01(seed * 900 + i * 6.9) - 0.5) * len * 0.6;
      const bend = bendBase + Math.sin(t0 * 1.15 + i * 2.3 + seed * 0.01) * 3.0;

      const mx = (x0 + x1) * 0.5 - Math.sin(ang) * bend;
      const my = (y0 + y1) * 0.5 + Math.cos(ang) * bend;

      ctx.strokeStyle = streamColors[i % streamColors.length];
      ctx.lineWidth = baseLineW * (0.75 + hash01(seed * 333 + i * 2.2) * 0.75);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx, my, x1, y1);
      ctx.stroke();
    }
    ctx.restore();

    // Flags: a handful of larger emojis scattered (not repeated in a row).
    ctx.save();
    ctx.globalAlpha = 1.0;
    const flags = ["🇺🇸", "🇲🇽", "🇨🇦"] as const;

    const fontPx = Math.floor(clamp(Math.min(w, h) * 0.34, 14, 22));
    ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Make them pop (un-faded) against dark stands.
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = 3;

    const nFlags = Math.floor(clamp(area / 120000, 0.6, 1.2) * 3); // fewer than before
    for (let i = 0; i < nFlags; i++) {
      const rx = hash01(seed * 1400 + i * 17.3);
      const ry = hash01(seed * 1700 + i * 21.1);

      const xx = x + rx * w;
      const yy = y + ry * h;

      const rot = (hash01(seed * 1900 + i * 8.7) - 0.5) * 0.5; // subtle tilt
      const f = flags[Math.floor(hash01(seed * 2000 + i * 3.1) * flags.length) % flags.length];

      ctx.save();
      ctx.translate(xx, yy);
      ctx.rotate(rot);
      ctx.fillText(f, 0, 0);
      ctx.restore();
    }

    ctx.restore();

    // Inner lip shadow along the pitch edge (adds “surrounding” structure)
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 10;
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
    ctx.restore();

    ctx.restore();
  };

  // Corner “caps” so the horizontal/vertical shells don’t intersect.
  // These are structural blocks (no balcony rails), to avoid messy overlap artifacts.
  const drawCornerCap = (x: number, y: number, w: number, h: number, seed: number) => {
    if (w <= 2 || h <= 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const base = ctx.createLinearGradient(x, y, x + w, y + h);
    base.addColorStop(0, "rgba(0,0,0,0.62)");
    base.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);

    // A few “support lights” so it reads intentional, not empty.
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    const n = 6;
    for (let i = 0; i < n; i++) {
      const rx = hash01(seed * 11.7 + i * 9.3);
      const ry = hash01(seed * 21.1 + i * 7.9);
      const ww = clamp(w * 0.18, 10, 22);
      const hh = clamp(h * 0.08, 6, 14);
      ctx.fillRect(x + rx * (w - ww), y + ry * (h - hh), ww, hh);
    }

    ctx.restore();
  };

  // “Shell” layout:
  // - Top/bottom stands are inset horizontally so they don't overlap left/right stands
  // - Left/right stands are inset vertically so they don't overlap top/bottom stands
  const midW = Math.max(0, vp.w - leftW - rightW);
  const midH = Math.max(0, vp.h - topH - bottomH);

  // Top / bottom shells (no corner intersection)
  drawStandRegion(leftW, 0, midW, topH, 2101, "H");
  drawStandRegion(leftW, vp.h - bottomH, midW, bottomH, 2207, "H");

  // Left / right shells (no corner intersection)
  drawStandRegion(0, topH, leftW, midH, 2303, "V");
  drawStandRegion(vp.w - rightW, topH, rightW, midH, 2401, "V");

  // Corner caps (structural supports)
  drawCornerCap(0, 0, leftW, topH, 2501);
  drawCornerCap(vp.w - rightW, 0, rightW, topH, 2507);
  drawCornerCap(0, vp.h - bottomH, leftW, bottomH, 2513);
  drawCornerCap(vp.w - rightW, vp.h - bottomH, rightW, bottomH, 2519);

}

function drawStadiumLayer(args: {
  ctx: CanvasRenderingContext2D;
  vp: Viewport;
  nowMs: number;
  pitchRect: PitchRect;
  horizonY: number;

  factor: number;
  camPx: { x: number; y: number };
  parallaxScaleX: number;
  parallaxScaleY: number;

  colors: { base: string; crowdA: string; crowdB: string };
  crowd: { density: number; waveAmp: number; sparkleRate: number; bounceAmp: number };

  banners: boolean;
  silhouettes: boolean;

  crowdPulse: number; // 0..1 goal celebration pulse
}) {
  const {
    ctx,
    vp,
    nowMs,
    pitchRect,
    horizonY,
    factor,
    camPx,
    parallaxScaleX,
    parallaxScaleY,
    colors,
    crowd,
    banners,
    silhouettes,
    crowdPulse,
  } = args;

  const t = nowMs / 1000;
  const sway = Math.sin(t * 0.35 + factor * 6.1) * 2.0;

  const px = -camPx.x * factor * parallaxScaleX + sway;
  const py = -camPx.y * factor * parallaxScaleY + Math.sin(t * 0.22 + factor * 4.3) * 1.2;

  // Layer band geometry (all behind the pitch line)
  const bandX = pitchRect.x - pitchRect.w * (0.26 + factor * 0.12) + px;
  const bandW = pitchRect.w * (1.52 + factor * 0.24);
  const bandTopY = horizonY - pitchRect.h * (0.36 - factor * 0.1) + py;
  const bandH = pitchRect.h * (0.2 + factor * 0.05);

  // Bowl / fascia trapezoid
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = colors.base;
  ctx.beginPath();
  ctx.moveTo(bandX, bandTopY + bandH);
  ctx.lineTo(bandX + bandW, bandTopY + bandH);
  ctx.lineTo(bandX + bandW - 26, bandTopY);
  ctx.lineTo(bandX + 26, bandTopY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Optional: host silhouettes in the far layer
  if (silhouettes) {
    const s = clamp(pitchRect.w / 820, 0.75, 1.35);
    const baseY = horizonY + py - 6;
    drawHostSilhouettes(ctx, {
      x: pitchRect.x + pitchRect.w * 0.5 + px,
      y: baseY,
      scale: s,
      alpha: 0.32,
    });
  }

  // Crowd "pixels" (cheap rectangles) with wave motion + sparkles.
  drawCrowd(ctx, {
    x: bandX + 18,
    y: bandTopY + 8,
    w: bandW - 36,
    h: bandH - 16,
    nowMs,
    density: crowd.density,
    waveAmp: crowd.waveAmp * (0.7 + factor),
    bounceAmp: crowd.bounceAmp * (0.65 + factor),
    colors: [colors.crowdA, colors.crowdB],
    sparkleRate: crowd.sparkleRate,
    seed: Math.floor(factor * 1000),
    pulse: crowdPulse,
  });

  // Ribbons
  if (banners) {
    const ribbonH = Math.max(8, bandH * 0.14);
    drawRibbon(ctx, {
      x: bandX + bandW * 0.06,
      y: bandTopY + bandH * 0.68,
      w: bandW * 0.88,
      h: ribbonH,
      nowMs,
      seed: 900 + Math.floor(factor * 1000),
      pulse: crowdPulse,
    });
  }

  // Thin shadow under the layer (helps depth separation)
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000000";
  ctx.fillRect(bandX + 20, bandTopY + bandH, bandW - 40, 10);
  ctx.restore();
}

function drawCrowd(
  ctx: CanvasRenderingContext2D,
  args: {
    x: number;
    y: number;
    w: number;
    h: number;
    nowMs: number;
    density: number; // 0..1
    waveAmp: number; // px
    bounceAmp: number; // px
    colors: [string, string];
    sparkleRate: number;
    seed: number;
    pulse: number; // 0..1
  },
) {
  const { x, y, w, h, nowMs, density, waveAmp, bounceAmp, colors, sparkleRate, seed, pulse } = args;

  const t = nowMs / 1000;

  // Seat size tuned so the crowd reads like “tops of heads” from overhead.
  // Make them bigger so it reads as a crowd (not tiny dots).
  const seat = clamp(18 - density * 6, 12, 20);
  const cols = Math.max(1, Math.floor(w / seat));
  const rows = Math.max(1, Math.floor(h / seat));

  ctx.save();
  ctx.globalAlpha = 0.6 + pulse * 0.18;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = c + r * cols;

      const jx = (hash01(seed * 101.3 + i * 3.7) - 0.5) * seat * 0.35;
      const jy = (hash01(seed * 203.9 + i * 5.1) - 0.5) * seat * 0.35;

      const baseX = x + (c + 0.5) * seat + jx;
      const baseY = y + (r + 0.5) * seat + jy;

      const wiggle =
        Math.sin(t * 1.6 + (c * 0.7 + r * 0.9) + seed * 0.01) * (waveAmp * 0.25) +
        Math.max(0, Math.sin(t * 2.2 + i * 0.03 + seed * 0.02)) * (bounceAmp * 0.22);

      const rr = seat * (0.26 + hash01(seed * 17.7 + i * 1.9) * 0.10);

      ctx.fillStyle = (c + r) % 2 === 0 ? colors[0] : colors[1];
      ctx.beginPath();
      ctx.arc(baseX, baseY + wiggle, rr, 0, Math.PI * 2);
      ctx.fill();

      // tiny highlight for depth
      ctx.save();
      ctx.globalAlpha *= 0.18;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(baseX - rr * 0.25, baseY + wiggle - rr * 0.25, rr * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();

  // Sparkles reduced; only a few camera flashes.
  const sparkleN = Math.floor((w * h * 0.00002) * sparkleRate) + 4;
  ctx.save();
  for (let i = 0; i < sparkleN; i++) {
    const rx = hash01(seed * 100 + i * 19.37);
    const ry = hash01(seed * 200 + i * 31.91);
    const px = x + rx * w;
    const py = y + ry * h;

    const s = (Math.sin(nowMs / (130 + (i % 6) * 30) + i * 2.1 + seed) + 1) * 0.5;
    if (s < 0.92) continue;

    ctx.globalAlpha = 0.06 + (s - 0.92) * 0.9;
    ctx.fillStyle = "#ffffff";
    const r0 = 1.0 + (s - 0.92) * 3.2;
    ctx.beginPath();
    ctx.arc(px, py, r0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  args: { x: number; y: number; w: number; h: number; nowMs: number; seed: number; pulse: number },
) {
  const { x, y, w, h, nowMs, seed, pulse } = args;

  // Ribbon "puffs" slightly brighter/taller during crowd pulse.
  const yScale = 1 + pulse * 0.1;

  ctx.save();
  ctx.translate(x + w * 0.5, y + h * 0.5);
  ctx.scale(1, yScale);
  ctx.translate(-w * 0.5, -h * 0.5);

  ctx.globalAlpha = 0.85 + pulse * 0.1;

  // Base band
  ctx.fillStyle = "#111111";
  ctx.fillRect(-w * 0.5, -h * 0.5, w, h);

  // Animated stripe highlight
  const t = nowMs / 1000;
  const slide = ((t * 22 + (seed % 9) * 13) % (w + 60)) - 60;
  ctx.globalAlpha = 0.22 + pulse * 0.1;
  ctx.fillStyle = "#F6C945";
  ctx.fillRect(-w * 0.5 + slide, -h * 0.5, 60, h);
  ctx.globalAlpha = 0.85 + pulse * 0.1;

  // Repeating chevrons in Kilo yellow / black
  const step = Math.max(18, h * 1.6);
  for (let i = -2; i < w / step + 2; i++) {
    const x0 = -w * 0.5 + i * step + ((t * 16) % step);
    ctx.beginPath();
    ctx.moveTo(x0, -h * 0.5);
    ctx.lineTo(x0 + step * 0.6, -h * 0.5);
    ctx.lineTo(x0 + step, -h * 0.5 + h);
    ctx.lineTo(x0 + step * 0.4, -h * 0.5 + h);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? "#F6C945" : "#0A0A0A";
    ctx.fill();
  }

  // Thin border
  ctx.globalAlpha = 0.8 + pulse * 0.12;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-w * 0.5 + 0.5, -h * 0.5 + 0.5, w - 1, h - 1);

  ctx.restore();
}

function drawHostSilhouettes(
  ctx: CanvasRenderingContext2D,
  args: { x: number; y: number; scale: number; alpha: number },
) {
  const { x, y, scale, alpha } = args;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  // Spread across the horizon line: USA left, Mexico center, Canada right
  drawUsa(ctx, { x: -240, y: 0 });
  drawMexico(ctx, { x: -12, y: 6 });
  drawCanada(ctx, { x: 210, y: 0 });

  ctx.restore();
}

function drawUsa(ctx: CanvasRenderingContext2D, at: { x: number; y: number }) {
  ctx.save();
  ctx.translate(at.x, at.y);

  // Skyline blocks
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const buildings = [
    { x: -34, w: 22, h: 34 },
    { x: -10, w: 20, h: 52 },
    { x: 12, w: 16, h: 28 },
    { x: 30, w: 26, h: 44 },
    { x: 58, w: 18, h: 30 },
  ];
  for (const b of buildings) ctx.fillRect(b.x, -b.h, b.w, b.h);

  // Stadium arc/roof silhouette
  ctx.globalAlpha *= 0.95;
  ctx.fillStyle = "rgba(0,0,0,0.68)";
  ctx.beginPath();
  ctx.moveTo(-58, 0);
  ctx.quadraticCurveTo(5, -44, 80, 0);
  ctx.lineTo(62, 0);
  ctx.quadraticCurveTo(5, -28, -40, 0);
  ctx.closePath();
  ctx.fill();

  // Light outline
  ctx.globalAlpha *= 0.65;
  ctx.strokeStyle = "rgba(246,201,69,0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-58, 0);
  ctx.quadraticCurveTo(5, -44, 80, 0);
  ctx.stroke();

  ctx.restore();
}

function drawMexico(ctx: CanvasRenderingContext2D, at: { x: number; y: number }) {
  ctx.save();
  ctx.translate(at.x, at.y);

  // Bowl (Azteca-ish)
  ctx.fillStyle = "rgba(0,0,0,0.66)";
  ctx.beginPath();
  ctx.moveTo(-110, 0);
  ctx.quadraticCurveTo(0, -46, 110, 0);
  ctx.lineTo(92, 0);
  ctx.quadraticCurveTo(0, -30, -92, 0);
  ctx.closePath();
  ctx.fill();

  // Decorative pattern band
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(246,201,69,0.22)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-86, -10);
  ctx.quadraticCurveTo(0, -36, 86, -10);
  ctx.stroke();
  ctx.restore();

  // Small "glyph" ticks
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "rgba(246,201,69,0.25)";
  for (let i = -5; i <= 5; i++) {
    const xx = i * 16;
    ctx.fillRect(xx - 2, -18 - Math.abs(i) * 0.8, 4, 6);
  }
  ctx.restore();

  ctx.restore();
}

function drawCanada(ctx: CanvasRenderingContext2D, at: { x: number; y: number }) {
  ctx.save();
  ctx.translate(at.x, at.y);

  // Mountains (Vancouver vibe)
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.moveTo(-120, 0);
  ctx.lineTo(-70, -26);
  ctx.lineTo(-42, -12);
  ctx.lineTo(-12, -36);
  ctx.lineTo(22, -18);
  ctx.lineTo(58, -42);
  ctx.lineTo(98, -14);
  ctx.lineTo(130, 0);
  ctx.closePath();
  ctx.fill();

  // CN Tower-ish spire
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(-6, -84, 12, 84); // shaft
  ctx.beginPath();
  ctx.moveTo(-22, -60);
  ctx.lineTo(22, -60);
  ctx.lineTo(14, -52);
  ctx.lineTo(-14, -52);
  ctx.closePath();
  ctx.fill(); // deck
  ctx.fillRect(-2, -104, 4, 20); // antenna

  // Accent
  ctx.globalAlpha *= 0.7;
  ctx.strokeStyle = "rgba(246,201,69,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -104);
  ctx.lineTo(0, 0);
  ctx.stroke();

  ctx.restore();
}

// Deterministic pseudo-random in [0..1)
function hash01(n: number): number {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}
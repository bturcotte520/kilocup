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

    // Crowd layer for this stand region.
    // Tier dividers are drawn globally as concentric rectangles around the pitch
    // (so they read as clean continuous rings, not intersecting per-side strips).
    ctx.save();
    ctx.translate(driftX, driftY);

    drawCrowd(ctx, {
      x: x - 90,
      y: y - 90,
      w: w + 180,
      h: h + 180,
      nowMs,
      density: 0.92,
      waveAmp: 2.1,
      bounceAmp: 1.9,
      colors: ["#C8D0DB", "#8793A1"],
      sparkleRate: 0.7,
      seed,
      pulse: crowdPulse,
    });

    ctx.restore();

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

  // Concentric rectangular balcony dividers (“rings”) around the pitch.
  // This makes the level dividers continuous rectangles (no per-side intersection issues).
  const inflate = (r: PitchRect, padX: number, padY: number): PitchRect => ({
    x: r.x - padX,
    y: r.y - padY,
    w: r.w + padX * 2,
    h: r.h + padY * 2,
  });

  const drawBalconyRing = (padOut: number, thick: number, seed: number) => {
    // Make the outer rectangles longer horizontally (more breathing room left/right).
    const xStretch = 1.5;

    const padIn = Math.max(0, padOut - thick);

    const outer = inflate(pitchRect, padOut * xStretch, padOut);
    const inner = inflate(pitchRect, padIn * xStretch, padIn);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, vp.w, vp.h);
    ctx.clip();

    // Band fill (evenodd: outer - inner)
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#9FA9B7"; // medium-light grey
    ctx.beginPath();
    ctx.rect(outer.x, outer.y, outer.w, outer.h);
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.fill("evenodd");

    // Subtle highlight/shadow borders for a balcony lip feel
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(255,255,255,0.30)";
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(outer.x) + 0.5, Math.round(outer.y) + 0.5, Math.round(outer.w) - 1, Math.round(outer.h) - 1);

    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(inner.x) + 0.5, Math.round(inner.y) + 0.5, Math.round(inner.w) - 1, Math.round(inner.h) - 1);

    // Balcony cutouts along each side (skip corners so it reads clean)
    const holeFill = "rgba(0,0,0,0.30)";
    ctx.fillStyle = holeFill;

    const sideMargin = thick * 1.6;
    const step = clamp((outer.w + outer.h) * 0.02, 52, 86);

    // top band
    {
      const bandY = outer.y;
      const bandH = inner.y - outer.y;
      if (bandH > 2) {
        const holeH = bandH * 0.62;
        const holeW = step * 0.62;
        const yy = bandY + (bandH - holeH) * 0.55;
        const startX = outer.x + sideMargin;
        const endX = outer.x + outer.w - sideMargin;
        for (let k = 0; k < Math.floor((endX - startX) / step); k++) {
          const jitter = (hash01(seed * 17.3 + k * 3.1) - 0.5) * 6;
          const xx = startX + (k + 0.5) * step + jitter - holeW * 0.5;
          ctx.fillRect(Math.round(xx), Math.round(yy), Math.round(holeW), Math.round(holeH));
        }
      }
    }

    // bottom band
    {
      const bandY = inner.y + inner.h;
      const bandH = outer.y + outer.h - (inner.y + inner.h);
      if (bandH > 2) {
        const holeH = bandH * 0.62;
        const holeW = step * 0.62;
        const yy = bandY + (bandH - holeH) * 0.45;
        const startX = outer.x + sideMargin;
        const endX = outer.x + outer.w - sideMargin;
        for (let k = 0; k < Math.floor((endX - startX) / step); k++) {
          const jitter = (hash01(seed * 29.1 + k * 2.7) - 0.5) * 6;
          const xx = startX + (k + 0.5) * step + jitter - holeW * 0.5;
          ctx.fillRect(Math.round(xx), Math.round(yy), Math.round(holeW), Math.round(holeH));
        }
      }
    }

    // left band
    {
      const bandX = outer.x;
      const bandW = inner.x - outer.x;
      if (bandW > 2) {
        const holeW = bandW * 0.62;
        const holeH = step * 0.62;
        const xx = bandX + (bandW - holeW) * 0.55;
        const startY = outer.y + sideMargin;
        const endY = outer.y + outer.h - sideMargin;
        for (let k = 0; k < Math.floor((endY - startY) / step); k++) {
          const jitter = (hash01(seed * 41.7 + k * 2.3) - 0.5) * 6;
          const yy = startY + (k + 0.5) * step + jitter - holeH * 0.5;
          ctx.fillRect(Math.round(xx), Math.round(yy), Math.round(holeW), Math.round(holeH));
        }
      }
    }

    // right band
    {
      const bandX = inner.x + inner.w;
      const bandW = outer.x + outer.w - (inner.x + inner.w);
      if (bandW > 2) {
        const holeW = bandW * 0.62;
        const holeH = step * 0.62;
        const xx = bandX + (bandW - holeW) * 0.45;
        const startY = outer.y + sideMargin;
        const endY = outer.y + outer.h - sideMargin;
        for (let k = 0; k < Math.floor((endY - startY) / step); k++) {
          const jitter = (hash01(seed * 53.9 + k * 2.9) - 0.5) * 6;
          const yy = startY + (k + 0.5) * step + jitter - holeH * 0.5;
          ctx.fillRect(Math.round(xx), Math.round(yy), Math.round(holeW), Math.round(holeH));
        }
      }
    }

    ctx.restore();
  };

  // Restore full-viewport stand coverage (keeps crowd filling the whole window).
  // Top / bottom stands (full width)
  drawStandRegion(0, 0, vp.w, topH, 2101, "H");
  drawStandRegion(0, vp.h - bottomH, vp.w, bottomH, 2207, "H");

  // Side stands (full height)
  drawStandRegion(0, 0, leftW, vp.h, 2303, "V");
  drawStandRegion(vp.w - rightW, 0, rightW, vp.h, 2401, "V");

  // Draw 2 divider rings (3 “levels” implied by the rings)
  const minDist = Math.max(14, Math.min(leftW, rightW, topH, bottomH));
  const thick = clamp(minDist * 0.14, 10, 18);
  drawBalconyRing(minDist * 0.34, thick, 901);
  drawBalconyRing(minDist * 0.68, thick, 907);

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
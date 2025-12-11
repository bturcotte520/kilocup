import type { EngineState } from "../engine/engineTypes";
import { clamp } from "../math/vec2";
import { confettiAlpha, GOAL_BANNER_MS } from "../vfx/goalVfx";

const CONFETTI_COLORS = [
  "#F6C945", // Kilo yellow
  "#7CC6FF", // sky blue
  "#FF5D5D", // red
  "#B7FF6B", // lime
  "#D36BFF", // purple
  "#FFFFFF", // white
] as const;

type Viewport = { w: number; h: number };
type PitchTransform = { scale: number; ox: number; oy: number };

function w2s(t: PitchTransform, p: { x: number; y: number }) {
  return { x: t.ox + p.x * t.scale, y: t.oy + p.y * t.scale };
}

function worldToCanvas(engine: EngineState, t: PitchTransform, world: { x: number; y: number }) {
  // World pitch is centered at (0,0). Convert to pitch-local (0..W, 0..H)
  const xLocal = world.x + engine.config.pitchW / 2;
  const yLocal = world.y + engine.config.pitchH / 2;
  return w2s(t, { x: xLocal, y: yLocal });
}

export function renderVfx(args: {
  ctx: CanvasRenderingContext2D;
  engine: EngineState;
  vp: Viewport;
  tr: PitchTransform;
  nowMs: number;
}) {
  const { ctx, engine, vp, tr, nowMs } = args;

  renderGoalConfetti({ ctx, engine, tr });
  renderGoalBanner({ ctx, engine, vp, nowMs });
}

export function renderGoalConfetti(args: {
  ctx: CanvasRenderingContext2D;
  engine: EngineState;
  tr: PitchTransform;
}) {
  const { ctx, engine, tr } = args;
  const g = engine.vfx.goal;

  // Draw only active particles.
  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  for (let i = 0; i < g.particles.length; i++) {
    const p = g.particles[i];
    if (!p.active) continue;

    const a = confettiAlpha(p);
    if (a <= 0) continue;

    const c = worldToCanvas(engine, tr, { x: p.x, y: p.y });

    const pxSize = Math.max(1, p.size * tr.scale);
    const w = pxSize * 1.15;
    const h = pxSize * 0.55;

    // Keep it in the pitch bounds visually; cheap early out in screen space.
    // (Particles can spawn slightly above pitch, so allow a small margin.)
    if (c.x < tr.ox - 10 || c.x > tr.ox + engine.config.pitchW * tr.scale + 10) continue;
    if (c.y < tr.oy - 60 || c.y > tr.oy + engine.config.pitchH * tr.scale + 80) continue;

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(p.rot);

    ctx.globalAlpha = 0.85 * a;
    ctx.fillStyle = CONFETTI_COLORS[p.colorIdx % CONFETTI_COLORS.length];
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h);

    // specular edge
    ctx.globalAlpha = 0.22 * a;
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect(-w * 0.5, -h * 0.5, w, Math.max(1, h * 0.22));

    ctx.restore();
  }

  ctx.restore();
}

export function renderGoalBanner(args: {
  ctx: CanvasRenderingContext2D;
  engine: EngineState;
  vp: Viewport;
  nowMs: number;
}) {
  const { ctx, engine, vp } = args;
  const ms = engine.vfx.goal.bannerMs;
  if (ms <= 0) return;

  const t = clamp(1 - ms / GOAL_BANNER_MS, 0, 1);

  // ease in then out
  const inT = clamp(t / 0.18, 0, 1);
  const outT = clamp((t - 0.72) / 0.28, 0, 1);

  const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x: number) => x * x;

  const yIn = easeOut(inT);
  const yOut = easeIn(outT);

  const slide = (1 - yIn) * -42 + yOut * -22;
  const alpha = clamp(yIn * (1 - yOut), 0, 1);

  const cx = vp.w * 0.5;
  const cy = vp.h * 0.2 + slide;

  // Banner sizes in CSS px
  const baseW = Math.min(520, vp.w * 0.72);
  const baseH = 86;

  const pulse = 1 + (1 - alpha) * 0.03;
  const w = baseW * pulse;
  const h = baseH * pulse;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = alpha;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.4 * alpha;
  ctx.fillStyle = "rgba(0,0,0,1)";
  roundRect(ctx, -w * 0.5, -h * 0.5 + 8, w, h, 18);
  ctx.fill();
  ctx.restore();

  // Main panel
  const grad = ctx.createLinearGradient(-w * 0.5, 0, w * 0.5, 0);
  grad.addColorStop(0, "rgba(246,201,69,0.95)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(246,201,69,0.95)");

  ctx.fillStyle = grad;
  roundRect(ctx, -w * 0.5, -h * 0.5, w, h, 18);
  ctx.fill();

  // Border
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Text
  ctx.fillStyle = "#111111";
  ctx.font = `900 ${Math.floor(h * 0.52)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const txt = "GOAL!";
  ctx.fillText(txt, 0, 3);

  // Small glint stripe
  ctx.save();
  ctx.globalAlpha = 0.18 * alpha;
  ctx.rotate(-0.18);
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fillRect(-w * 0.2, -h * 1.2, w * 0.1, h * 2.4);
  ctx.restore();

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
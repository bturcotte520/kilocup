import type { EngineState } from "../engine/engineTypes";
import { clamp, V } from "../math/vec2";
import { PLAYER_RADIUS } from "../sim/physics";
import { renderStadium } from "./renderStadium";
import { renderVfx } from "./renderVfx";

type Viewport = {
  w: number; // CSS pixels
  h: number; // CSS pixels
};

type PitchTransform = {
  scale: number;
  ox: number;
  oy: number;
};

function computeTransformFromConfig(engine: EngineState, vp: Viewport): PitchTransform {
  const { pitchW, pitchH } = engine.config;

  // Keep an overhead framing but leave a consistent margin around the pitch
  // so the stadium/crowd can surround it (top/bottom/left/right), instead of
  // cramming everything into a thin strip.
  const margin = clamp(Math.min(vp.w, vp.h) * 0.08, 18, 84);

  const availW = Math.max(1, vp.w - margin * 2);
  const availH = Math.max(1, vp.h - margin * 2);

  const scale = Math.min(availW / pitchW, availH / pitchH);
  const ox = (vp.w - pitchW * scale) / 2;
  const oy = (vp.h - pitchH * scale) / 2;

  return { scale, ox, oy };
}

function w2s(t: PitchTransform, p: { x: number; y: number }) {
  return { x: t.ox + p.x * t.scale, y: t.oy + p.y * t.scale };
}

function worldToCanvas(engine: EngineState, t: PitchTransform, world: { x: number; y: number }) {
  // World pitch is centered at (0,0). Convert to pitch-local (0..W, 0..H)
  const xLocal = world.x + engine.config.pitchW / 2;
  const yLocal = world.y + engine.config.pitchH / 2;
  return w2s(t, { x: xLocal, y: yLocal });
}

export function renderFrame(args: {
  ctx: CanvasRenderingContext2D;
  engine: EngineState;
  vp: Viewport;
  nowMs: number;
}) {
  const { ctx, engine, vp, nowMs } = args;
  const match = engine.match;
  const { pitchW, pitchH, goalHalfW } = engine.config;

  const t = computeTransformFromConfig(engine, vp);

  // Clear (ctx is already configured to CSS pixel space by the canvas host)
  ctx.clearRect(0, 0, vp.w, vp.h);

  // --- Stadium background (parallax layers + animated crowd + host silhouettes) ---
  renderStadium({ ctx, engine, vp, tr: t, nowMs });

  // --- Pitch ---
  drawPitch(ctx, engine, t);

  // --- Goals ---
  drawGoals(ctx, engine, t);

  // --- Players ---
  drawPlayers(ctx, engine, t);

  // --- Ball ---
  drawBall(ctx, engine, t);

  // --- Goal celebration VFX (confetti + banner) ---
  renderVfx({ ctx, engine, vp, tr: t, nowMs });

  // Minimal celebration hint (flash at center)
  if (engine.celebrationMs > 0) {
    const a = clamp(engine.celebrationMs / 1400, 0, 1);
    const center = worldToCanvas(engine, t, { x: 0, y: 0 });
    ctx.save();
    ctx.globalAlpha = 0.18 * a;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 70 + (1 - a) * 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Debug-ish: goal mouth guides (very subtle)
  void goalHalfW;
}

function drawPitch(ctx: CanvasRenderingContext2D, engine: EngineState, tr: PitchTransform) {
  const { pitchW, pitchH } = engine.config;

  const pitchRect = {
    x: tr.ox,
    y: tr.oy,
    w: pitchW * tr.scale,
    h: pitchH * tr.scale,
  };

  // Grass base
  ctx.fillStyle = "#2E7D32";
  ctx.fillRect(pitchRect.x, pitchRect.y, pitchRect.w, pitchRect.h);

  // Stripes
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    const s = i / stripes;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(pitchRect.x + s * pitchRect.w, pitchRect.y, pitchRect.w / stripes, pitchRect.h);
  }

  // Lines
  const lineW = Math.max(1, tr.scale * 0.18);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = lineW;

  // Outer boundary
  ctx.strokeRect(pitchRect.x + lineW * 0.5, pitchRect.y + lineW * 0.5, pitchRect.w - lineW, pitchRect.h - lineW);

  // Center line
  ctx.beginPath();
  ctx.moveTo(pitchRect.x + pitchRect.w / 2, pitchRect.y);
  ctx.lineTo(pitchRect.x + pitchRect.w / 2, pitchRect.y + pitchRect.h);
  ctx.stroke();

  // Center circle
  const center = worldToCanvas(engine, tr, { x: 0, y: 0 });
  ctx.beginPath();
  ctx.arc(center.x, center.y, tr.scale * 9.15, 0, Math.PI * 2);
  ctx.stroke();

  // Penalty boxes (simple)
  const boxW = 18;
  const boxH = 44;
  const leftTop = worldToCanvas(engine, tr, { x: -pitchW / 2, y: -boxH / 2 });
  const leftBot = worldToCanvas(engine, tr, { x: -pitchW / 2 + boxW, y: boxH / 2 });
  ctx.strokeRect(leftTop.x, leftTop.y, leftBot.x - leftTop.x, leftBot.y - leftTop.y);

  const rightTop = worldToCanvas(engine, tr, { x: pitchW / 2 - boxW, y: -boxH / 2 });
  const rightBot = worldToCanvas(engine, tr, { x: pitchW / 2, y: boxH / 2 });
  ctx.strokeRect(rightTop.x, rightTop.y, rightBot.x - rightTop.x, rightBot.y - rightTop.y);
}

function drawGoals(ctx: CanvasRenderingContext2D, engine: EngineState, tr: PitchTransform) {
  const { pitchW, goalHalfW, goalDepth } = engine.config;

  const mouthTopL = worldToCanvas(engine, tr, { x: -pitchW / 2, y: -goalHalfW });
  const mouthBotL = worldToCanvas(engine, tr, { x: -pitchW / 2, y: goalHalfW });
  const backTopL = worldToCanvas(engine, tr, { x: -pitchW / 2 - goalDepth, y: -goalHalfW });
  const backBotL = worldToCanvas(engine, tr, { x: -pitchW / 2 - goalDepth, y: goalHalfW });

  const mouthTopR = worldToCanvas(engine, tr, { x: pitchW / 2, y: -goalHalfW });
  const mouthBotR = worldToCanvas(engine, tr, { x: pitchW / 2, y: goalHalfW });
  const backTopR = worldToCanvas(engine, tr, { x: pitchW / 2 + goalDepth, y: -goalHalfW });
  const backBotR = worldToCanvas(engine, tr, { x: pitchW / 2 + goalDepth, y: goalHalfW });

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(1, tr.scale * 0.22);

  // Left goal
  ctx.beginPath();
  ctx.moveTo(mouthTopL.x, mouthTopL.y);
  ctx.lineTo(backTopL.x, backTopL.y);
  ctx.lineTo(backBotL.x, backBotL.y);
  ctx.lineTo(mouthBotL.x, mouthBotL.y);
  ctx.stroke();

  // Right goal
  ctx.beginPath();
  ctx.moveTo(mouthTopR.x, mouthTopR.y);
  ctx.lineTo(backTopR.x, backTopR.y);
  ctx.lineTo(backBotR.x, backBotR.y);
  ctx.lineTo(mouthBotR.x, mouthBotR.y);
  ctx.stroke();

  ctx.restore();
}

function drawPlayers(ctx: CanvasRenderingContext2D, engine: EngineState, tr: PitchTransform) {
  const match = engine.match;
  const controlledId = match.controlledPlayerId;
  const r = PLAYER_RADIUS * tr.scale;

  for (const teamId of [match.homeTeamId, match.awayTeamId]) {
    const team = match.teamsById[teamId];
    for (const p of team.players) {
      const c = worldToCanvas(engine, tr, p.pos);

      // shadow
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + r * 0.55, r * 0.9, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // controlled ring
      if (p.id === controlledId) {
        const pulse = 0.5 + 0.5 * Math.sin(perfNowMs() / 180);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(2, tr.scale * (0.35 + pulse * 0.2));
        ctx.beginPath();
        ctx.arc(c.x, c.y, r * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // body
      ctx.save();
      ctx.fillStyle = team.kit.primary;
      ctx.strokeStyle = team.kit.secondary;
      ctx.lineWidth = Math.max(1.5, tr.scale * 0.22);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // direction tick
      const dir = { x: Math.cos(p.facingRad), y: Math.sin(p.facingRad) };
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(1, tr.scale * 0.18);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + dir.x * r * 0.95, c.y + dir.y * r * 0.95);
      ctx.stroke();
      ctx.restore();

      // has ball hint (tiny dot)
      if (p.hasBall) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(c.x - r * 0.55, c.y - r * 0.55, Math.max(1.5, tr.scale * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

function drawBall(ctx: CanvasRenderingContext2D, engine: EngineState, tr: PitchTransform) {
  const match = engine.match;
  const b = match.ball;
  const r = b.radius * tr.scale;

  // Visual dribble “bounce”: if the ball is owned and the carrier is moving, draw the ball slightly
  // ahead of the carrier and oscillate it a bit. This is purely a render effect (no physics changes).
  let ballCanvas = worldToCanvas(engine, tr, b.pos);

  if (b.ownerPlayerId) {
    const owner = match.playersById[b.ownerPlayerId];
    if (owner) {
      const ownerSpeed = V.len(owner.vel);
      if (ownerSpeed > 1.2) {
        const dir = V.lenSq(owner.vel) > 1e-6 ? V.norm(owner.vel) : { x: Math.cos(owner.facingRad), y: Math.sin(owner.facingRad) };
        const t = perfNowMs() / 1000;

        // Small forward offset + small vertical “bounce” along the travel direction
        const forward = (0.55 + Math.sin(t * 10.5) * 0.12) * r * 1.6;
        const lateral = Math.cos(t * 10.5) * r * 0.18;

        ballCanvas = {
          x: ballCanvas.x + dir.x * forward - dir.y * lateral,
          y: ballCanvas.y + dir.y * forward + dir.x * lateral,
        };
      }
    }
  }

  // trail (only when moving)
  const speed = V.len(b.vel);
  if (speed > 8) {
    const dir = V.norm(b.vel);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = r * 0.9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ballCanvas.x, ballCanvas.y);
    ctx.lineTo(ballCanvas.x - dir.x * r * 5, ballCanvas.y - dir.y * r * 5);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = "#FAFAFA";
  ctx.strokeStyle = "#1A1A1A";
  ctx.lineWidth = Math.max(1, tr.scale * 0.18);
  ctx.beginPath();
  ctx.arc(ballCanvas.x, ballCanvas.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // highlight
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#7CC6FF";
  ctx.beginPath();
  ctx.arc(ballCanvas.x - r * 0.25, ballCanvas.y - r * 0.25, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Avoid importing perf APIs into sim code; renderer can fall back to Date.now()
function perfNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
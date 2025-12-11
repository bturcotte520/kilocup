import type { Vec2 } from "../engine/engineTypes";

export const V = {
  v(x: number, y: number): Vec2 {
    return { x, y };
  },

  add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
  },

  sub(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
  },

  mul(a: Vec2, s: number): Vec2 {
    return { x: a.x * s, y: a.y * s };
  },

  dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
  },

  lenSq(a: Vec2): number {
    return a.x * a.x + a.y * a.y;
  },

  len(a: Vec2): number {
    return Math.sqrt(V.lenSq(a));
  },

  norm(a: Vec2): Vec2 {
    const l = V.len(a);
    if (l <= 1e-9) return { x: 0, y: 0 };
    return { x: a.x / l, y: a.y / l };
  },

  distSq(a: Vec2, b: Vec2): number {
    return V.lenSq(V.sub(a, b));
  },

  dist(a: Vec2, b: Vec2): number {
    return Math.sqrt(V.distSq(a, b));
  },

  clampLen(a: Vec2, maxLen: number): Vec2 {
    const l = V.len(a);
    if (l <= maxLen) return a;
    if (l <= 1e-9) return { x: 0, y: 0 };
    const s = maxLen / l;
    return { x: a.x * s, y: a.y * s };
  },
};

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
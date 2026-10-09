// Mulberry32: the accumulator, rather than a closure, is serialised in state.
export function next(u32) {
  const state = ((u32 >>> 0) + 0x6D2B79F5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, state];
}

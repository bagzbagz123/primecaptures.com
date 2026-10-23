// Pure geometry and policy shared by the progressive WebGL enhancement and tests.
export const clamp01 = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function motionBudget({width = 0, dpr = 1, coarse = false, saveData = false, deviceMemory, hardwareConcurrency} = {}) {
  const modest = width < 761 || coarse || (deviceMemory > 0 && deviceMemory <= 4) || (hardwareConcurrency > 0 && hardwareConcurrency <= 4);
  const constrained = (deviceMemory > 0 && deviceMemory <= 2) || (hardwareConcurrency > 0 && hardwareConcurrency <= 2);
  return {count: saveData ? 0 : constrained ? 1200 : modest ? 1800 : 6800, pixelRatio: Math.min(constrained ? 1 : modest ? 1.25 : 1.5, Math.max(1, Number.isFinite(dpr) ? dpr : 1))};
}

export function shouldAnimate({reducedMotion, preference, saveData, hidden, visible, failed} = {}) {
  return Boolean(visible && !hidden && !failed && !reducedMotion && preference !== 'off' && !saveData);
}

export function createParticleTargets(count, initialSeed = 29) {
  count = Math.max(0, Math.min(10000, Math.floor(Number.isFinite(count) ? count : 0)));
  let state = initialSeed >>> 0;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const cloud = new Float32Array(count * 3);
  const lens = new Float32Array(count * 3);
  const frame = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const j = i * 3, a = random() * Math.PI * 2, b = Math.acos(2 * random() - 1);
    const r = 1.1 + random() * 1.7;
    cloud.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b) * .8, r * Math.sin(b) * Math.sin(a)], j);
    const ring = i % 9;
    const angle = random() * Math.PI * 2;
    const radius = ring < 7 ? .68 + ring * .175 + (random() - .5) * .025 : .45 + random() * .2;
    const depth = ring < 7 ? -.42 + ring * .11 : -.6;
    lens.set([Math.cos(angle) * radius, Math.sin(angle) * radius, depth + (random() - .5) * .08], j);
    // A dimensional, landscape photo frame. Every point keeps its own identity.
    const side = i % 4, t = random(), thickness = random() * .15;
    const x = side < 2 ? (t * 2 - 1) * 2.25 : (side === 2 ? -1 : 1) * (2.25 - thickness);
    const y = side < 2 ? (side === 0 ? -1 : 1) * (1.65 - thickness) : (t * 2 - 1) * 1.65;
    frame.set([x, y, (random() - .5) * .22], j);
    seed[i] = random();
  }
  return {cloud, lens, frame, seed};
}

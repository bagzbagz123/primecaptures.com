import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp01,
  motionBudget,
  shouldAnimate,
  createParticleTargets,
} from '../dist/scroll-story-core.js';

const desktop = {
  width: 1440,
  dpr: 2,
  coarse: false,
  saveData: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
};

const active = {
  reducedMotion: false,
  preference: 'on',
  saveData: false,
  hidden: false,
  visible: true,
  failed: false,
};

test('bounds photo reveal opacity and keeps it finite for missing measurements', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined, null]) {
    const clamped = clamp01(value);
    assert.ok(Number.isFinite(clamped), `nonfinite clamp input ${String(value)}`);
    assert.ok(clamped >= 0 && clamped <= 1);
  }
  assert.equal(clamp01(-0.5), 0);
  assert.equal(clamp01(0.325), 0.325);
  assert.equal(clamp01(1.5), 1);
});

test('requires every motion safety condition, even when animation was explicitly enabled', () => {
  assert.equal(shouldAnimate(active), true);
  for (const [key, value] of [
    ['reducedMotion', true],
    ['preference', 'off'],
    ['saveData', true],
    ['hidden', true],
    ['visible', false],
    ['failed', true],
  ]) {
    assert.equal(shouldAnimate({ ...active, [key]: value }), false, `${key} must stop rendering`);
  }
  assert.equal(shouldAnimate({ ...active, preference: null }), true);
  assert.equal(shouldAnimate({ ...active, preference: 'on', reducedMotion: true }), false);
});

test('caps desktop rendering and independently lowers the budget for each constrained device signal', () => {
  const full = motionBudget(desktop);
  assert.ok(Number.isInteger(full.count) && full.count > 0);
  assert.ok(full.count <= 6800);
  assert.ok(full.pixelRatio > 0 && full.pixelRatio <= 1.5);

  for (const constraint of [
    { width: 390 },
    { coarse: true },
    { deviceMemory: 4 },
    { hardwareConcurrency: 4 },
  ]) {
    const limited = motionBudget({ ...desktop, ...constraint });
    assert.ok(Number.isInteger(limited.count) && limited.count > 0);
    assert.ok(limited.count <= 2400, JSON.stringify(constraint));
    assert.ok(limited.count < full.count);
    assert.ok(limited.pixelRatio > 0 && limited.pixelRatio <= 1.25);
  }

  const lowDpr = motionBudget({ ...desktop, dpr: 1 });
  assert.ok(lowDpr.pixelRatio <= 1, 'do not supersample a 1× display');
  const extremeDpr = motionBudget({ ...desktop, dpr: 8 });
  assert.ok(extremeDpr.pixelRatio <= 1.5);
  assert.equal(motionBudget({ ...desktop, saveData: true }).count, 0);
  assert.equal(motionBudget({ ...desktop, width: 390 }).count, 1800);
  for (const constraint of [{deviceMemory:2},{hardwareConcurrency:2}]) {
    const limited=motionBudget({...desktop,...constraint});
    assert.equal(limited.count,1200);
    assert.equal(limited.pixelRatio,1);
  }
});

test('produces repeatable, independently seeded GPU attributes without allocating shared arrays', () => {
  const first = createParticleTargets(512, 29);
  const again = createParticleTargets(512, 29);
  const other = createParticleTargets(512, 71);
  for (const key of ['cloud', 'lens', 'frame']) {
    assert.ok(first[key] instanceof Float32Array);
    assert.equal(first[key].length, 512 * 3);
    assert.deepEqual(first[key], again[key], key);
    assert.notEqual(first[key], again[key], `${key} buffers must be independent`);
  }
  assert.ok(first.seed instanceof Float32Array);
  assert.equal(first.seed.length, 512);
  assert.deepEqual(first.seed, again.seed);
  assert.notDeepEqual(first.cloud, other.cloud);
  assert.notDeepEqual(first.seed, other.seed);
});

test('creates finite, distributed, distinct shapes suitable for morphing rather than collapsed points', () => {
  const count = 2400;
  const targets = createParticleTargets(count, 29);
  for (const key of ['cloud', 'lens', 'frame']) {
    const positions = targets[key];
    const unique = new Set();
    const bounds = [0, 1, 2].map(() => ({ min: Infinity, max: -Infinity }));
    for (let index = 0; index < count; index += 1) {
      const point = positions.subarray(index * 3, index * 3 + 3);
      assert.equal(point.length, 3);
      for (let axis = 0; axis < 3; axis += 1) {
        const value = point[axis];
        assert.ok(Number.isFinite(value), `${key}[${index},${axis}] is finite`);
        assert.ok(Math.abs(value) < 100, `${key} stays inside a bounded scene`);
        bounds[axis].min = Math.min(bounds[axis].min, value);
        bounds[axis].max = Math.max(bounds[axis].max, value);
      }
      unique.add(Array.from(point, value => value.toFixed(4)).join(','));
    }
    assert.ok(unique.size > count * 0.9, `${key} does not stack most particles on duplicate positions`);
    assert.ok(bounds[0].max - bounds[0].min > 0.5, `${key} has useful width`);
    assert.ok(bounds[1].max - bounds[1].min > 0.5, `${key} has useful height`);
    if (key === 'cloud') assert.ok(bounds[2].max - bounds[2].min > 0.5, 'opening cloud has depth');
  }
  for (const [from, to] of [['cloud', 'lens'], ['lens', 'frame'], ['cloud', 'frame']]) {
    let squaredDistance = 0;
    for (let index = 0; index < count * 3; index += 1) {
      squaredDistance += (targets[from][index] - targets[to][index]) ** 2;
    }
    assert.ok(Math.sqrt(squaredDistance / count) > 0.25, `${from} and ${to} create a visible morph`);
  }
  for (const value of targets.seed) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
});

test('supports an empty particle budget without generating invalid buffers', () => {
  const empty = createParticleTargets(0);
  for (const key of ['cloud', 'lens', 'frame', 'seed']) {
    assert.ok(empty[key] instanceof Float32Array);
    assert.equal(empty[key].length, 0);
  }
});

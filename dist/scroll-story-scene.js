import {WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, BufferAttribute, ShaderMaterial, Points, Vector2, Group, Mesh, MeshBasicMaterial, PlaneGeometry, BoxGeometry, TextureLoader, SRGBColorSpace, AdditiveBlending, gsap, ScrollTrigger} from './vendor/scroll-vendor-v1.js';
import {clamp01, createParticleTargets, motionBudget} from './scroll-story-core.js?v=1';

const vertexShader = `
  attribute vec3 aLens;
  attribute vec3 aFrame;
  attribute float aSeed;
  uniform float uProgress;
  uniform float uTime;
  uniform float uBurst;
  uniform float uPointerPower;
  uniform vec2 uPointer;
  uniform float uPixelRatio;
  varying float vSeed;
  varying float vAlpha;
  void main() {
    float focus = smoothstep(.07, .46, uProgress);
    float framed = smoothstep(.55, .94, uProgress);
    vec3 p = mix(position, aLens, focus);
    p = mix(p, aFrame, framed);
    float drift = (1.0 - focus) * .12 + uBurst * .13;
    p += vec3(sin(aSeed * 31.0 + uTime), cos(aSeed * 29.0 + uTime * .8), sin(aSeed * 17.0)) * drift;
    vec2 delta = p.xy - uPointer;
    float d = length(delta);
    p.xy += normalize(delta + vec2(.001)) * exp(-d * d * 2.5) * uPointerPower * .38;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp((2.4 + aSeed * 1.6 + uBurst * .8) * uPixelRatio * 8.0 / -view.z, 1.0, 6.0);
    vSeed = aSeed;
    vAlpha = (.45 + .5 * aSeed) * (1.0 - .85 * smoothstep(.90, 1.0, uProgress));
  }
`;
const fragmentShader = `
  varying float vSeed;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - .5) * 2.0;
    if (d > 1.0) discard;
    float glow = pow(1.0 - d, 1.4);
    vec3 color = mix(vec3(.92, .91, .94), vec3(1.0, .18, .17), step(.72, vSeed));
    gl_FragColor = vec4(color, glow * vAlpha);
    #include <colorspace_fragment>
  }
`;

export function createStoryScene(section, {onFailure}) {
  const cleanup = [];
  try { return initializeStoryScene(section, onFailure, cleanup); }
  catch (error) { cleanup.reverse().forEach(dispose => { try { dispose(); } catch { /* Best effort after an unavailable renderer. */ } }); throw error; }
}

function initializeStoryScene(section, onFailure, cleanup) {
  const canvas = section.querySelector('canvas');
  const visual = section.querySelector('.story-visual');
  const layout = section.querySelector('.story-layout');
  const caption = section.querySelector('[data-story-stage]');
  const chapters = [...section.querySelectorAll('.story-chapter')];
  const coarse = matchMedia('(pointer: coarse)');
  let budget = motionBudget({width: innerWidth, dpr: devicePixelRatio, coarse: coarse.matches, deviceMemory: navigator.deviceMemory, hardwareConcurrency: navigator.hardwareConcurrency});
  // A failed/slow WebGL implementation leaves the real photograph in place.
  const renderer = new WebGLRenderer({canvas, alpha: true, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true});
  cleanup.push(() => renderer.dispose());
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, .1, 30);
  camera.position.z = 8.4;
  const group = new Group();
  scene.add(group);
  const targets = createParticleTargets(budget.count);
  const geometry = new BufferGeometry();
  cleanup.push(() => geometry.dispose());
  geometry.setAttribute('position', new BufferAttribute(targets.cloud, 3));
  geometry.setAttribute('aLens', new BufferAttribute(targets.lens, 3));
  geometry.setAttribute('aFrame', new BufferAttribute(targets.frame, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(targets.seed, 1));
  const uniforms = {
    uProgress: {value: 0}, uTime: {value: 0}, uBurst: {value: 0},
    uPointer: {value: new Vector2(20, 20)}, uPointerPower: {value: 0}, uPixelRatio: {value: budget.pixelRatio}
  };
  const material = new ShaderMaterial({uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: AdditiveBlending});
  cleanup.push(() => material.dispose());
  const points = new Points(geometry, material);
  // Shader positions move beyond the original cloud's bounding sphere.
  points.frustumCulled = false;
  group.add(points);
  const keepsake = new Group();
  group.add(keepsake);
  const disposable = [geometry, material];
  const frameMaterial = new MeshBasicMaterial({color: 0x252529, transparent: true, opacity: 0});
  const edgeMaterial = new MeshBasicMaterial({color: 0x696971, transparent: true, opacity: 0});
  const photoMaterial = new MeshBasicMaterial({transparent: true, opacity: 0, color: 0xffffff});
  disposable.push(frameMaterial, edgeMaterial, photoMaterial);
  cleanup.push(() => disposable.slice(2).forEach(resource => resource.dispose()));
  function box(width, height, depth, x, y, z, mat) {
    const shape = new BoxGeometry(width, height, depth);
    const mesh = new Mesh(shape, mat);
    mesh.position.set(x, y, z); keepsake.add(mesh); disposable.push(shape);
  }
  box(4.45, .14, .2, 0, 1.56, 0, edgeMaterial);
  box(4.45, .14, .2, 0, -1.56, 0, edgeMaterial);
  box(.14, 3, .2, -2.16, 0, 0, edgeMaterial);
  box(.14, 3, .2, 2.16, 0, 0, edgeMaterial);
  box(4.2, .23, .16, 0, 1.43, .04, frameMaterial);
  box(4.2, .23, .16, 0, -1.43, .04, frameMaterial);
  box(.23, 2.7, .16, -2, 0, .04, frameMaterial);
  box(.23, 2.7, .16, 2, 0, .04, frameMaterial);
  const plane = new PlaneGeometry(3.78, 2.518);
  const photo = new Mesh(plane, photoMaterial);
  photo.position.z = .03; keepsake.add(photo); disposable.push(plane);
  let texture, alive = true, active = false, running = false, target = 0;
  let previousTime = 0, awakeUntil = 0, pointerPower = 0, burst = 0, currentChapter = -1, refreshTimer;
  let slowFrames = 0, measuredFrames = 0, degraded = false;
  const progress = {value: 0};
  const pointer = new Vector2(20, 20);
  const stopLoop = () => { renderer.setAnimationLoop(null); running = false; canvas.dataset.renderState = 'idle'; };
  function setChapter(value) {
    const next = value < .3 ? 0 : value < .7 ? 1 : 2;
    if (next === currentChapter) return;
    currentChapter = next;
    chapters.forEach((chapter, i) => chapter.dataset.active = String(i === next));
    caption.textContent = ['THE SPARK', 'THE CAPTURE', 'THE KEEPSAKE'][next];
    section.querySelector('.story-hint').textContent = next === 2 ? 'FRAME VISUALIZATION' : 'SCROLL TO REVEAL';
    section.dataset.stage = ['spark', 'lens', 'keepsake'][next];
  }
  function resize() {
    if (!alive) return;
    const {width, height} = visual.getBoundingClientRect();
    if (!width || !height) return;
    const next = motionBudget({width: innerWidth, dpr: devicePixelRatio, coarse: coarse.matches, deviceMemory: navigator.deviceMemory, hardwareConcurrency: navigator.hardwareConcurrency});
    const count = Math.min(budget.count, next.count);
    geometry.setDrawRange(0, count);
    canvas.dataset.particleCount = String(count);
    const ratio = degraded ? 1 : next.pixelRatio;
    uniforms.uPixelRatio.value = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    wake();
  }
  function paint(time) {
    if (!alive || !active || document.hidden) { stopLoop(); return; }
    const dt = Math.min(.05, previousTime ? (time - previousTime) / 1000 : 1 / 60);
    previousTime = time;
    const easing = 1 - Math.exp(-dt * 10);
    progress.value += (target - progress.value) * easing;
    burst *= Math.exp(-dt * 5);
    pointerPower *= Math.exp(-dt * 4);
    uniforms.uProgress.value = progress.value;
    uniforms.uBurst.value = burst;
    uniforms.uTime.value += dt;
    uniforms.uPointer.value.lerp(pointer, easing);
    uniforms.uPointerPower.value = pointerPower;
    group.rotation.y = -.35 * (1 - progress.value) + Math.sin(progress.value * Math.PI) * .35;
    group.rotation.x = .13 - progress.value * .19;
    group.rotation.z = -.08 * progress.value;
    const reveal = clamp01((progress.value - .77) / .18);
    frameMaterial.opacity = reveal;
    edgeMaterial.opacity = reveal * .82;
    photoMaterial.opacity = texture ? reveal : 0;
    keepsake.visible = reveal > .001;
    setChapter(progress.value);
    try { renderer.render(scene, camera); } catch { onFailure(); return; }
    // Adapt once if the device cannot comfortably maintain a short response.
    if (++measuredFrames > 12 && dt > .03) slowFrames++;
    if (!degraded && slowFrames > 24) { degraded = true; budget.count = Math.floor(geometry.drawRange.count / 2); resize(); }
    if (time > awakeUntil && Math.abs(target - progress.value) < .0004 && burst < .004 && pointerPower < .004) {
      progress.value = target;
      stopLoop();
    }
  }
  function wake() {
    if (!alive || !active || document.hidden) return;
    awakeUntil = performance.now() + 800;
    if (!running) { running = true; previousTime = 0; canvas.dataset.renderState = 'active'; renderer.setAnimationLoop(paint); }
  }
  const lost = event => { event.preventDefault(); if (alive) onFailure(); };
  canvas.addEventListener('webglcontextlost', lost);
  cleanup.push(() => canvas.removeEventListener('webglcontextlost', lost));
  const shaderError = renderer.debug.onShaderError;
  renderer.debug.onShaderError = () => { queueMicrotask(() => alive && onFailure()); };
  gsap.registerPlugin(ScrollTrigger);
  section.dataset.enhanced = 'true';
  resize();
  const trigger = ScrollTrigger.create({
    trigger: layout,
    start: () => `top ${innerWidth < 761 ? '25%' : '30%'}`,
    end: () => `bottom ${innerWidth < 761 ? '78%' : '70%'}`,
    onUpdate: self => { target = self.progress; burst = Math.max(burst, Math.min(.65, Math.abs(self.getVelocity()) / 3500)); wake(); },
    onRefresh: self => { target = self.progress; if (!running) progress.value = target; setChapter(target); wake(); }
  });
  cleanup.push(() => trigger.kill());
  target = trigger.progress; progress.value = target;
  const observer = new ResizeObserver(() => { resize(); scheduleRefresh(); });
  cleanup.push(() => observer.disconnect());
  observer.observe(visual);
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (alive) ScrollTrigger.refresh(true); }, 160);
  }
  const pointerMove = event => {
    if (coarse.matches || event.pointerType === 'touch' || !active) return;
    const rect = visual.getBoundingClientRect();
    const height = 2 * Math.tan(40 * Math.PI / 360) * camera.position.z;
    pointer.set(((event.clientX - rect.left) / rect.width - .5) * height * camera.aspect, (.5 - (event.clientY - rect.top) / rect.height) * height);
    pointerPower = 1; wake();
  };
  const pointerLeave = () => { pointer.set(20, 20); wake(); };
  visual.addEventListener('pointermove', pointerMove, {passive: true});
  visual.addEventListener('pointerleave', pointerLeave, {passive: true});
  document.addEventListener('toggle', scheduleRefresh, true);
  window.addEventListener('resize', scheduleRefresh, {passive: true});
  document.fonts?.ready.then(() => { if (alive) scheduleRefresh(); });
  new TextureLoader().load(section.querySelector('.story-still img').getAttribute('src'), loaded => {
    if (!alive) { loaded.dispose(); return; }
    loaded.colorSpace = SRGBColorSpace;
    texture = loaded; photoMaterial.map = loaded; photoMaterial.needsUpdate = true; wake();
  }, undefined, () => { if (alive) onFailure(); });
  return {
    setVisible(value) { active = value; if (active) { target = trigger.progress; wake(); } else stopLoop(); },
    destroy() {
      if (!alive) return;
      alive = false; stopLoop(); clearTimeout(refreshTimer); trigger.kill(); observer.disconnect();
      visual.removeEventListener('pointermove', pointerMove); visual.removeEventListener('pointerleave', pointerLeave);
      document.removeEventListener('toggle', scheduleRefresh, true); window.removeEventListener('resize', scheduleRefresh);
      canvas.removeEventListener('webglcontextlost', lost); renderer.debug.onShaderError = shaderError;
      texture?.dispose(); disposable.forEach(resource => resource.dispose()); renderer.dispose();
      delete canvas.dataset.particleCount; delete section.dataset.stage;
      // Refresh other consumers after the enhancement's sticky track is removed.
      requestAnimationFrame(() => ScrollTrigger.refresh(true));
    }
  };
}

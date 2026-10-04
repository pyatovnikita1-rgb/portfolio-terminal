const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../system/matrix.js'), 'utf8');

function eventSource(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    emit(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
  };
}

function setup({ reduced = false, fine = true, available = true, ratio = 1 } = {}) {
  const frames = new Map();
  const classes = new Set();
  const drawing = { clears: 0, glyphs: [], gradients: [] };
  let nextFrame = 0;
  const context = {
    setTransform() {},
    clearRect() { drawing.clears++; },
    fillRect() {},
    fillText(glyph, x, y) { drawing.glyphs.push({ glyph, x, y }); },
    createRadialGradient(...bounds) {
      const stops = [];
      drawing.gradients.push({ bounds, stops });
      return { addColorStop: (...stop) => stops.push(stop) };
    },
  };
  const canvas = { style: {}, getContext: () => available ? context : null };
  const spotlight = {
    hidden: true,
    querySelector: () => canvas,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
  };
  const motion = eventSource({ matches: reduced });
  const pointer = eventSource({ matches: fine });
  const document = eventSource({ hidden: false, getElementById: () => spotlight });
  const window = eventSource({
    innerHeight: 900,
    devicePixelRatio: ratio,
    matchMedia: query => query.includes('reduced-motion') ? motion : pointer,
    requestAnimationFrame: callback => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: id => frames.delete(id),
  });
  runInNewContext(source, { document, window });
  return {
    window, document, motion, pointer, spotlight, canvas, context, classes, frames, drawing,
    move: (extra = {}) => document.emit('pointermove', {
      pointerType: 'mouse', clientX: 400, clientY: 300, ...extra,
    }),
    tick: time => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
    },
  };
}

test('starts without work, then reveals masked code centered on the mouse', () => {
  const app = setup();
  assert.equal(app.spotlight.hidden, true);
  assert.equal(app.frames.size, 0);
  app.move();
  app.tick(100);
  assert.equal(app.spotlight.hidden, false);
  assert.ok(app.classes.has('is-visible'));
  assert.equal(app.canvas.style.transform, 'translate3d(180px, 80px, 0)');
  assert.ok(app.drawing.glyphs.length > 0);
  const mask = app.drawing.gradients.at(-1);
  assert.equal(mask.bounds[5], 220);
  assert.deepEqual(mask.stops.at(-1), [1, 'rgba(0, 0, 0, 0)']);
  assert.equal(app.context.globalCompositeOperation, 'source-over');
});

test('pointer moves share one frame loop and drawing is throttled', () => {
  const app = setup();
  app.move();
  app.move({ clientX: 450 });
  app.tick(100);
  app.tick(110);
  assert.equal(app.drawing.clears, 1);
  assert.equal(app.frames.size, 1);
  app.tick(140);
  assert.equal(app.drawing.clears, 2);
  assert.equal(app.canvas.style.transform, 'translate3d(230px, 80px, 0)');
});

test('leaving, blur, hidden tab and losing a fine pointer stop animation', () => {
  for (const reason of ['leave', 'cancel', 'blur', 'hidden', 'pointer']) {
    const app = setup();
    app.move();
    app.tick(100);
    if (reason === 'leave') app.document.emit('pointerleave');
    if (reason === 'cancel') app.document.emit('pointercancel');
    if (reason === 'blur') app.window.emit('blur');
    if (reason === 'hidden') {
      app.document.hidden = true;
      app.document.emit('visibilitychange');
    }
    if (reason === 'pointer') {
      app.pointer.matches = false;
      app.pointer.emit('change');
    }
    assert.equal(app.frames.size, 0);
    assert.equal(app.classes.has('is-visible'), false);
  }
});

test('touch and devices without a fine pointer do not activate the effect', () => {
  for (const app of [setup(), setup({ fine: false })]) {
    app.move({ pointerType: 'touch' });
    assert.equal(app.frames.size, 0);
    assert.equal(app.spotlight.hidden, true);
  }
  const app = setup({ fine: false });
  app.move();
  assert.equal(app.frames.size, 0);
});

test('reduced motion draws a static field only on demand, including after resize', () => {
  const app = setup({ reduced: true });
  app.move();
  app.tick(100);
  assert.equal(app.frames.size, 0);
  const firstGlyphs = [...app.drawing.glyphs];
  app.drawing.glyphs.length = 0;
  app.move();
  app.tick(5000);
  assert.deepEqual(app.drawing.glyphs, firstGlyphs);
  assert.equal(app.frames.size, 0);
  app.window.emit('resize');
  app.tick(5100);
  assert.equal(app.drawing.clears, 3);
  assert.equal(app.frames.size, 0);
});

test('changing the motion preference stops and restarts the continuous loop', () => {
  const app = setup();
  app.move();
  app.tick(100);
  app.motion.matches = true;
  app.motion.emit('change');
  app.tick(140);
  assert.equal(app.frames.size, 0);
  app.motion.matches = false;
  app.motion.emit('change');
  app.tick(180);
  assert.equal(app.frames.size, 1);
});

test('canvas resolution is capped and missing canvas support is harmless', () => {
  const app = setup({ ratio: 3 });
  assert.equal(app.canvas.width, 880);
  assert.equal(app.canvas.height, 880);
  const unavailable = setup({ available: false });
  unavailable.move();
  assert.equal(unavailable.frames.size, 0);
  assert.equal(unavailable.spotlight.hidden, true);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../system/robot.js'), 'utf8');

function eventSource(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    emit(type, properties = {}) {
      for (const listener of listeners.get(type) || []) {
        listener({ target: this, ...properties });
      }
    },
  };
}

function setup({ reduced = false, width = 1000, missing = false, language = 'ru' } = {}) {
  const attributes = new Map();
  const classes = new Set();
  const timers = new Map();
  let timerId = 0;
  const robot = eventSource({
    dataset: { side: 'left', facing: 'right' },
    offsetWidth: 64,
    style: { setProperty() {} },
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
  });
  const track = { clientWidth: width, hidden: true };
  const motion = eventSource({ matches: reduced });
  const document = eventSource({
    hidden: false,
    documentElement: { lang: language },
    getElementById: id => missing ? null : id === 'robot-track' ? track : robot,
  });
  const window = eventSource({
    matchMedia: () => motion,
    setTimeout: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: id => timers.delete(id),
  });
  runInNewContext(source, { document, window });
  return {
    robot, track, motion, document, window, timers, attributes, classes,
    click: () => robot.emit('click'),
    arrive: () => robot.emit('transitionend', { propertyName: 'left' }),
  };
}

test('starts on the left, runs right, then returns on the next click', () => {
  const app = setup();
  assert.equal(app.track.hidden, false);
  assert.equal(app.robot.dataset.side, 'left');
  assert.match(app.attributes.get('aria-label'), /правый/);

  app.click();
  assert.equal(app.robot.dataset.side, 'right');
  assert.equal(app.robot.dataset.facing, 'right');
  assert.equal(app.attributes.get('aria-disabled'), 'true');
  app.arrive();
  assert.equal(app.robot.dataset.facing, 'left');
  assert.match(app.attributes.get('aria-label'), /левый/);
  assert.equal(app.attributes.has('aria-disabled'), false);
  assert.equal(app.classes.has('is-running'), false);
  assert.equal(app.timers.size, 0);

  app.click();
  assert.equal(app.robot.dataset.side, 'left');
  app.arrive();
  assert.equal(app.robot.dataset.facing, 'right');
  assert.match(app.attributes.get('aria-label'), /правый/);
});

test('rapid clicks and unrelated transitions do not interrupt a run', () => {
  const app = setup();
  app.click();
  app.click();
  app.robot.emit('transitionend', { propertyName: 'opacity' });
  app.robot.emit('transitionend', { propertyName: 'left', target: {} });
  app.click();
  assert.equal(app.robot.dataset.side, 'right');
  assert.equal(app.classes.has('is-running'), true);
  assert.equal(app.timers.size, 1);
  app.arrive();
  app.click();
  assert.equal(app.robot.dataset.side, 'left');
});

test('timeout and canceled transitions restore interaction', () => {
  for (const completion of ['timeout', 'transitioncancel']) {
    const app = setup();
    app.click();
    if (completion === 'timeout') app.timers.values().next().value.callback();
    else app.robot.emit(completion, { propertyName: 'left' });
    assert.equal(app.classes.has('is-running'), false);
    assert.equal(app.timers.size, 0);
    app.click();
    assert.equal(app.robot.dataset.side, 'left');
  }
});

test('resize, motion preference change and hidden tab finish the current run', () => {
  for (const change of ['resize', 'motion', 'hidden']) {
    const app = setup();
    app.click();
    if (change === 'resize') app.window.emit('resize');
    if (change === 'motion') {
      app.motion.matches = true;
      app.motion.emit('change');
    }
    if (change === 'hidden') {
      app.document.hidden = true;
      app.document.emit('visibilitychange');
    }
    assert.equal(app.robot.dataset.side, 'right');
    assert.equal(app.classes.has('is-running'), false);
    assert.equal(app.attributes.has('aria-disabled'), false);
    assert.equal(app.timers.size, 0);
    app.click();
    assert.equal(app.robot.dataset.side, 'left');
  }
});

test('reduced motion and zero available distance allow immediate round trips', () => {
  for (const options of [{ reduced: true }, { width: 64 }, { width: 30 }]) {
    const app = setup(options);
    app.click();
    assert.equal(app.robot.dataset.side, 'right');
    assert.equal(app.classes.has('is-running'), false);
    assert.equal(app.timers.size, 0);
    app.click();
    assert.equal(app.robot.dataset.side, 'left');
  }
});

test('fallback completion remains bounded on small and large screens', () => {
  for (const width of [100, 375, 1280, 10000]) {
    const app = setup({ width });
    app.click();
    const { delay } = app.timers.values().next().value;
    assert.ok(delay >= 820 && delay <= 2720);
  }
});

test('pages without the robot do not throw', () => {
  assert.doesNotThrow(() => setup({ missing: true }));
});

test('English labels follow the destination in both directions', () => {
  const app = setup({ language: 'en' });
  assert.match(app.attributes.get('aria-label'), /right corner/);
  app.click();
  app.arrive();
  assert.match(app.attributes.get('aria-label'), /left corner/);
  assert.match(app.robot.title, /left corner/);
  app.click();
  app.arrive();
  assert.match(app.attributes.get('aria-label'), /right corner/);
});

test('language switches update the robot without interrupting its run', () => {
  const app = setup();
  app.click();
  app.document.documentElement.lang = 'en';
  app.document.emit('portfolio:languagechange');
  assert.match(app.attributes.get('aria-label'), /right corner/);
  assert.equal(app.classes.has('is-running'), true);
  assert.equal(app.timers.size, 1);
  app.arrive();
  assert.match(app.attributes.get('aria-label'), /left corner/);
  app.document.documentElement.lang = 'ru';
  app.document.emit('portfolio:languagechange');
  assert.match(app.attributes.get('aria-label'), /левый/);
});

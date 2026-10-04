const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../system/i18n.js'), 'utf8');
const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const storageKey = 'portfolio-language';

function element(properties = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    ...properties, attributes,
    setAttribute: (key, value) => attributes.set(key, value),
    addEventListener: (type, listener) => listeners.set(type, listener),
    emit: type => listeners.get(type)?.(),
  };
}

function targets(attribute, datasetKey) {
  return [...html.matchAll(new RegExp(`<[^>]+${attribute}="([^"]+)"[^>]*>`, 'g'))].map(match => {
    const fallback = html.slice(match.index + match[0].length).split('<')[0].replaceAll('&nbsp;', '\u00a0');
    return element({ dataset: { [datasetKey]: match[1] }, textContent: fallback, fallback });
  });
}

function setup({ language = 'ru-RU', languages, storage = new Map(), blockRead = false, blockWrite = false, hasToggle = true } = {}) {
  const nodes = targets('data-i18n', 'i18n');
  const labels = targets('data-i18n-label', 'i18nLabel');
  const echoes = targets('data-i18n-glitch', 'i18nGlitch');
  const toggle = element({ hidden: true });
  const meta = element();
  const events = [];
  const document = {
    documentElement: { lang: 'ru' },
    getElementById: () => hasToggle ? toggle : null,
    querySelector: () => meta,
    querySelectorAll: selector => ({
      '[data-i18n]': nodes,
      '[data-i18n-label]': labels,
      '[data-i18n-glitch]': echoes,
    })[selector],
    dispatchEvent: event => events.push(event.type),
  };
  const window = element({
    navigator: { language, languages },
    localStorage: {
      getItem(key) {
        if (blockRead) throw new Error('Storage unavailable');
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (blockWrite) throw new Error('Storage unavailable');
        storage.set(key, value);
      },
    },
  });
  class CustomEvent { constructor(type) { this.type = type; } }
  runInNewContext(source, { document, window, CustomEvent });
  return { document, window, toggle, meta, nodes, labels, echoes, events, storage };
}

test('Russian browser locales select Russian and preserve the original HTML text', () => {
  for (const language of ['ru', 'ru-RU', 'ru-BY', 'RU-ru']) {
    const app = setup({ language });
    assert.equal(app.document.documentElement.lang, 'ru');
    for (const node of app.nodes) assert.equal(node.textContent, node.fallback);
    assert.equal(app.toggle.hidden, false);
    assert.equal(app.toggle.attributes.get('aria-label'), 'Switch to English');
    assert.equal(app.storage.size, 0);
  }
});

test('every other or missing browser language falls back to English', () => {
  for (const language of ['en-US', 'de-DE', 'fr', 'uk-UA', 'ja-JP', '', undefined]) {
    const app = setup({ language: language ?? '' });
    assert.equal(app.document.documentElement.lang, 'en');
    assert.equal(app.document.title, 'Nikita Pyatov · team lead');
    assert.match(app.meta.attributes.get('content'), /10 years in software development/);
    for (const node of app.nodes) {
      assert.equal(typeof node.textContent, 'string');
      assert.ok(node.textContent.length > 0);
      assert.doesNotMatch(node.textContent, /[а-яё]/i);
    }
    for (const label of app.labels) assert.doesNotMatch(label.attributes.get('aria-label'), /[а-яё]/i);
  }
});

test('only the preferred browser language determines the initial language', () => {
  assert.equal(setup({ languages: ['de-DE', 'ru-RU'] }).document.documentElement.lang, 'en');
  assert.equal(setup({ language: 'en', languages: ['ru-RU', 'en'] }).document.documentElement.lang, 'ru');
  assert.equal(setup({ language: 'ru', languages: [] }).document.documentElement.lang, 'ru');
});

test('manual selection survives a reload and overrides the browser preference', () => {
  const app = setup();
  app.toggle.emit('click');
  assert.equal(app.document.documentElement.lang, 'en');
  assert.equal(app.toggle.lang, 'ru');
  assert.equal(app.toggle.title, 'Переключить на русский');
  assert.equal(app.storage.get(storageKey), 'en');
  const reloaded = setup({ storage: app.storage, language: 'ru-RU' });
  assert.equal(reloaded.document.documentElement.lang, 'en');
  reloaded.toggle.emit('click');
  assert.equal(reloaded.storage.get(storageKey), 'ru');
  assert.equal(setup({ storage: reloaded.storage, language: 'en-US' }).document.documentElement.lang, 'ru');
});

test('unsupported saved values are ignored', () => {
  for (const value of ['fr', 'RU', 'toString', '<script>']) {
    const storage = new Map([[storageKey, value]]);
    assert.equal(setup({ storage, language: 'de' }).document.documentElement.lang, 'en');
    assert.equal(setup({ storage, language: 'ru' }).document.documentElement.lang, 'ru');
  }
});

test('storage failures do not prevent automatic selection or manual switching', () => {
  const app = setup({ language: 'de', blockRead: true, blockWrite: true });
  assert.equal(app.document.documentElement.lang, 'en');
  app.toggle.emit('click');
  assert.equal(app.document.documentElement.lang, 'ru');
  app.window.emit('languagechange');
  assert.equal(app.document.documentElement.lang, 'ru');
  app.toggle.emit('click');
  assert.equal(app.document.documentElement.lang, 'en');
});

test('glitch copies, labels and metadata follow both language changes', () => {
  const app = setup();
  for (const language of ['ru', 'en', 'ru']) {
    assert.equal(app.document.documentElement.lang, language);
    for (const echo of app.echoes) {
      const visible = app.nodes.find(node => node.dataset.i18n === echo.dataset.i18nGlitch);
      assert.equal(echo.dataset.text, visible.textContent);
    }
    assert.match(app.document.title, language === 'ru' ? /Пятов Никита/ : /Nikita Pyatov/);
    assert.match(app.meta.attributes.get('content'), language === 'ru' ? /Довожу дело до конца/ : /I see things through/);
    app.toggle.emit('click');
  }
  assert.deepEqual(app.events, Array(4).fill('portfolio:languagechange'));
});

test('browser preference changes apply until the visitor chooses a language', () => {
  const app = setup();
  app.window.navigator.language = 'de';
  app.window.emit('languagechange');
  assert.equal(app.document.documentElement.lang, 'en');
  app.toggle.emit('click');
  app.window.emit('languagechange');
  assert.equal(app.document.documentElement.lang, 'ru');
});

test('content can be translated without the toggle', () => {
  const app = setup({ language: 'en', hasToggle: false });
  assert.equal(app.document.documentElement.lang, 'en');
});

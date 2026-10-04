(() => {
  const storageKey = 'portfolio-language';
  const messages = {
    ru: {
      title: 'Пятов Никита · team lead',
      description: 'Пятов Никита — team lead / engineering manager. Нахожу главное. Берегу людей. Довожу дело до конца. 10 лет в разработке.',
      name: 'Пятов Никита',
      role: 'team lead · engineering manager · 10 лет',
      manifestoFocus: 'Нахожу главное.',
      manifestoPeople: 'Берегу людей.',
      manifestoFinish: 'Довожу дело до\u00a0конца.',
      aboutIntro: 'разбираюсь в причинах, ставлю под вопрос привычные решения и выбираю то, что действительно важно. собираю ',
      aboutTeam: 'самостоятельные команды вокруг ясной цели.',
      aboutStandards: 'берегу время и внимание людей. задаю высокую планку и помогаю её держать. для меня дело закончено, когда ',
      aboutResult: 'решение работает и приносит пользу',
      aboutBeneficiaries: ' тем, для кого его сделали.',
      terminalLabel: 'Личная карточка — терминал',
      aboutLabel: 'Как я работаю',
      contactsLabel: 'Контакты',
    },
    en: {
      title: 'Nikita Pyatov · team lead',
      description: 'Nikita Pyatov — team lead / engineering manager. I find what matters. I care for people. I see things through. 10 years in software development.',
      name: 'Nikita Pyatov',
      role: 'team lead · engineering manager · 10 years',
      manifestoFocus: 'I find what matters.',
      manifestoPeople: 'I care for people.',
      manifestoFinish: 'I see things through.',
      aboutIntro: 'i look for root causes, challenge conventional solutions and focus on what really matters. i build ',
      aboutTeam: 'independent teams around a clear goal.',
      aboutStandards: 'i protect people’s time and attention. i set high standards and help teams meet them. to me, the work is done when ',
      aboutResult: 'the solution works and creates value',
      aboutBeneficiaries: ' for the people it was built for.',
      terminalLabel: 'Personal profile — terminal',
      aboutLabel: 'How I work',
      contactsLabel: 'Contacts',
    },
  };
  const toggle = document.getElementById('language-toggle');
  let manualLanguage = null;

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'ru' || saved === 'en') manualLanguage = saved;
  } catch {
    // Language switching still works when browser storage is unavailable.
  }

  function browserLanguage() {
    const preferred = window.navigator.languages?.[0] || window.navigator.language || '';
    return /^ru(?:-|$)/i.test(preferred) ? 'ru' : 'en';
  }

  function applyLanguage(language) {
    const text = messages[language];
    document.documentElement.lang = language;
    document.title = text.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', text.description);

    document.querySelectorAll('[data-i18n]').forEach(element => {
      element.textContent = text[element.dataset.i18n];
    });
    document.querySelectorAll('[data-i18n-label]').forEach(element => {
      element.setAttribute('aria-label', text[element.dataset.i18nLabel]);
    });
    document.querySelectorAll('[data-i18n-glitch]').forEach(element => {
      element.dataset.text = text[element.dataset.i18nGlitch];
    });

    if (toggle) {
      const label = language === 'ru' ? 'Switch to English' : 'Переключить на русский';
      toggle.lang = language === 'ru' ? 'en' : 'ru';
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
      toggle.hidden = false;
    }
    document.dispatchEvent(new CustomEvent('portfolio:languagechange'));
  }

  toggle?.addEventListener('click', () => {
    manualLanguage = document.documentElement.lang === 'ru' ? 'en' : 'ru';
    applyLanguage(manualLanguage);
    try {
      window.localStorage.setItem(storageKey, manualLanguage);
    } catch {
      // Keep the selected language for this visit even if it cannot be saved.
    }
  });
  window.addEventListener('languagechange', () => {
    if (!manualLanguage) applyLanguage(browserLanguage());
  });

  applyLanguage(manualLanguage || browserLanguage());
})();

(() => {
  const track = document.getElementById('robot-track');
  const robot = document.getElementById('terminal-robot');
  if (!track || !robot) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let running = false;
  let finishTimer;

  function updateLabel() {
    const nextSide = running ? robot.dataset.side : robot.dataset.side === 'left' ? 'right' : 'left';
    if (document.documentElement.lang === 'en') {
      robot.setAttribute('aria-label', `Robot. Run to the ${nextSide} corner`);
      robot.title = `Click — I'll run to the ${nextSide} corner`;
    } else {
      const nextCorner = nextSide === 'right' ? 'правый' : 'левый';
      robot.setAttribute('aria-label', `Робот. Перебежать в ${nextCorner} угол`);
      robot.title = `Нажми — побегу в ${nextCorner} угол`;
    }
  }

  function settle() {
    window.clearTimeout(finishTimer);
    running = false;
    robot.classList.remove('is-running');
    robot.removeAttribute('aria-disabled');

    robot.dataset.facing = robot.dataset.side === 'left' ? 'right' : 'left';
    updateLabel();
  }

  robot.addEventListener('click', () => {
    if (running) return;

    const nextSide = robot.dataset.side === 'left' ? 'right' : 'left';
    const distance = Math.max(0, track.clientWidth - robot.offsetWidth);

    if (reducedMotion.matches || distance === 0) {
      robot.dataset.side = nextSide;
      settle();
      return;
    }

    const duration = Math.min(2600, Math.max(700, distance / 450 * 1000));
    running = true;
    robot.dataset.facing = nextSide;
    robot.style.setProperty('--run-duration', `${duration}ms`);
    robot.classList.add('is-running');
    robot.setAttribute('aria-disabled', 'true');
    robot.dataset.side = nextSide;
    updateLabel();

    // Also finish when a browser suppresses transition events in a hidden tab.
    finishTimer = window.setTimeout(settle, duration + 120);
  });

  robot.addEventListener('transitionend', (event) => {
    if (running && event.target === robot && event.propertyName === 'left') settle();
  });
  robot.addEventListener('transitioncancel', (event) => {
    if (running && event.target === robot && event.propertyName === 'left') settle();
  });
  window.addEventListener('resize', settle);
  reducedMotion.addEventListener('change', settle);
  document.addEventListener('portfolio:languagechange', updateLabel);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) settle();
  });

  settle();
  track.hidden = false;
})();

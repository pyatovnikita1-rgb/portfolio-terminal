(() => {
  const spotlight = document.getElementById('matrix-spotlight');
  const canvas = spotlight?.querySelector('canvas');
  const context = canvas?.getContext('2d');
  if (!context) return;

  const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const radius = 220;
  const size = radius * 2;
  const columnWidth = 18;
  const rowHeight = 20;
  const trailLength = 22;
  const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>[]{}:+*';
  let pointer = null;
  let frame = 0;
  let lastPaint = -Infinity;

  // Stable columns reveal the same field as the cursor moves across the page.
  function seed(value) {
    const number = Math.sin(value * 127.1 + 311.7) * 43758.5453;
    return number - Math.floor(number);
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    lastPaint = -Infinity;
    if (pointer) requestFrame();
  }

  function draw(time) {
    const left = pointer.x - radius;
    const top = pointer.y - radius;
    const cycleHeight = window.innerHeight + trailLength * rowHeight;
    canvas.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    context.clearRect(0, 0, size, size);

    const glow = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
    glow.addColorStop(0, 'rgba(176, 38, 255, 0.09)');
    glow.addColorStop(0.45, 'rgba(176, 38, 255, 0.04)');
    glow.addColorStop(1, 'rgba(176, 38, 255, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
    context.font = '13px "NN Mono", monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const firstColumn = Math.floor(left / columnWidth);
    const lastColumn = Math.ceil((left + size) / columnWidth);
    for (let column = firstColumn; column <= lastColumn; column++) {
      const offset = seed(column);
      const speed = 28 + offset * 32;
      const head = (time / 1000 * speed + offset * cycleHeight) % cycleHeight;
      const x = column * columnWidth - left;
      for (let tail = 0; tail < trailLength; tail++) {
        const y = head - tail * rowHeight - top;
        if (y < -rowHeight || y > size + rowHeight) continue;
        const index = Math.floor(seed(column * 67 + tail * 13 + Math.floor(time / 1600)) * glyphs.length);
        const alpha = 0.4 * (1 - tail / trailLength);
        context.fillStyle = tail === 0 ? 'rgba(224, 186, 255, 0.6)' : `rgba(176, 70, 255, ${alpha})`;
        context.fillText(glyphs[index], x, y);
      }
    }

    // Fade every glyph to transparent at the edge; nothing is drawn outside the light.
    const mask = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
    mask.addColorStop(0, 'rgba(0, 0, 0, 1)');
    mask.addColorStop(0.3, 'rgba(0, 0, 0, 0.9)');
    mask.addColorStop(0.7, 'rgba(0, 0, 0, 0.3)');
    mask.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.globalCompositeOperation = 'destination-in';
    context.fillStyle = mask;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = 'source-over';
  }

  function render(time) {
    frame = 0;
    if (!pointer || document.hidden || !finePointer.matches) return;
    if (reducedMotion.matches || time - lastPaint >= 1000 / 30) {
      draw(reducedMotion.matches ? 0 : time);
      lastPaint = time;
    }
    if (!reducedMotion.matches) requestFrame();
  }

  function requestFrame() {
    if (!frame) frame = window.requestAnimationFrame(render);
  }

  function hide() {
    pointer = null;
    window.cancelAnimationFrame(frame);
    frame = 0;
    lastPaint = -Infinity;
    spotlight.classList.remove('is-visible');
  }

  document.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || !finePointer.matches || document.hidden) {
      hide();
      return;
    }
    pointer = { x: event.clientX, y: event.clientY };
    spotlight.hidden = false;
    spotlight.classList.add('is-visible');
    requestFrame();
  }, { passive: true });
  document.addEventListener('pointerleave', hide);
  document.addEventListener('pointercancel', hide);
  window.addEventListener('blur', hide);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hide();
  });
  finePointer.addEventListener('change', hide);
  reducedMotion.addEventListener('change', () => {
    lastPaint = -Infinity;
    if (pointer) requestFrame();
  });

  resize();
})();

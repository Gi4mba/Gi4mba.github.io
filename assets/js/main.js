// Contact form. Sends through the EmailJS REST API: no SDK, no third-party script.
// The public key below is public by design; restrict it in the EmailJS dashboard.
(() => {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');

  const ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';
  const IDS = {
    service_id: 'service_aqdrbt7',
    template_id: 'template_m294r78',
    user_id: 'WCnhUabRw2QYI15hS',
  };

  function say(kind, text) {
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
    status.textContent = text;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = new FormData(form);

    // Honeypot: a human never fills this. Pretend success, send nothing.
    if (data.get('website')) {
      say('ok', form.dataset.ok);
      form.reset();
      return;
    }

    button.disabled = true;
    say('', form.dataset.sending);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...IDS,
          template_params: {
            user_name: data.get('user_name'),
            user_email: data.get('user_email'),
            message: data.get('message'),
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('EmailJS answered ' + response.status);

      say('ok', form.dataset.ok);
      form.reset();
    } catch (error) {
      console.error(error);
      say('error', form.dataset.error);
    } finally {
      button.disabled = false;
    }
  });
})();

// ---------------------------------------------------------------------------
// Dock. Scrolling down, the header folds into a hex block parked top right.
// Pressing the block squashes it toward the finger; it springs back and opens
// a panel built from the page's own sections. Scrolling down again folds the
// panel back into the block. Back at the top, the block unfolds into the header.
// ---------------------------------------------------------------------------
(() => {
  const header = document.querySelector('.site-header');
  const dock = document.querySelector('.dock');
  const sentinel = document.querySelector('.dock-sentinel');
  if (!header || !dock || !sentinel) return;
  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return;

  const block = dock.querySelector('.dock-block');
  const ghost = dock.querySelector('.dock-ghost');
  const panel = dock.querySelector('.dock-panel');
  const list = dock.querySelector('.dock-list');
  const foot = dock.querySelector('.dock-foot');
  const role = dock.querySelector('.dock-role');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Ghost shapes: same six vertices in the same order, so the browser
  // interpolates the bar into the hexagon point by point.
  const RECT = 'polygon(100% 50%, 100% 100%, 0% 100%, 0% 50%, 0% 0%, 100% 0%)';
  const HEX = 'polygon(95% 50%, 72.5% 89%, 27.5% 89%, 5% 50%, 27.5% 11%, 72.5% 11%)';
  const FULL = 'inset(0px 0px 0px 0px round 16px)';
  const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

  // ---- Spring physics ------------------------------------------------------
  // A damped spring, sampled into a CSS linear() easing so the browser can run
  // it on the compositor. Returns the easing and the time it takes to settle.
  const canLinear = CSS.supports('animation-timing-function', 'linear(0, 1)');
  function spring(stiffness, damping) {
    if (!canLinear) return { easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', duration: 560 };
    const w0 = Math.sqrt(stiffness);
    const zeta = damping / (2 * w0);
    const wd = w0 * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta));
    const x = (t) => (zeta < 1
      ? 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
      : 1 - Math.exp(-w0 * t) * (1 + w0 * t));
    let settle = 0;
    for (let t = 0; t <= 3; t += 1 / 240) if (Math.abs(1 - x(t)) > 0.002) settle = t;
    const n = 40;
    const points = [];
    for (let i = 0; i <= n; i++) points.push(i === n ? 1 : +x((i / n) * settle).toFixed(4));
    return { easing: `linear(${points.join(', ')})`, duration: Math.round(settle * 1000) };
  }
  // The morph covers a huge scale range (the bar is ~20x wider than the block),
  // so any overshoot there would pinch it into a sliver. It runs critically
  // damped; the bounce happens on the block itself when it lands.
  const MORPH = spring(180, 27);
  const POP = spring(420, 15);   // release after a press: lively bounce
  const PANEL = spring(260, 25); // panel opening out of the block

  // ---- Animation bookkeeping -----------------------------------------------
  let state = 'off'; // 'off' | 'docked' | 'open'
  let run = 0;       // bumps on every transition, so stale async steps bail out
  const live = new Set();
  const play = (el, frames, opts) => {
    const a = el.animate(frames, opts);
    live.add(a);
    a.finished.then(() => live.delete(a), () => live.delete(a));
    return a;
  };
  const stop = () => { live.forEach((a) => a.cancel()); live.clear(); };
  const done = (a) => a.finished.then(() => true, () => false);

  // The header's visual footprint (its content box, padded a little)
  // pinTop: while scrolling down the header is already sliding off screen,
  // so the bar is pinned to the top edge to stay fully visible as it folds.
  function barRect(pinTop = false) {
    const r = header.getBoundingClientRect();
    const cs = getComputedStyle(header);
    const left = r.left + parseFloat(cs.paddingLeft) - 14;
    const right = r.right - parseFloat(cs.paddingRight) + 14;
    let top = r.top + parseFloat(cs.paddingTop) - 10;
    const height = r.bottom + 10 - top;
    if (pinTop) top = Math.max(top, 8);
    return { left, top, width: right - left, height };
  }
  function barTransform(bar) {
    const d = dock.getBoundingClientRect();
    return `translate(${bar.left - d.left}px, ${bar.top - d.top}px) scale(${bar.width / d.width}, ${bar.height / d.height})`;
  }

  // ---- Header -> block -----------------------------------------------------
  async function dockIn(animate) {
    const id = ++run;
    stop();
    const bar = barTransform(barRect(true));
    header.classList.add('is-docked');
    state = 'docked';
    if (!animate || reduce.matches) { dock.dataset.state = 'docked'; return; }

    ghost.style.transformOrigin = '0 0';
    // 1. the header's footprint lights up as a bar pinned to the top edge
    const glow = play(ghost, [
      { transform: bar, clipPath: RECT, opacity: 0.5 },
      { transform: bar, clipPath: RECT, opacity: 1 },
    ], { duration: 90, easing: 'ease-out', fill: 'forwards' });
    if (!(await done(glow)) || id !== run) return;

    // 2. the bar folds into a hexagon and travels to the corner
    const fold = play(ghost, [
      { transform: bar, clipPath: RECT, opacity: 1 },
      { transform: 'none', clipPath: HEX, opacity: 1 },
    ], { duration: MORPH.duration, easing: MORPH.easing, fill: 'forwards' });
    glow.cancel();
    if (!(await done(fold)) || id !== run) return;

    // 3. the real block lands: it hits the corner travelling right, so it
    //    squashes horizontally and springs back. The ghost dissolves outward.
    dock.dataset.state = 'docked';
    block.style.transformOrigin = '100% 50%';
    play(block, [{ transform: 'scale(0.8, 1.12)' }, { transform: 'scale(1)' }], { duration: POP.duration, easing: POP.easing });
    ghost.style.transformOrigin = '50% 50%';
    const fade = play(ghost, [
      { transform: 'none', clipPath: HEX, opacity: 1 },
      { transform: 'scale(1.35)', clipPath: HEX, opacity: 0 },
    ], { duration: 420, easing: EASE_OUT });
    fold.cancel();
    await done(fade);
  }

  // ---- Block -> header -----------------------------------------------------
  async function dockOut(animate) {
    const id = ++run;
    stop();
    if (state === 'open') closePanel(false);
    panel.hidden = true;
    state = 'off';
    if (!animate || reduce.matches) {
      dock.dataset.state = 'off';
      header.classList.remove('is-docked');
      return;
    }

    const bar = barTransform(barRect());
    dock.dataset.state = 'off'; // the real block hides, the ghost stands in
    ghost.style.transformOrigin = '0 0';
    const unfold = play(ghost, [
      { transform: 'none', clipPath: HEX, opacity: 1 },
      { transform: bar, clipPath: RECT, opacity: 1 },
    ], { duration: MORPH.duration, easing: MORPH.easing, fill: 'forwards' });
    if (!(await done(unfold)) || id !== run) return;

    header.classList.remove('is-docked'); // header items slide back (CSS)
    const fade = play(ghost, [
      { transform: bar, clipPath: RECT, opacity: 1 },
      { transform: bar, clipPath: RECT, opacity: 0 },
    ], { duration: 320, easing: 'ease-out' });
    unfold.cancel();
    await done(fade);
  }

  // ---- Panel ---------------------------------------------------------------
  // Clip from the block's footprint inside the panel to the full panel
  function cornerInset() {
    const p = panel.getBoundingClientRect();
    const b = block.getBoundingClientRect();
    return `inset(${b.top - p.top}px ${p.right - b.right}px ${p.bottom - b.bottom}px ${b.left - p.left}px round 28px)`;
  }

  let openY = 0;
  function onScroll() {
    const y = window.scrollY;
    if (y < openY) openY = y;               // scrolling up keeps it open
    else if (y - openY > 40) closePanel(true); // scrolling down folds it away
  }

  function openPanel() {
    if (state !== 'docked') return;
    ++run;
    stop();
    state = 'open';
    dock.dataset.state = 'open';
    block.setAttribute('aria-expanded', 'true');
    block.setAttribute('aria-label', dock.dataset.labelClose);
    panel.hidden = false;
    openY = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    const first = list.querySelector('a');
    if (first) first.focus({ preventScroll: true });

    if (reduce.matches) {
      play(panel, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
      return;
    }
    play(panel, [
      { clipPath: cornerInset(), opacity: 0.5 },
      { clipPath: FULL, opacity: 1 },
    ], { duration: PANEL.duration, easing: PANEL.easing });
    [panel.querySelector('.dock-head'), ...list.children, foot].forEach((el, i) => {
      play(el, [
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 460, delay: 80 + i * 45, easing: EASE_OUT, fill: 'backwards' });
    });
  }

  async function closePanel(animate = true) {
    if (state !== 'open') return;
    state = 'docked';
    dock.dataset.state = 'docked';
    block.setAttribute('aria-expanded', 'false');
    block.setAttribute('aria-label', dock.dataset.labelOpen);
    window.removeEventListener('scroll', onScroll);
    // never leave focus on something that is about to disappear
    if (panel.contains(document.activeElement)) block.focus({ preventScroll: true });
    if (!animate || reduce.matches) { panel.hidden = true; return; }

    const id = ++run;
    const fold = play(panel, [
      { clipPath: FULL, opacity: 1 },
      { clipPath: cornerInset(), opacity: 0 },
    ], { duration: 340, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)', fill: 'forwards' });
    // the block swallows the panel: a short gulp as it closes
    block.style.transformOrigin = '50% 50%';
    block.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
      { duration: 420, delay: 200, easing: 'ease-out' });
    if (!(await done(fold)) || id !== run) return;
    panel.hidden = true;
    fold.cancel();
  }

  // ---- Touch: squash toward the finger, spring back on release -------------
  let pressed = null;
  block.addEventListener('pointerdown', (e) => {
    if (reduce.matches || e.button !== 0) return;
    const r = block.getBoundingClientRect();
    const vx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const vy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const k = Math.min(1, Math.hypot(vx, vy));
    const a = Math.atan2(vy, vx);
    // anchored on the far side, so the side under the finger gives way
    block.style.transformOrigin = `${50 - vx * 35}% ${50 - vy * 35}%`;
    const axis = (along, across) => `rotate(${a}rad) scale(${along}, ${across}) rotate(${-a}rad)`;
    const squash = axis(0.92 - 0.08 * k, 0.92 + 0.13 * k); // centre press: even squeeze
    const rest = axis(1, 1);
    block.classList.add('is-pressed');
    pressed = {
      squash,
      rest,
      anim: block.animate([{ transform: rest }, { transform: squash }],
        { duration: 120, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' }),
    };
  });
  const release = () => {
    if (!pressed) return;
    const { squash, rest, anim } = pressed;
    pressed = null;
    block.classList.remove('is-pressed');
    block.animate([{ transform: squash }, { transform: rest }], { duration: POP.duration, easing: POP.easing });
    anim.cancel();
  };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => block.addEventListener(t, release));

  block.addEventListener('click', (e) => {
    if (e.detail === 0 && !reduce.matches) { // keyboard: a small centred pop
      block.style.transformOrigin = '50% 50%';
      block.animate([{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { duration: POP.duration, easing: POP.easing });
    }
    if (state === 'open') closePanel(true);
    else openPanel();
  });

  document.addEventListener('pointerdown', (e) => {
    if (state === 'open' && !dock.contains(e.target)) closePanel(true);
  });
  dock.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state === 'open') {
      e.preventDefault();
      closePanel(true);
      block.focus({ preventScroll: true });
    }
  });

  // ---- Panel content: built from the page itself ---------------------------
  role.textContent = (document.querySelector('.eyebrow') || {}).textContent || '';
  const sections = [...document.querySelectorAll('main section[id]')].filter((s) => s.querySelector('.label'));
  for (const s of sections) {
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    const name = document.createElement('span');
    name.className = 'dock-name';
    name.textContent = s.querySelector('.label').textContent.trim();
    a.append(name);
    const h = s.querySelector('h2, .path-what'); // the heading, or the first line of a list section
    if (h) {
      const line = document.createElement('span');
      line.className = 'dock-line';
      line.textContent = h.textContent.trim();
      a.append(line);
    }
    const li = document.createElement('li');
    li.append(a);
    list.append(li);
  }
  list.addEventListener('click', (e) => { if (e.target.closest('a')) closePanel(true); });

  const lang = header.querySelector('.lang');
  if (lang) foot.append(lang.cloneNode(true));
  const gh = document.createElement('a');
  gh.className = 'link-mono';
  gh.href = 'https://github.com/Gi4mba';
  gh.target = '_blank';
  gh.rel = 'noopener';
  gh.textContent = 'GitHub';
  foot.append(gh);

  // "You are here": the section crossing the middle of the viewport
  const links = new Map([...list.querySelectorAll('a')].map((a) => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      links.forEach((a, sid) => {
        if (sid === en.target.id) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => spy.observe(s));

  // ---- Trigger: a sentinel at the top of the page --------------------------
  let first = true;
  new IntersectionObserver(([en]) => {
    const animate = !first;
    first = false;
    if (en.isIntersecting && state !== 'off') dockOut(animate);
    else if (!en.isIntersecting && state === 'off') dockIn(animate);
  }).observe(sentinel);
})();

// ---------------------------------------------------------------------------
// DnA-DAO vote simulator. Same integer checks as GovernanceDAO.status(),
// once voting has ended:
//   votes * 100 < 40 * totalShares  -> quorum not reached
//   For * 2 <= For + Against        -> rejected (a tie is rejected)
//   otherwise                       -> approved
// The page ships with the default outcome already rendered: nothing runs
// until the visitor touches a control.
// ---------------------------------------------------------------------------
(() => {
  const sim = document.getElementById('sim');
  if (!sim) return;

  const QUORUM = 40;
  const fields = {
    for: sim.querySelector('#sim-for'),
    against: sim.querySelector('#sim-against'),
    abstain: sim.querySelector('#sim-abstain'),
  };
  const outs = {
    for: sim.querySelector('#sim-for-out'),
    against: sim.querySelector('#sim-against-out'),
    abstain: sim.querySelector('#sim-abstain-out'),
  };
  const bar = sim.querySelector('.sim-bar');
  const statusEl = sim.querySelector('.sim-status');
  const [quorumCheck, approvalCheck] = sim.querySelectorAll('.sim-check');
  const rest = sim.querySelector('.sim-rest');

  const lang = document.documentElement.lang === 'it' ? 'it' : 'en';
  const T = {
    en: {
      approved: 'Approved',
      rejected: 'Rejected',
      quorum: 'Quorum not reached',
      quorumOk: 'Quorum reached: {p} of shares voted, 40% needed',
      quorumNo: 'Quorum missed: {p} of shares voted, 40% needed',
      approvalOk: 'More For than Against: {f} to {a}',
      approvalNo: 'For does not beat Against: {f} to {a}',
      approvalSkip: 'Approval not checked: the quorum is evaluated first',
      rest: '{n} shares did not vote',
    },
    it: {
      approved: 'Approvata',
      rejected: 'Respinta',
      quorum: 'Quorum non raggiunto',
      quorumOk: 'Quorum raggiunto: ha votato il {p} delle quote, serve il 40%',
      quorumNo: 'Quorum mancato: ha votato il {p} delle quote, serve il 40%',
      approvalOk: 'Più favorevoli che contrari: {f} a {a}',
      approvalNo: 'I favorevoli non superano i contrari: {f} a {a}',
      approvalSkip: 'Approvazione non valutata: prima si controlla il quorum',
      rest: '{n} quote non hanno votato',
    },
  }[lang];
  const num = new Intl.NumberFormat(lang);
  const pct = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 });

  function status(forShares, againstShares, abstainShares, totalShares) {
    const votes = forShares + againstShares + abstainShares;
    if (votes * 100 < QUORUM * totalShares) return 'quorum';
    if (forShares * 2 <= forShares + againstShares) return 'rejected';
    return 'approved';
  }

  let frame = 0;
  function render() {
    frame = 0;
    const total = Number(sim.dataset.total);
    const f = Number(fields.for.value);
    const a = Number(fields.against.value);
    const b = Number(fields.abstain.value);
    const votes = f + a + b;
    const s = status(f, a, b, total);

    outs.for.textContent = num.format(f);
    outs.against.textContent = num.format(a);
    outs.abstain.textContent = num.format(b);
    bar.style.setProperty('--f', f / total);
    bar.style.setProperty('--a', a / total);
    bar.style.setProperty('--b', b / total);

    // the live region speaks only when the outcome actually changes
    if (statusEl.dataset.status !== s) {
      statusEl.dataset.status = s;
      statusEl.textContent = T[s];
    }
    sim.dataset.status = s;

    const quorumOk = s !== 'quorum';
    quorumCheck.dataset.ok = String(quorumOk);
    quorumCheck.textContent = (quorumOk ? T.quorumOk : T.quorumNo).replace('{p}', pct.format(votes / total));
    if (!quorumOk) {
      approvalCheck.dataset.ok = 'skip';
      approvalCheck.textContent = T.approvalSkip;
    } else {
      const ok = s === 'approved';
      approvalCheck.dataset.ok = String(ok);
      approvalCheck.textContent = (ok ? T.approvalOk : T.approvalNo)
        .replace('{f}', num.format(f))
        .replace('{a}', num.format(a));
    }
    rest.textContent = T.rest.replace('{n}', num.format(total - votes));
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };

  sim.addEventListener('input', (e) => {
    const input = e.target.closest('input[type="range"]');
    if (!input) return;
    // votes can never exceed the shares that exist
    const total = Number(sim.dataset.total);
    const others = Object.values(fields).filter((x) => x !== input).reduce((sum, x) => sum + Number(x.value), 0);
    if (Number(input.value) > total - others) input.value = total - others;
    schedule();
  });

  sim.addEventListener('click', (e) => {
    const button = e.target.closest('[data-preset]');
    if (!button) return;
    const [f, a, b] = button.dataset.preset.split(',').map(Number);
    fields.for.value = f;
    fields.against.value = a;
    fields.abstain.value = b;
    schedule();
  });
})();

// ---------------------------------------------------------------------------
// Project cards: the border lights up under the cursor. Mouse only; one
// style write per frame at most.
// ---------------------------------------------------------------------------
(() => {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  for (const card of document.querySelectorAll('.card')) {
    let x = 0;
    let y = 0;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--x', `${x - r.left}px`);
      card.style.setProperty('--y', `${y - r.top}px`);
    };
    card.addEventListener('pointermove', (e) => {
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });
  }
})();

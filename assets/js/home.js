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
// DnA-DAO vote simulator. Same integer checks as GovernanceDAO.status(),
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


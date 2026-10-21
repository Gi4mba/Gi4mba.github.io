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

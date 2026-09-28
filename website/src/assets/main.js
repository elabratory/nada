(function () {
  'use strict';

  // ---- Mobile navigation ----
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  if (header && toggle) {
    var setOpen = function (open) {
      header.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.visually-hidden').textContent = open ? 'Close menu' : 'Menu';
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (header.classList.contains('nav-open') && !header.contains(e.target)) setOpen(false);
    });
    window.matchMedia('(min-width: 861px)').addEventListener('change', function (e) {
      if (e.matches) setOpen(false);
    });
  }

  // ---- Opening hours: highlight today and show open/closed ----
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function shopNow(tz) {
    // Current weekday and minutes-since-midnight in the shop's own time zone.
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    var get = function (type) {
      for (var i = 0; i < parts.length; i++) if (parts[i].type === type) return parts[i].value;
    };
    return { day: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
  }
  var toMin = function (hhmm) { var p = hhmm.split(':'); return Number(p[0]) * 60 + Number(p[1]); };
  var fmt = function (hhmm) {
    var p = hhmm.split(':').map(Number), h = p[0] % 12 || 12;
    return (p[1] ? h + ':' + String(p[1]).padStart(2, '0') : String(h)) + (p[0] >= 12 ? 'pm' : 'am');
  };

  function nextOpening(hours, day, minutes) {
    var start = DAYS.indexOf(day);
    for (var i = 0; i < 8; i++) {
      var name = DAYS[(start + i) % 7];
      var entry = hours.filter(function (h) { return h.day === name; })[0];
      if (!entry || entry.closed) continue;
      if (i === 0 && minutes >= toMin(entry.open)) continue;
      return (i === 0 ? 'today' : i === 1 ? 'tomorrow' : name) + ' at ' + fmt(entry.open);
    }
    return null;
  }

  var statuses = document.querySelectorAll('.open-status[data-hours]');
  var tz = statuses.length ? statuses[0].getAttribute('data-tz') : 'Europe/London';
  var now;
  try { now = shopNow(tz); } catch (e) { now = null; }

  if (now) {
    document.querySelectorAll('.hours tr[data-day="' + now.day + '"]').forEach(function (row) {
      row.classList.add('is-today');
    });
    statuses.forEach(function (el) {
      var hours = JSON.parse(el.getAttribute('data-hours'));
      var today = hours.filter(function (h) { return h.day === now.day; })[0];
      var isOpen = today && !today.closed && now.minutes >= toMin(today.open) && now.minutes < toMin(today.close);
      var next = nextOpening(hours, now.day, now.minutes);
      el.classList.add(isOpen ? 'is-open' : 'is-closed');
      el.textContent = isOpen
        ? 'Open now, until ' + fmt(today.close)
        : 'Closed now' + (next ? ', opens ' + next : '');
    });
  }

  // ---- Contact form ----
  var form = document.getElementById('contact-form');
  if (!form) return;

  var statusEl = form.querySelector('.form-status');
  var submitBtn = form.querySelector('button[type="submit"]');
  var endpoint = form.getAttribute('data-endpoint');
  var shopEmail = form.getAttribute('data-email');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var rules = [
    { name: 'name', test: function (v) { return v.trim().length > 0; }, msg: 'Please enter your name.' },
    { name: 'email', test: function (v) { return EMAIL_RE.test(v.trim()); }, msg: 'Please enter a valid email address, like name@example.com.' },
    { name: 'message', test: function (v) { return v.trim().length > 0; }, msg: 'Please enter a message.' },
  ];

  function setError(input, msg) {
    var err = document.getElementById(input.id + '-error');
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', err.id);
      err.textContent = msg;
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      err.textContent = '';
      err.hidden = true;
    }
  }

  function validate() {
    var firstBad = null;
    rules.forEach(function (r) {
      var input = form.elements[r.name];
      var ok = r.test(input.value);
      setError(input, ok ? '' : r.msg);
      if (!ok && !firstBad) firstBad = input;
    });
    return firstBad;
  }

  rules.forEach(function (r) {
    form.elements[r.name].addEventListener('input', function () {
      if (this.getAttribute('aria-invalid') === 'true' && r.test(this.value)) setError(this, '');
    });
  });

  function showStatus(kind, text) {
    statusEl.className = 'form-status is-' + kind;
    statusEl.textContent = text;
    statusEl.focus();
  }

  function payload() {
    var el = form.elements;
    return {
      name: el.name.value.trim(),
      email: el.email.value.trim(),
      phone: el.phone.value.trim(),
      service: el.service.value,
      message: el.message.value.trim(),
      _gotcha: el._gotcha.value,
    };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    statusEl.textContent = '';
    statusEl.className = 'form-status';

    var bad = validate();
    if (bad) { bad.focus(); return; }

    var data = payload();
    if (data._gotcha) { form.reset(); showStatus('success', 'Thanks, your message has been sent.'); return; }

    if (!endpoint) {
      // No form service configured: hand the message to the visitor's own email app.
      var body = 'Name: ' + data.name + '\nEmail: ' + data.email +
        (data.phone ? '\nPhone: ' + data.phone : '') +
        (data.service ? '\nService: ' + data.service : '') + '\n\n' + data.message;
      window.location.href = 'mailto:' + shopEmail +
        '?subject=' + encodeURIComponent('Website enquiry from ' + data.name) +
        '&body=' + encodeURIComponent(body);
      showStatus('success', 'Your email app should now open with your message ready. Press send there to deliver it. If nothing opened, email us at ' + shopEmail + '.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Sending…';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.reset();
        showStatus('success', 'Thanks, ' + data.name + '. Your message has been sent and we will reply by email.');
      })
      .catch(function () {
        showStatus('error', 'Sorry, your message could not be sent. Please try again, or email us directly at ' + shopEmail + '.');
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = 'Send message';
      });
  });
})();

// Browser-side form fill engine. Shared by the Playwright runner and the extension.
// Must stay dependency-free and work when evaluated as a plain script in any frame.
(function () {
  if (globalThis.__FormTester) return;

  // ---------- fake data ----------
  const FIRST = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Carlos', 'Priya', 'Wei', 'Aisha', 'Mateo', 'Yuki'];
  const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Patel', 'Nguyen', 'Kim', 'Chen'];
  const STREETS = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Pine St', 'Elm St', 'Washington Ave', 'Lake View Rd', 'Hillcrest Blvd', 'Park Pl'];
  const PLACES = [['Austin', 'TX', '78701'], ['Denver', 'CO', '80202'], ['Columbus', 'OH', '43215'], ['Portland', 'OR', '97204'], ['Raleigh', 'NC', '27601'], ['Madison', 'WI', '53703'], ['Phoenix', 'AZ', '85004'], ['Nashville', 'TN', '37203'], ['Boston', 'MA', '02108'], ['Seattle', 'WA', '98101']];
  const COMPANY_A = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark', 'Wayne', 'Vandelay', 'Hooli', 'Soylent', 'Wonka'];
  const COMPANY_B = ['Industries', 'Corp', 'Labs', 'Group', 'Solutions', 'Systems', 'Partners', 'Holdings'];
  const TITLES = ['Software Engineer', 'Marketing Manager', 'Product Owner', 'QA Analyst', 'Director of Operations', 'Account Executive', 'Data Analyst', 'Project Manager'];
  const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation'.split(' ');

  const rand = (n) => Math.floor(Math.random() * n);
  const randInt = (min, max) => min + rand(max - min + 1);
  const pick = (arr) => arr[rand(arr.length)];
  const randStr = (n) => Array.from({ length: n }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[rand(32)]).join('');
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sentence = (n) => {
    const s = Array.from({ length: n }, () => pick(WORDS)).join(' ');
    return s[0].toUpperCase() + s.slice(1) + '.';
  };

  function makePerson(emailPattern) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const [city, state, zip] = pick(PLACES);
    const tag = randStr(6);
    const email = emailPattern
      ? emailPattern
          .replace(/\{random\}/g, tag)
          .replace(/\{timestamp\}/g, String(Date.now()))
          .replace(/\{first\}/g, first.toLowerCase())
          .replace(/\{last\}/g, last.toLowerCase())
      : `${first}.${last}.${tag}@example.com`.toLowerCase();
    return {
      first, last, email, city, state, zip,
      full: `${first} ${last}`,
      phone: `(${randInt(201, 989)}) 555-01${pad(rand(100))}`,
      company: `${pick(COMPANY_A)} ${pick(COMPANY_B)}`,
      title: pick(TITLES),
      street: `${randInt(100, 9999)} ${pick(STREETS)}`,
      street2: `Suite ${randInt(100, 999)}`,
      country: 'United States',
      website: 'https://www.example.com',
      username: `${first}${last}${randInt(10, 999)}`.toLowerCase(),
      password: `Ft!${randStr(8)}${randInt(10, 99)}Aa`,
    };
  }

  // ---------- DOM helpers ----------
  const FIELD_SEL = 'input, select, textarea';
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
  const PLACEHOLDER_OPT = /^\s*(-+|select|choose|please|pick|none\b|\(none\))/i;
  const CONSENT = /agree|terms|consent|privacy|accept|acknowledge|opt.?in|i have read|i understand/i;

  const tag = (el) => el.tagName.toLowerCase();
  const type = (el) => (tag(el) === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag(el));
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const win = el.ownerDocument.defaultView;
    const sx = win.scrollX, sy = win.scrollY;
    if (r.right + sx < 0 || r.bottom + sy < 0) return false;
    return true;
  }

  function labelText(el) {
    const doc = el.ownerDocument;
    let t = '';
    if (el.id) {
      try {
        const l = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) t += ' ' + l.textContent;
      } catch { /* invalid id */ }
    }
    const wrap = el.closest('label');
    if (wrap) t += ' ' + wrap.textContent;
    const lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\s+/).forEach((id) => { const n = doc.getElementById(id); if (n) t += ' ' + n.textContent; });
    if (!clean(t)) {
      const box = el.closest('.hs-form-field, .form-group, .form-field, .field, .sf-fieldWrp, [class*="field"]');
      const l = box && box.querySelector('label, legend');
      if (l) t = l.textContent;
    }
    return clean(t);
  }

  function groupLabel(el) {
    const row = el.closest('tr');
    if (row) {
      const head = row.querySelector('th') || row.cells[0];
      if (head && !head.contains(el)) return clean(head.textContent);
    }
    const fs = el.closest('fieldset');
    const lg = fs && fs.querySelector('legend');
    if (lg) return clean(lg.textContent);
    const box = el.closest('.hs-form-field, .form-group, .form-field, .field, .sf-fieldWrp, [role="radiogroup"], [role="group"]');
    const l = box && box.querySelector('label, legend, [class*="label"]');
    return l ? clean(l.textContent) : '';
  }

  function displayName(el) {
    return labelText(el) || el.getAttribute('aria-label') || el.placeholder || el.name || el.id || type(el);
  }

  function descriptor(el) {
    return [el.name, el.id, el.getAttribute('autocomplete'), el.placeholder, el.getAttribute('aria-label'), labelText(el)]
      .filter(Boolean).join(' ').toLowerCase();
  }

  function isRequired(el) {
    if (el.required || el.getAttribute('aria-required') === 'true') return true;
    if (el.closest('[aria-required="true"]')) return true;
    const l = labelText(el) || groupLabel(el);
    return /\*\s*$/.test(l) || /\(required\)/i.test(l);
  }

  function isHoneypot(el) {
    const d = [el.name, el.id, el.className && String(el.className)].join(' ').toLowerCase();
    if (/honey|hpot|\bhp_|leave.?(this|it)?.?blank|bot.?field|fax_only|do.?not.?fill/.test(d)) return true;
    return el.getAttribute('tabindex') === '-1' && el.getAttribute('aria-hidden') === 'true';
  }

  function inScope(root, el) {
    return tag(root) === 'form' ? true : !el.closest('form');
  }

  function usable(el) {
    if (el.disabled || el.readOnly && tag(el) !== 'select') return false;
    if (tag(el) === 'input' && SKIP_TYPES.has(type(el))) return false;
    if (isHoneypot(el)) return false;
    const t = type(el);
    if (t === 'checkbox' || t === 'radio' || t === 'file') {
      const lbl = el.id && el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      return isVisible(el) || isVisible(el.closest('label')) || isVisible(lbl) || isVisible(el.parentElement);
    }
    if (t === 'select') return isVisible(el) || !!el.parentElement?.querySelector('.select2, .select2-container, .chosen-container');
    return isVisible(el);
  }

  function fieldsIn(root) {
    return [...root.querySelectorAll(FIELD_SEL)].filter((el) => inScope(root, el) && usable(el));
  }

  function setNativeValue(el, value) {
    const win = el.ownerDocument.defaultView;
    const proto = tag(el) === 'textarea' ? win.HTMLTextAreaElement.prototype
      : tag(el) === 'select' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    el.focus({ preventScroll: true });
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: false }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }

  function fireClick(el) {
    const win = el.ownerDocument.defaultView;
    const opts = { bubbles: true, cancelable: true, view: win, button: 0 };
    const P = win.PointerEvent || win.MouseEvent;
    el.dispatchEvent(new P('pointerdown', opts));
    el.dispatchEvent(new win.MouseEvent('mousedown', opts));
    if (el.focus) el.focus({ preventScroll: true });
    el.dispatchEvent(new P('pointerup', opts));
    el.dispatchEvent(new win.MouseEvent('mouseup', opts));
    el.dispatchEvent(new win.MouseEvent('click', opts));
  }

  const markFilled = (el) => el.setAttribute('data-ft-filled', '1');
  const isFilled = (el) => el.hasAttribute('data-ft-filled');

  // ---------- value generation ----------
  const RULES = [
    ['confirmEmail', /confirm.*e-?mail|e-?mail.*confirm|verify.*e-?mail|re-?enter.*e-?mail|email2/],
    ['email', /e-?mail/],
    ['confirmPassword', /confirm.*pass|pass.*confirm|re-?enter.*pass|verify.*pass|password2|repeat.*pass/],
    ['password', /password|passwd|\bpwd\b/],
    ['phone', /phone|mobile|\bcell\b|\btel\b|telephone/],
    ['contactName', /contact name|name (and|&) title/],
    ['username', /user.?name|\blogin\b|screen.?name|\bhandle\b/],
    ['company', /company|organi[sz]ation|employer|business.?name|agency|\bcourt\b|\borg\b/],
    ['firstName', /first.?name|given.?name|fname|forename|\bfirst\b/],
    ['lastName', /last.?name|family.?name|surname|lname|\blast\b/],
    ['jobTitle', /job.?title|\bjobtitle\b|\btitle\b|position|\brole\b/],
    ['address2', /address.?(line)?.?2|\bapt\b|apartment|suite|\bunit\b/],
    ['city', /\bcity\b|town|locality|address-level2/],
    ['state', /\bstate\b|province|region|address-level1/],
    ['zip', /\bzip|postal|postcode/],
    ['country', /country/],
    ['address1', /address|street/],
    ['website', /website|\burl\b|homepage|\bsite\b/],
    ['subject', /subject/],
    ['age', /\bage\b/],
    ['fullName', /full.?name|your.?name|\bname\b/],
  ];

  function classify(el) {
    const t = type(el);
    const d = descriptor(el);
    for (const [cat, re] of RULES) if (re.test(d)) return cat;
    if (t === 'email') return 'email';
    if (t === 'tel') return 'phone';
    if (t === 'url') return 'website';
    if (t === 'password') return 'password';
    return null;
  }

  function clampDate(d, el) {
    const min = el.min && new Date(el.min);
    const max = el.max && new Date(el.max);
    if (min && !isNaN(min) && d < min) d = new Date(min);
    if (max && !isNaN(max) && d > max) d = new Date(max);
    return d;
  }

  function dateValue(el) {
    const t = type(el);
    const birth = /birth|dob|bday/.test(descriptor(el));
    const d = birth
      ? new Date(randInt(1960, 2000), rand(12), randInt(1, 28), randInt(8, 17), rand(4) * 15)
      : new Date();
    if (!birth) d.setHours(randInt(8, 17), rand(4) * 15, 0, 0);
    const c = clampDate(d, el);
    const ymd = `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`;
    const hm = `${pad(c.getHours())}:${pad(c.getMinutes())}`;
    if (t === 'date') return ymd;
    if (t === 'datetime-local') return `${ymd}T${hm}`;
    if (t === 'time') return hm;
    if (t === 'month') return ymd.slice(0, 7);
    if (t === 'week') {
      const jan1 = new Date(c.getFullYear(), 0, 1);
      const wk = Math.min(52, Math.max(1, Math.ceil(((c - jan1) / 864e5 + jan1.getDay() + 1) / 7)));
      return `${c.getFullYear()}-W${pad(wk)}`;
    }
    return ymd;
  }

  function isDateText(el) {
    if (/date|time/i.test(el.getAttribute('data-role') || '')) return true;
    if (el._flatpickr || /datepicker|hasDatepicker|flatpickr/i.test(String(el.className))) return true;
    if (/\b(mm|dd|yyyy)\b/i.test(el.placeholder || '')) return true;
    return /\bdate\b|\bdob\b|birth/.test(descriptor(el));
  }

  function formatDate(d, fmt) {
    const map = { yyyy: d.getFullYear(), yy: String(d.getFullYear()).slice(2), MM: pad(d.getMonth() + 1), M: d.getMonth() + 1, dd: pad(d.getDate()), d: d.getDate() };
    // Date-only formats: treat m/Y/D case-insensitively ("mm/dd/yyyy" means month).
    return fmt.replace(/m/g, 'M').replace(/Y/g, 'y').replace(/D/g, 'd').replace(/yyyy|yy|MM|M|dd|d/g, (t) => map[t]);
  }

  function placeholderFormat(ph) {
    const m = (ph || '').match(/(d{1,2}|m{1,2}|y{2,4})([\/.\- ])(d{1,2}|m{1,2}|y{2,4})\2(d{1,2}|m{1,2}|y{2,4})/i);
    return m ? m[0] : null;
  }

  // Extension content scripts can't see page globals (jQuery, widgets); page-helper.js runs those calls.
  function pageCall(el, op, arg) {
    try {
      el.removeAttribute('data-ft-page-result');
      el.dispatchEvent(new CustomEvent('__ft_page', { detail: JSON.stringify({ op, arg }) }));
      const r = el.getAttribute('data-ft-page-result') || '';
      el.removeAttribute('data-ft-page-result');
      return r;
    } catch { return ''; }
  }

  // Text inputs backed by a date picker: use the widget API when present, else type a formatted date.
  function fillDateText(el) {
    const birth = /birth|dob|bday/.test(descriptor(el));
    const d = birth ? new Date(randInt(1960, 2000), rand(12), randInt(1, 28)) : new Date();
    const $ = el.ownerDocument.defaultView.jQuery;
    try {
      if (el._flatpickr) { el._flatpickr.setDate(d, true); return el.value; }
      if ($) {
        const $el = $(el);
        const kendo = $el.data('kendoDatePicker') || $el.data('kendoDateTimePicker') || $el.data('kendoDateInput');
        if (kendo) {
          kendo.value(d);
          kendo.trigger('change');
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return el.value;
        }
        if ($el.hasClass('hasDatepicker') || $el.data('datepicker')) {
          $el.datepicker('setDate', d);
          $el.trigger('change');
          return el.value;
        }
      }
    } catch { /* fall through to typing the date */ }
    if (!$ && !el._flatpickr) {
      const viaPage = pageCall(el, 'set-date', d.toISOString());
      if (viaPage) return viaPage;
    }
    const fmt = el.getAttribute('data-date-format') || el.getAttribute('data-format') || placeholderFormat(el.placeholder) || 'MM/dd/yyyy';
    const v = formatDate(d, fmt);
    setNativeValue(el, v);
    return v;
  }

  function numberValue(el, fallbackMin = 1, fallbackMax = 100) {
    const min = el.min !== '' && !isNaN(+el.min) ? +el.min : fallbackMin;
    const max = el.max !== '' && !isNaN(+el.max) ? +el.max : Math.max(min, fallbackMax);
    const step = el.step && el.step !== 'any' && +el.step > 0 ? +el.step : 1;
    const steps = Math.floor((max - min) / step);
    const v = min + rand(steps + 1) * step;
    return String(+v.toFixed(6));
  }

  function textValue(el, cat, ctx) {
    const p = ctx.person;
    switch (cat) {
      case 'email': return p.email;
      case 'confirmEmail': return p.email;
      case 'password': return p.password;
      case 'confirmPassword': return p.password;
      case 'username': return p.username;
      case 'company': return p.company;
      case 'firstName': return p.first;
      case 'lastName': return p.last;
      case 'fullName': return p.full;
      case 'jobTitle': return p.title;
      case 'phone': return p.phone;
      case 'contactName': return `${p.full}, ${p.title}`;
      case 'address1': return p.street;
      case 'address2': return p.street2;
      case 'city': return p.city;
      case 'state': return p.state;
      case 'zip': return p.zip;
      case 'country': return p.country;
      case 'website': return p.website;
      case 'subject': return `Test submission ${randStr(4)}`;
      case 'age': return String(randInt(21, 70));
    }
    const t = type(el);
    if (t === 'textarea') return `${sentence(randInt(8, 14))} ${sentence(randInt(6, 12))} (Automated test via Field Day)`;
    if (t === 'number') return numberValue(el);
    if (t === 'search') return pick(WORDS);
    return el.inputMode === 'numeric' || /\\d/.test(el.pattern || '') ? String(randInt(1000, 99999)) : `${pick(WORDS)} ${pick(WORDS)}`;
  }

  function fitLength(el, v) {
    const max = el.maxLength;
    return max > 0 && v.length > max ? v.slice(0, max) : v;
  }

  // ---------- overrides ----------
  function getOverride(el, ctx, extra = '') {
    const o = ctx.overrides;
    if (!o) return undefined;
    const keys = Object.keys(o);
    if (!keys.length) return undefined;
    const exact = [el.name, el.id].filter(Boolean).map((s) => s.toLowerCase());
    const d = (descriptor(el) + ' ' + extra).toLowerCase();
    let k = keys.find((key) => exact.includes(key.toLowerCase()));
    if (k === undefined) k = keys.find((key) => d.includes(key.toLowerCase()));
    return k === undefined ? undefined : String(o[k]);
  }

  // ---------- fillers ----------
  function fillText(el, ctx) {
    const t = type(el);
    // range/color always carry a default value, so treat them as empty.
    if (el.value && !ctx.overwrite && t !== 'range' && t !== 'color') return null;
    const ov = getOverride(el, ctx);
    let v;
    if (ov !== undefined) v = ov;
    else if (['text', 'search', ''].includes(t) && isDateText(el)) return fillDateText(el);
    else if (['date', 'datetime-local', 'time', 'month', 'week'].includes(t)) v = dateValue(el);
    else if (t === 'range') v = numberValue(el, 0, 100);
    else if (t === 'number') v = classify(el) === 'age' ? String(randInt(21, 70)) : numberValue(el);
    else if (t === 'color') v = '#' + Array.from({ length: 3 }, () => pad(rand(256).toString(16))).join('');
    else if (t === 'textarea') v = textValue(el, null, ctx);
    else v = textValue(el, classify(el), ctx);
    v = fitLength(el, v);
    setNativeValue(el, v);
    return t === 'password' ? '********' : v;
  }

  function selectOptions(el) {
    return [...el.options].filter((o) => !o.disabled && o.value.trim() !== '' && !PLACEHOLDER_OPT.test(o.text));
  }

  function setSelect(el, chosen) {
    el.focus({ preventScroll: true });
    [...el.options].forEach((o) => { o.selected = chosen.includes(o); });
    if (!el.multiple) {
      const setter = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLSelectElement.prototype, 'value').set;
      setter.call(el, chosen[0].value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    // jQuery-based widgets (Select2/Chosen) listen on their own trigger.
    const $ = el.ownerDocument.defaultView.jQuery;
    if ($) try { $(el).trigger('change'); } catch { /* ignore */ }
    else pageCall(el, 'jq-change');
  }

  function fillSelect(el, ctx) {
    const opts = selectOptions(el);
    if (!opts.length) return null;
    const forced = ctx.forced[controlKey({ kind: 'select', el })];
    const ov = forced ?? getOverride(el, ctx);
    let chosen;
    if (ov !== undefined) {
      const m = opts.find((o) => o.value.toLowerCase() === ov.toLowerCase() || clean(o.text).toLowerCase() === ov.toLowerCase());
      chosen = m ? [m] : null;
    }
    if (!chosen) {
      if (el.multiple) {
        const shuffled = [...opts].sort(() => Math.random() - 0.5);
        chosen = shuffled.slice(0, randInt(1, Math.min(3, opts.length)));
      } else chosen = [pick(opts)];
    }
    setSelect(el, chosen);
    return chosen.map((o) => clean(o.text)).join(', ');
  }

  function optionLabel(el) {
    const l = labelText(el);
    return l || el.value;
  }

  function fillRadioGroup(radios, ctx) {
    const enabled = radios.filter((r) => !r.disabled);
    if (!enabled.length) return null;
    const forced = ctx.forced[controlKey({ kind: 'radio', els: radios })];
    const ov = forced ?? getOverride(enabled[0], ctx, groupLabel(enabled[0]));
    let r = ov !== undefined
      ? enabled.find((x) => x.value.toLowerCase() === ov.toLowerCase() || optionLabel(x).toLowerCase() === ov.toLowerCase())
      : null;
    r = r || pick(enabled);
    if (!r.checked) r.click();
    return optionLabel(r);
  }

  function fillCheckboxGroup(boxes, ctx) {
    const enabled = boxes.filter((b) => !b.disabled);
    if (!enabled.length) return null;
    const results = [];
    const set = (b, on) => { if (b.checked !== on) b.click(); if (on) results.push(optionLabel(b)); };
    const forcedOf = (b) => ctx.forced[controlKey({ kind: 'checkbox', el: b })];

    if (enabled.length === 1) {
      const b = enabled[0];
      const ov = forcedOf(b) ?? getOverride(b, ctx);
      const on = ov !== undefined ? /^(1|true|yes|on|checked)$/i.test(ov)
        : isRequired(b) || CONSENT.test(labelText(b)) || Math.random() < 0.5;
      set(b, on);
      return on ? 'checked' : 'unchecked';
    }
    const required = enabled.some(isRequired) || /\*\s*$/.test(groupLabel(enabled[0]));
    const ov = getOverride(enabled[0], ctx, groupLabel(enabled[0]));
    if (ov !== undefined) {
      const wanted = ov.split(/\s*[|,]\s*/).map((s) => s.toLowerCase());
      enabled.forEach((b) => set(b, wanted.includes(b.value.toLowerCase()) || wanted.includes(optionLabel(b).toLowerCase())));
    } else {
      let picks = enabled.filter(() => Math.random() < 0.5);
      if (!picks.length && required) picks = [pick(enabled)];
      enabled.forEach((b) => {
        const f = forcedOf(b);
        set(b, f !== undefined ? f === 'checked' : picks.includes(b) || b.required);
      });
    }
    return results.length ? results.join(', ') : '(none)';
  }

  const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  function fillFile(el) {
    if (el.files && el.files.length) return null;
    const accept = (el.accept || '').toLowerCase();
    let file;
    const win = el.ownerDocument.defaultView;
    if (/image|\.png|\.jpe?g|\.gif/.test(accept)) {
      const bin = atob(PNG_1PX);
      file = new win.File([Uint8Array.from(bin, (c) => c.charCodeAt(0))], 'field-day.png', { type: 'image/png' });
    } else if (/pdf/.test(accept)) {
      const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
      file = new win.File([pdf], 'field-day.pdf', { type: 'application/pdf' });
    } else if (/\.docx?|word/.test(accept)) {
      file = new win.File(['Field Day dummy document'], 'field-day.doc', { type: 'application/msword' });
    } else {
      file = new win.File(['Field Day dummy file\n'], 'field-day.txt', { type: 'text/plain' });
    }
    const dt = new win.DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return file.name;
  }

  function customDropdownsIn(root, includeFilled = false) {
    const sel = '[role="combobox"], [aria-haspopup="listbox"], .k-dropdownlist, .k-dropdown, .k-combobox';
    const seen = new Set();
    return [...root.querySelectorAll(sel)].filter((el) => {
      if (tag(el) === 'select' || !inScope(root, el) || !isVisible(el) || (isFilled(el) && !includeFilled)) return false;
      if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return false;
      // Skip nested parts of the same widget and widgets backed by a native select we already set.
      const outer = el.parentElement && el.parentElement.closest(sel);
      if (outer && root.contains(outer)) return false;
      for (let p = el.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) {
        if ([...p.children].some((c) => tag(c) === 'select' && isFilled(c))) return false;
      }
      if (seen.has(el)) return false;
      seen.add(el);
      return true;
    });
  }

  function visibleListbox(el) {
    const doc = el.ownerDocument;
    const ids = [el.getAttribute('aria-controls'), el.getAttribute('aria-owns')].filter(Boolean).join(' ').split(/\s+/);
    for (const id of ids) {
      const n = id && doc.getElementById(id);
      if (n && isVisible(n)) return n;
    }
    const inner = el.querySelector('[aria-controls], [aria-owns]');
    if (inner) {
      const id = inner.getAttribute('aria-controls') || inner.getAttribute('aria-owns');
      const n = id && doc.getElementById(id);
      if (n && isVisible(n)) return n;
    }
    const all = [...doc.querySelectorAll('[role="listbox"], .k-animation-container .k-list, .k-popup .k-list-ul')].filter(isVisible);
    return all[all.length - 1] || null;
  }

  function closeCustom(el) {
    const input = tag(el) === 'input' ? el : el.querySelector('input') || el;
    const KE = el.ownerDocument.defaultView.KeyboardEvent;
    input.dispatchEvent(new KE('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }

  // Opens a custom dropdown and returns its selectable option elements (empty if none appeared).
  async function openCustom(el) {
    const input = tag(el) === 'input' ? el : el.querySelector('input') || el;
    fireClick(el);
    await sleep(300);
    let list = visibleListbox(el);
    if (!list) {
      const KE = el.ownerDocument.defaultView.KeyboardEvent;
      input.dispatchEvent(new KE('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
      await sleep(300);
      list = visibleListbox(el);
    }
    return list
      ? [...list.querySelectorAll('[role="option"], li.k-list-item, li.k-item')].filter((o) =>
          o.getAttribute('aria-disabled') !== 'true' && isVisible(o) && clean(o.textContent) && !PLACEHOLDER_OPT.test(o.textContent))
      : [];
  }

  async function fillCustomDropdown(el, ctx) {
    const options = await openCustom(el);
    if (!options.length) {
      closeCustom(el);
      if (tag(el) === 'input' && !el.value) return fillText(el, ctx);
      return null;
    }
    const ov = ctx.forced[controlKey({ kind: 'custom', el })] ?? getOverride(el, ctx);
    const opt = (ov !== undefined && options.find((o) => clean(o.textContent).toLowerCase() === ov.toLowerCase())) || pick(options);
    opt.scrollIntoView({ block: 'nearest' });
    fireClick(opt);
    await sleep(200);
    return clean(opt.textContent);
  }

  // ---------- signatures ----------
  function signatureCanvases(root) {
    return [...root.querySelectorAll('canvas')].filter((c) => {
      if (isFilled(c) || !isVisible(c)) return false;
      const r = c.getBoundingClientRect();
      if (r.width < 100 || r.height < 40) return false;
      for (let p = c, i = 0; p && i < 6; p = p.parentElement, i++) {
        if (/sign/i.test(`${p.id} ${p.className} ${p.getAttribute('aria-label') || ''}`)) return true;
      }
      return false;
    });
  }

  async function drawSignature(c) {
    const win = c.ownerDocument.defaultView;
    const r = c.getBoundingClientRect();
    const P = win.PointerEvent || win.MouseEvent;
    const fire = (kind, x, y, buttons) => {
      const init = { bubbles: true, cancelable: true, view: win, clientX: r.left + x, clientY: r.top + y, button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true };
      c.dispatchEvent(new P('pointer' + kind, init));
      c.dispatchEvent(new win.MouseEvent('mouse' + kind, init));
    };
    const pts = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      return [r.width * (0.15 + 0.7 * t), r.height * (0.55 + 0.2 * Math.sin(t * Math.PI * 4))];
    });
    fire('down', ...pts[0], 1);
    for (const [x, y] of pts.slice(1)) { fire('move', x, y, 1); await sleep(8); }
    fire('up', ...pts[pts.length - 1], 0);
    return 'drawn';
  }

  // ---------- forms ----------
  function describeRoot(root, index) {
    const fields = fieldsIn(root);
    const isForm = tag(root) === 'form';
    const heading = (() => {
      if (root.getAttribute('aria-label')) return root.getAttribute('aria-label');
      const h = root.querySelector('h1, h2, h3, h4');
      if (h) return clean(h.textContent);
      let p = root;
      for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
        let s = p.previousElementSibling;
        while (s && !/^h[1-4]$/i.test(s.tagName)) s = s.previousElementSibling;
        if (s) return clean(s.textContent);
      }
      return '';
    })();
    return {
      index,
      kind: isForm ? 'form' : 'loose',
      id: root.id || '',
      name: (isForm && root.getAttribute('name')) || '',
      action: isForm ? root.getAttribute('action') || '' : '',
      method: isForm ? (root.getAttribute('method') || 'get').toLowerCase() : '',
      heading: heading.slice(0, 80),
      fieldCount: fields.length,
      preview: [...new Set(fields.slice(0, 6).map(displayName))].map((s) => s.slice(0, 40)),
      captcha: detectCaptcha(root).found,
    };
  }

  function formRoots(doc) {
    const roots = [...doc.querySelectorAll('form')].filter((f) => fieldsIn(f).length > 0);
    if (doc.body && fieldsIn(doc.body).length > 0) roots.push(doc.body);
    return roots;
  }

  function listForms(doc) {
    return formRoots(doc).map(describeRoot);
  }

  function selectForm(doc, index) {
    doc.querySelectorAll('[data-ft-target]').forEach((n) => n.removeAttribute('data-ft-target'));
    const root = formRoots(doc)[index];
    if (root) root.setAttribute('data-ft-target', '1');
    return !!root;
  }

  function resolveTarget(doc) {
    const t = doc.querySelector('[data-ft-target]');
    if (t && fieldsIn(t).length) return t;
    // After a page change the marked form is gone; fall back to the largest form.
    const roots = formRoots(doc).sort((a, b) => fieldsIn(b).length - fieldsIn(a).length);
    if (roots[0]) roots[0].setAttribute('data-ft-target', '1');
    return roots[0] || null;
  }

  async function fillRoot(root, opts = {}) {
    const ctx = {
      overrides: opts.overrides || {},
      overwrite: !!opts.overwrite,
      forced: opts.forced || {},
      person: opts.person || globalThis.__FormTesterPerson || makePerson(opts.emailPattern),
    };
    if (opts.fresh) {
      if (!opts.person) ctx.person = makePerson(opts.emailPattern);
      root.querySelectorAll('[data-ft-filled]').forEach((n) => n.removeAttribute('data-ft-filled'));
    }
    globalThis.__FormTesterPerson = ctx.person;
    const filled = [];
    const errors = [];
    const log = (el, kind, value, name) => {
      if (value === null || value === undefined) return;
      filled.push({ field: (name || displayName(el)).slice(0, 60), kind, value: String(value).slice(0, 80) });
    };
    const attempt = async (el, kind, fn, name) => {
      try { log(el, kind, await fn(), name); } catch (e) { errors.push({ field: displayName(el), error: String(e && e.message || e) }); }
      markFilled(el);
    };

    // Repeat passes so fields revealed by earlier choices (conditional logic, nested) also get filled.
    for (let pass = 0; pass < 4; pass++) {
      const before = filled.length;
      const fields = fieldsIn(root).filter((el) => !isFilled(el));
      const radioGroups = new Map();
      const checkGroups = new Map();
      for (const el of fields) {
        const t = type(el);
        if (t === 'radio') { const k = radioKey(el); (radioGroups.get(k) || radioGroups.set(k, []).get(k)).push(el); continue; }
        if (t === 'checkbox') { const k = el.name || el.id; (checkGroups.get(k) || checkGroups.set(k, []).get(k)).push(el); continue; }
        if (t === 'select') { await attempt(el, 'select', () => fillSelect(el, ctx)); continue; }
        if (t === 'file') { await attempt(el, 'file', () => fillFile(el)); continue; }
        if (tag(el) === 'input' || tag(el) === 'textarea') {
          if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list') continue;
          await attempt(el, t, () => fillText(el, ctx));
        }
      }
      for (const group of radioGroups.values()) {
        await attempt(group[0], 'radio', () => fillRadioGroup(group, ctx), groupLabel(group[0]) || group[0].name);
        group.forEach(markFilled);
      }
      for (const group of checkGroups.values()) {
        const name = group.length > 1 ? groupLabel(group[0]) || group[0].name : displayName(group[0]);
        await attempt(group[0], 'checkbox', () => fillCheckboxGroup(group, ctx), name);
        group.forEach(markFilled);
      }
      for (const el of customDropdownsIn(root)) {
        await attempt(el, 'dropdown', () => fillCustomDropdown(el, ctx));
      }
      for (const c of signatureCanvases(root)) {
        await attempt(c, 'signature', () => drawSignature(c), 'Signature');
      }
      if (pass === 0) await sleep(250);
      if (filled.length === before && pass > 0) break;
    }
    return { filled, errors, person: ctx.person };
  }

  async function fillTarget(doc, opts) {
    const root = resolveTarget(doc);
    if (!root) return { filled: [], errors: [{ field: '-', error: 'No form found' }], person: opts.person || null };
    return fillRoot(root, opts);
  }

  // ---------- conditionals ----------
  const MAX_OPTIONS = 12;
  const MAX_DEPTH = 3;

  function radioKey(el) {
    if (el.name) return el.name;
    const explicit = el.closest('[role="radiogroup"]');
    if (explicit) return explicit;
    // Unnamed radios (e.g. Cognito): the smallest ancestor holding more than one radio is the group.
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.querySelectorAll('input[type="radio"]').length > 1) return p;
    }
    return el;
  }

  // Stable across page reloads, so a plan made in one session can be replayed in another.
  function controlKey(ctrl) {
    const el = ctrl.els ? ctrl.els[0] : ctrl.el;
    const label = ctrl.kind === 'radio' ? groupLabel(el) || el.name : displayName(el);
    return `${ctrl.kind}|${clean(label).slice(0, 80)}|${el.name || ''}`;
  }

  function controlLabel(ctrl) {
    return controlKey(ctrl).split('|')[1] || ctrl.kind;
  }

  function choiceControls(root, onlyKeys) {
    const ctrls = [];
    const radios = new Map();
    const want = (el) => !onlyKeys || onlyKeys.has(fieldKey(el));
    for (const el of fieldsIn(root)) {
      if (!want(el)) continue;
      const t = type(el);
      if (t === 'radio') {
        const k = radioKey(el);
        if (!radios.has(k)) { radios.set(k, { kind: 'radio', els: [] }); ctrls.push(radios.get(k)); }
        radios.get(k).els.push(el);
      } else if (t === 'select' && !el.multiple) ctrls.push({ kind: 'select', el });
      else if (t === 'checkbox') ctrls.push({ kind: 'checkbox', el });
    }
    for (const el of customDropdownsIn(root, true)) if (want(el)) ctrls.push({ kind: 'custom', el });
    return ctrls;
  }

  // Identity by meaning rather than DOM node, since frameworks often re-create conditional elements.
  function fieldKey(el) {
    const t = type(el);
    const extra = t === 'radio' ? `${groupLabel(el)}|${optionLabel(el)}` : t === 'checkbox' ? optionLabel(el) : '';
    return [tag(el), t, el.name || '', displayName(el), extra].join('|');
  }

  function visibleFields(root) {
    const m = new Map();
    for (const el of fieldsIn(root).concat(customDropdownsIn(root, true))) m.set(fieldKey(el), el);
    return m;
  }

  function fieldTitles(els) {
    return [...new Set(els.map((el) => (type(el) === 'radio' ? groupLabel(el) || el.name : displayName(el)).slice(0, 60)))];
  }

  async function ctrlOptions(ctrl) {
    if (ctrl.kind === 'radio') return ctrl.els.filter((r) => !r.disabled).map(optionLabel);
    if (ctrl.kind === 'checkbox') return ['checked', 'unchecked'];
    if (ctrl.kind === 'select') return selectOptions(ctrl.el).map((o) => clean(o.text));
    const opts = await openCustom(ctrl.el);
    const texts = opts.map((o) => clean(o.textContent));
    closeCustom(ctrl.el);
    await sleep(150);
    return texts;
  }

  function ctrlState(ctrl) {
    if (ctrl.kind === 'radio') { const r = ctrl.els.find((x) => x.checked); return r ? optionLabel(r) : null; }
    if (ctrl.kind === 'checkbox') return ctrl.el.checked ? 'checked' : 'unchecked';
    if (ctrl.kind === 'select') { const o = ctrl.el.selectedOptions[0]; return o ? clean(o.text) : null; }
    return clean(ctrl.el.textContent) || null;
  }

  // Frameworks like Cognito re-render choice fields on every change, so look the control up again by key.
  function liveCtrl(root, ctrl) {
    const els = ctrl.els || [ctrl.el];
    if (els.every((e) => e.isConnected)) return ctrl;
    const key = controlKey(ctrl);
    return choiceControls(root).find((c) => controlKey(c) === key) || ctrl;
  }

  async function applyOption(root, ctrl, label) {
    ctrl = liveCtrl(root, ctrl);
    if (ctrl.kind === 'radio') {
      const r = ctrl.els.find((x) => x.isConnected && optionLabel(x) === label);
      if (r && !r.checked) r.click();
    } else if (ctrl.kind === 'checkbox') {
      if (ctrl.el.checked !== (label === 'checked')) ctrl.el.click();
    } else if (ctrl.kind === 'select') {
      const o = selectOptions(ctrl.el).find((x) => clean(x.text) === label);
      if (o) setSelect(ctrl.el, [o]);
    } else {
      const opts = await openCustom(ctrl.el);
      const o = opts.find((x) => clean(x.textContent) === label);
      if (o) { o.scrollIntoView({ block: 'nearest' }); fireClick(o); } else closeCustom(ctrl.el);
    }
    await sleep(600);
    await waitQuiet(root);
  }

  // Resolves once the form has had no DOM changes for `quiet` ms (some forms update conditionals late).
  function waitQuiet(root, quiet = 500, max = 3000) {
    return new Promise((resolve) => {
      const win = root.ownerDocument.defaultView;
      let timer;
      const done = () => { obs.disconnect(); clearTimeout(timer); clearTimeout(cap); resolve(); };
      const obs = new win.MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, quiet); });
      obs.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
      timer = setTimeout(done, quiet);
      const cap = setTimeout(done, max);
    });
  }

  async function probe(root, ctrl, depth, seen) {
    const key = controlKey(ctrl);
    if (seen.has(key)) return null;
    seen.add(key);
    const options = await ctrlOptions(ctrl);
    if (options.length < 2 || options.length > MAX_OPTIONS) return null;
    const original = ctrlState(ctrl);

    const views = [];
    for (const o of options) { await applyOption(root, ctrl, o); views.push(visibleFields(root)); }
    const base = new Set([...views[0].keys()].filter((k) => views.every((v) => v.has(k))));
    const results = options.map((option, i) => {
      const els = [...views[i]].filter(([k]) => !base.has(k)).map(([, el]) => el);
      return { option, reveals: fieldTitles(els), revealedKeys: new Set(els.map(fieldKey)), children: [] };
    });

    if (results.some((r) => r.reveals.length)) {
      for (const r of results) {
        if (!r.reveals.length || depth >= MAX_DEPTH) continue;
        await applyOption(root, ctrl, r.option);
        for (const child of choiceControls(root, r.revealedKeys)) {
          const node = await probe(root, child, depth + 1, seen);
          if (node) r.children.push(node);
        }
      }
    }
    if (original !== null && options.includes(original)) await applyOption(root, ctrl, original);
    // Revealed (nested) choice fields count as branches even if they reveal nothing themselves.
    if (depth === 1 && !results.some((r) => r.reveals.length)) return null;
    return { key, label: controlLabel(ctrl), nested: depth > 1, options: results.map(({ revealedKeys, ...r }) => r) };
  }

  async function discoverConditionals(doc, opts = {}) {
    const root = resolveTarget(doc);
    const seen = new Set(opts.seen || []);
    const nodes = [];
    if (!root) return { nodes, seen: [...seen] };
    for (let guard = 0; guard < 200; guard++) {
      const next = choiceControls(root).find((c) => !seen.has(controlKey(c)));
      if (!next) break;
      const node = await probe(root, next, 1, seen);
      if (node) nodes.push(node);
    }
    return { nodes, seen: [...seen] };
  }

  // Top-level options that reveal nothing share one branch; nested fields get a branch per option.
  function branchesOf(node) {
    const out = [];
    let quietDone = false;
    for (const o of node.options) {
      if (!o.reveals.length && !node.nested) { if (quietDone) continue; quietDone = true; }
      const self = { forced: { [node.key]: o.option }, choices: [`${node.label} = ${o.option}`] };
      const subs = combineBranches(o.children.map(branchesOf));
      if (!subs.length) out.push(self);
      else subs.forEach((s) => out.push(mergeBranch(self, s)));
    }
    return out;
  }

  function mergeBranch(a, b) {
    return { forced: { ...a.forced, ...b.forced }, choices: [...a.choices, ...b.choices] };
  }

  // Independent conditionals are exercised side by side, so runs = the largest branch count, not the product.
  function combineBranches(lists) {
    lists = lists.filter((l) => l.length);
    if (!lists.length) return [];
    const n = Math.max(...lists.map((l) => l.length));
    return Array.from({ length: n }, (_, i) => lists.reduce((acc, l) => mergeBranch(acc, l[i % l.length]), { forced: {}, choices: [] }));
  }

  function buildPlan(nodes) {
    return {
      runs: combineBranches(nodes.map(branchesOf)),
      branchCount: nodes.reduce((n, node) => n + branchesOf(node).length, 0),
    };
  }

  function describeConditionals(nodes, indent = '') {
    const lines = [];
    for (const n of nodes) {
      lines.push(`${indent}${n.step ? `[Step ${n.step}] ` : ''}${n.label}`);
      for (const o of n.options) {
        lines.push(`${indent}  ${o.option} -> ${o.reveals.length ? 'shows: ' + o.reveals.join(', ') : '(nothing new)'}`);
        if (o.children.length) lines.push(...describeConditionals(o.children, indent + '      '));
      }
    }
    return lines;
  }

  // ---------- buttons ----------
  const NEXT_RE = /^\s*(next|continue|proceed|forward|next step|save (and|&) continue|weiter|suivant|siguiente)\b|›|»|→/i;
  const SUBMIT_RE = /submit|send|sign ?up|register|request|apply|subscribe|get started|download|contact|join|book|finish|complete|done|go\b|save|enviar|envoyer|absenden/i;
  const BACK_RE = /back|previous|prev\b|cancel|reset|clear/i;

  function buttonText(b) {
    return clean(b.textContent || b.value || b.getAttribute('aria-label') || b.title || '');
  }

  function buttonsIn(root) {
    const doc = root.ownerDocument;
    let list = [...root.querySelectorAll('button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], a.btn, a.button')];
    if (tag(root) === 'form' && root.id) {
      list = list.concat([...doc.querySelectorAll(`[form="${CSS.escape(root.id)}"]`)].filter((b) => /button|input/i.test(b.tagName)));
    }
    return list.filter((b) => isVisible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !BACK_RE.test(buttonText(b)));
  }

  function findNext(root) {
    return buttonsIn(root).find((b) => {
      const t = buttonText(b);
      return (NEXT_RE.test(t) || /\bnext\b/i.test(String(b.className))) && !/submit/i.test(t);
    }) || null;
  }

  function findSubmit(root) {
    const btns = buttonsIn(root);
    const isForm = tag(root) === 'form';
    return (
      btns.find((b) => isForm && (b.type === 'submit' || b.type === 'image') && !NEXT_RE.test(buttonText(b))) ||
      btns.find((b) => SUBMIT_RE.test(buttonText(b)) && !NEXT_RE.test(buttonText(b))) ||
      btns.find((b) => isForm && tag(b) === 'button' && !b.getAttribute('type')) ||
      null
    );
  }

  // Marks the button so the caller can do a trusted click (Playwright) or click directly (extension).
  function prepareClick(doc, kind) {
    doc.querySelectorAll('[data-ft-click]').forEach((n) => n.removeAttribute('data-ft-click'));
    const root = resolveTarget(doc);
    if (!root) return { found: false };
    const btn = kind === 'next' ? findNext(root) : findSubmit(root);
    if (!btn) return { found: false, canRequestSubmit: kind === 'submit' && tag(root) === 'form' };
    btn.setAttribute('data-ft-click', kind);
    return { found: true, text: buttonText(btn), selector: `[data-ft-click="${kind}"]` };
  }

  function requestSubmit(doc) {
    const root = resolveTarget(doc);
    if (!root || tag(root) !== 'form') return false;
    if (root.requestSubmit) root.requestSubmit(); else root.submit();
    return true;
  }

  function getInvalid(doc) {
    const root = resolveTarget(doc);
    if (!root) return [];
    const seen = new Set();
    return [...root.querySelectorAll(FIELD_SEL)]
      .filter((el) => inScope(root, el) && el.willValidate && !el.validity.valid)
      .map((el) => ({ field: displayName(el).slice(0, 60), message: el.validationMessage }))
      .filter((x) => !seen.has(x.field) && seen.add(x.field));
  }

  // ---------- captcha ----------
  const CAPTCHA_SEL = [
    'iframe[src*="recaptcha/api2/anchor"]', 'iframe[src*="recaptcha/enterprise/anchor"]',
    'iframe[src*="hcaptcha.com"]', 'iframe[src*="challenges.cloudflare.com"]',
    '.g-recaptcha', '.h-captcha', '.cf-turnstile', '.frc-captcha', '[data-sitekey]', 'iframe[title*="captcha" i]',
  ].join(',');

  function detectCaptcha(root) {
    const hits = [...root.querySelectorAll(CAPTCHA_SEL)].filter((el) => {
      if (el.getAttribute('data-size') === 'invisible') return false;
      if (tag(el) === 'iframe' && /size=invisible/.test(el.src)) return false;
      return isVisible(el);
    });
    if (!hits.length) return { found: false };
    const h = hits[0];
    const src = (h.src || '') + ' ' + String(h.className);
    const kind = /hcaptcha|h-captcha/.test(src) ? 'hCaptcha' : /cloudflare|turnstile/.test(src) ? 'Turnstile'
      : /frc-/.test(src) ? 'FriendlyCaptcha' : 'reCAPTCHA';
    return { found: true, kind };
  }

  // After clicking submit: if the submit button is still showing, the form most likely didn't go through.
  function submitOutcome(doc) {
    const btn = doc.querySelector('[data-ft-click="submit"]');
    const target = doc.querySelector('[data-ft-target]');
    const confirmation = findConfirmation(doc);
    const stillThere = btn ? isVisible(btn) : !!target && fieldsIn(target).length > 0;
    const errors = [];
    if (stillThere) {
      const seen = new Set();
      for (const n of doc.querySelectorAll('[role="alert"], [class*="error"], [class*="invalid"], .field-validation-error')) {
        const t = clean(n.textContent);
        if (!t || t.length > 200 || seen.has(t) || !isVisible(n) || n.querySelector('[role="alert"], [class*="error"]')) continue;
        seen.add(t);
        errors.push(t);
      }
    }
    return { submitted: !stillThere || (!!confirmation && !errors.length), confirmation, errors: errors.slice(0, 10) };
  }

  function findConfirmation(doc) {
    const re = /thank you|thanks for|success(fully)?\b|has been (received|submitted|sent)|we('| wi)ll be in touch|submission (was )?received/i;
    const nodes = [...doc.querySelectorAll('h1, h2, h3, h4, p, div[role="alert"], [class*="success"], [class*="thank"], .submitted-message, .sf-fieldWrp')]
      .filter((n) => isVisible(n) && re.test(n.textContent) && clean(n.textContent).length < 300);
    return nodes.length ? clean(nodes[0].textContent) : '';
  }

  globalThis.__FormTester = {
    version: '1.0.0',
    makePerson,
    listForms,
    selectForm,
    formRoots,
    fillTarget,
    fillRoot,
    prepareClick,
    requestSubmit,
    getInvalid,
    detectCaptcha,
    findConfirmation,
    submitOutcome,
    discoverConditionals,
    buildPlan,
    describeConditionals,
    // Full pointer/mouse sequence; some frameworks (e.g. Cognito) ignore a bare .click().
    press: fireClick,
  };
})();

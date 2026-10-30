// Runs in the page's own JavaScript world so the engine (an isolated content script) can reach
// page libraries such as jQuery, Kendo and flatpickr. Only acts on the element that fired the event.
(() => {
  if (window.__ftPageHelper) return;
  window.__ftPageHelper = true;
  document.addEventListener('__ft_page', (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    let req;
    try { req = JSON.parse(e.detail); } catch { return; }
    let result = '';
    try {
      const $ = window.jQuery;
      if (req.op === 'jq-change' && $) {
        $(el).trigger('change');
        result = 'ok';
      } else if (req.op === 'set-date') {
        const d = new Date(req.arg);
        if (el._flatpickr) {
          el._flatpickr.setDate(d, true);
          result = el.value;
        } else if ($) {
          const $el = $(el);
          const kendo = $el.data('kendoDatePicker') || $el.data('kendoDateTimePicker') || $el.data('kendoDateInput');
          if (kendo) {
            kendo.value(d);
            kendo.trigger('change');
            el.dispatchEvent(new Event('change', { bubbles: true }));
            result = el.value;
          } else if ($el.hasClass('hasDatepicker') || $el.data('datepicker')) {
            $el.datepicker('setDate', d);
            $el.trigger('change');
            result = el.value;
          }
        }
      }
    } catch { result = ''; }
    el.setAttribute('data-ft-page-result', result);
  }, true);
})();

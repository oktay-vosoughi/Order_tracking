// Instant tooltip for any element with a data-tip attribute. The native
// `title` tooltip waits ~1s and never shows on touch; this appears on hover
// immediately, is position:fixed so table/overflow containers cannot clip it.
export function installInstantTip() {
  if (typeof document === 'undefined' || window.__instantTipInstalled) return;
  window.__instantTipInstalled = true;
  const tip = document.createElement('div');
  tip.setAttribute('role', 'tooltip');
  tip.style.cssText = 'position:fixed;z-index:99999;display:none;max-width:360px;padding:6px 10px;'
    + 'border-radius:8px;background:#111827;color:#fff;font-size:12px;line-height:1.4;'
    + 'white-space:pre-line;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.25)';
  document.body.appendChild(tip);

  const hide = () => { tip.style.display = 'none'; };
  const show = (el) => {
    const text = el.getAttribute('data-tip');
    if (!text) return hide();
    tip.textContent = text;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let left = Math.min(Math.max(8, r.left), window.innerWidth - t.width - 8);
    let top = r.bottom + 6;
    if (top + t.height > window.innerHeight - 8) top = Math.max(8, r.top - t.height - 6);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  document.addEventListener('mouseover', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
    if (el) show(el); else hide();
  });
  document.addEventListener('scroll', hide, true);
  document.addEventListener('click', (e) => {
    // tap on touch devices: toggle for the tapped element
    const el = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
    if (el && window.matchMedia('(hover: none)').matches) show(el);
  });
}

// Demo forms (contact, quote request): inline validation + success state. At the port, the contact form posts to
// Shopify's {% form 'contact' %}; nothing is sent anywhere from this static build.
export function initDemoForms() {
  document.querySelectorAll<HTMLFormElement>('form[data-demo-form]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let first: HTMLElement | null = null;
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[required]').forEach((el) => {
        const ok = el.checkValidity();
        el.setAttribute('aria-invalid', String(!ok));
        const err = form.querySelector<HTMLElement>(`[data-err-for="${el.id}"]`);
        if (err) err.hidden = ok;
        if (!ok && !first) first = el;
      });
      if (first) { (first as HTMLElement).focus(); return; }
      form.querySelector<HTMLElement>('[data-fields]')!.hidden = true;
      const done = form.querySelector<HTMLElement>('[data-done]')!;
      done.hidden = false;
      done.focus();
    });
  });
}

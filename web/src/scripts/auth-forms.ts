// Account forms (login, recover, register, reset, activate, addresses, checkout, contact, unsubscribe): field-level
// validation with the message under the field, show/hide for passwords. In the Shopify theme the same markup posts to
// {% form 'customer_login' %} etc.
import { passwordOk } from './account';

export type Rule = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, form: HTMLFormElement) => string | null;

const MISSING: Record<string, string> = { email: 'Scrie adresa de email.', password: 'Scrie parola.', checkbox: 'Bifează pentru a continua.' };
const MESSAGES = { typeMismatch: 'Adresa nu pare corectă. Exemplu: nume@exemplu.ro', patternMismatch: 'Verifică formatul.' };

const describe = (el: Element, id: string, on: boolean) => {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter((x) => x && x !== id); // keep the hint, add or drop the error
  if (on) ids.push(id);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
};

/** Validates every field with an id; returns true when the form is clean. Rules: data-rule="password|confirm". */
export function validate(form: HTMLFormElement, custom: Record<string, Rule> = {}) {
  let first: HTMLElement | null = null;
  form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input[id], select[id], textarea[id]').forEach((el) => {
    if ((el as HTMLElement).closest('[hidden]') || el.type === 'radio') return;
    let msg: string | null = null;
    const v = el.validity, text = el.type !== 'checkbox' && el.tagName !== 'SELECT';
    const blank = el.required && text && !el.value.trim(); // spaces alone are not an answer
    if (!v.valid || blank) msg = el.dataset.msg ?? (v.valueMissing || blank ? MISSING[el.type] ?? 'Completează câmpul.' : v.typeMismatch ? MESSAGES.typeMismatch : MESSAGES.patternMismatch);
    if (!msg && el.dataset.rule === 'password' && !passwordOk(el.value)) msg = 'Parola are nevoie de cel puțin 8 caractere, cu o literă și o cifră.';
    if (!msg && el.dataset.rule === 'confirm') { const p = form.querySelector<HTMLInputElement>('[data-rule="password"]'); if (p && p.value !== el.value) msg = 'Parolele nu sunt la fel.'; }
    if (!msg && custom[el.id]) msg = custom[el.id](el, form);
    if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    let err = form.querySelector<HTMLElement>(`[data-err-for="${el.id}"]`);
    if (!err && msg) {
      err = document.createElement('p'); err.className = 'err'; err.dataset.errFor = el.id;
      const field = el.closest('.field'); if (field) field.append(err); else (el.closest('.check') ?? el).after(err); // inside its field: a two-column row keeps its columns
    }
    if (err) { err.id ||= `${el.id}-err`; err.textContent = msg ?? ''; err.hidden = !msg; describe(el, err.id, !!msg); }
    if (msg && !first) first = el;
  });
  if (first) (first as HTMLElement).focus();
  return !first;
}

/** Back to a clean form: no messages shown, none left in the fields' descriptions (a form opened again, reset). */
export function clearErrors(form: HTMLFormElement) {
  form.querySelectorAll<HTMLElement>('[data-err-for]').forEach((err) => {
    const el = document.getElementById(err.dataset.errFor!);
    if (el) { el.removeAttribute('aria-invalid'); describe(el, err.id, false); }
    err.textContent = ''; err.hidden = true;
  });
}

/** Messages of the fields that failed, in form order (for a summary next to the submit button). */
export const errorTexts = (form: HTMLFormElement) =>
  [...form.querySelectorAll<HTMLElement>('[data-err-for]')].filter((e) => !e.hidden && e.textContent).map((e) => e.textContent!);

/** Password fields get a show/hide button: <div class="pw"><input …><button data-pw-toggle>Arată</button></div>.
 *  The words carry the state ("Arată parola" / "Ascunde parola"); no aria-pressed, which would contradict them. */
export function initPasswordToggles(root: ParentNode = document) {
  root.querySelectorAll<HTMLButtonElement>('[data-pw-toggle]').forEach((b) => {
    const input = b.parentElement!.querySelector('input')!;
    const label = (show: boolean) => { b.innerHTML = `${show ? 'Arată' : 'Ascunde'}<span class="visually-hidden"> parola</span>`; };
    b.setAttribute('aria-controls', input.id); label(true);
    b.addEventListener('click', () => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; label(!show); });
  });
}

/** Where to go after signing in: ?next= when it resolves to a page on this site, else the account page. Resolving it
 *  (instead of looking at its first characters) also catches "/\evil.com" and "/<tab>/evil.com", which browsers read as "//evil.com". */
export const nextUrl = () => {
  const n = new URLSearchParams(location.search).get('next');
  if (!n) return '/account';
  try { const u = new URL(n, location.origin); return u.origin === location.origin ? u.pathname + u.search + u.hash : '/account'; } catch { return '/account'; }
};

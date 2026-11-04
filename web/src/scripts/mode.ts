// Shopper mode, chosen at the entry gate: 'public' (F1, 16+) or 'pro' (authorized for P1/T1).
// Stored per browser; mirrored on <html data-mode> so CSS and components can react without JS per element.
// At the Shopify port this becomes a customer tag ("autorizat") set after the authorization is verified by staff.

export type Mode = 'public' | 'pro';
const KEY = 'bomba-mode-v1';
const AUTH = 'bomba-pro-auth-v1';

export function getMode(): Mode | null {
  try { const v = localStorage.getItem(KEY); return v === 'public' || v === 'pro' ? v : null; } catch { return null; }
}
export function setMode(mode: Mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  document.documentElement.dataset.mode = mode;
  window.dispatchEvent(new CustomEvent('mode:change', { detail: mode }));
}

export type ProAuth = { status: 'none' | 'pending' | 'verified'; fileName?: string; company?: string; licence?: string };
export function getProAuth(): ProAuth {
  try { return JSON.parse(localStorage.getItem(AUTH) || '') as ProAuth; } catch { return { status: 'none' }; }
}
export function setProAuth(a: ProAuth) {
  try { localStorage.setItem(AUTH, JSON.stringify(a)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('proauth:change', { detail: a }));
}

/** Inline in <head> (Theme.astro) so the first paint already knows the mode and no gate flashes for returning visitors. */
export const modeBootScript = `try{var m=localStorage.getItem('${KEY}');if(m==='public'||m==='pro')document.documentElement.dataset.mode=m;else document.documentElement.dataset.mode='unset'}catch(e){document.documentElement.dataset.mode='unset'}`;

// Customer account, front-end only (Liquid: the customers/* templates; Shopify keeps the real account, its orders and
// addresses, and handles passwords). Until the port, everything lives in this browser's localStorage: the signed-in
// session, each customer's profile (kept when they sign out, so signing back in finds their name and choices), their
// addresses and the demo orders placed through /checkout, all keyed by email. A password is checked for shape and never stored.
export type Account = { firstName: string; lastName: string; email: string; newsletter: boolean; since: string };
export type Address = { id: string; firstName: string; lastName: string; company: string; address1: string; address2: string;
  city: string; county: string; zip: string; phone: string; isDefault: boolean };
export type OrderLine = { handle: string; title: string; quantity: number; price: number };
export type Order = { number: number; date: string; email: string; lines: OrderLine[]; total: number; payment: string; address: Omit<Address, 'id' | 'isDefault'> };

const K = { account: 'bomba-account-v1', profiles: 'bomba-profiles-v1', addresses: 'bomba-addresses-v2', orders: 'bomba-orders-v1' };
const read = <T>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: this page only */ } };

const profiles = () => read<Record<string, Account>>(K.profiles, {});
const keep = (a: Account) => { write(K.account, a); write(K.profiles, { ...profiles(), [a.email]: a }); };

export const getAccount = () => read<Account | null>(K.account, null);
export function signIn(a: Pick<Account, 'email'> & Partial<Account>) {
  const fresh: Account = { firstName: '', lastName: '', email: a.email, newsletter: false, since: new Date().toISOString() };
  const acc: Account = { ...fresh, ...(profiles()[a.email] ?? {}), ...a }; // a returning customer keeps their profile
  keep(acc);
  return acc;
}
export const updateAccount = (patch: Partial<Account>) => { const a = getAccount(); if (a) keep({ ...a, ...patch }); };
export const signOut = () => { try { localStorage.removeItem(K.account); } catch { /* ignore */ } };
/** the newsletter choice for any email (the unsubscribe page works without signing in) */
export function setNewsletter(email: string, on: boolean) {
  const p = profiles()[email];
  if (getAccount()?.email === email) updateAccount({ newsletter: on });
  else if (p) write(K.profiles, { ...profiles(), [email]: { ...p, newsletter: on } });
}

// addresses: one list per customer email
const book = () => read<Record<string, Address[]>>(K.addresses, {});
const mine = () => getAccount()?.email ?? '';
const writeMine = (list: Address[]) => { const e = mine(); if (e) write(K.addresses, { ...book(), [e]: list }); };
export const getAddresses = () => book()[mine()] ?? [];
export function saveAddress(a: Address) {
  let list = getAddresses().filter((x) => x.id !== a.id);
  if (a.isDefault) list = list.map((x) => ({ ...x, isDefault: false }));
  else if (!list.some((x) => x.isDefault)) a.isDefault = true; // there is always one default address
  list.push(a);
  writeMine(list.sort((x, y) => Number(y.isDefault) - Number(x.isDefault)));
}
export function deleteAddress(id: string) {
  const list = getAddresses().filter((x) => x.id !== id);
  if (list.length && !list.some((x) => x.isDefault)) list[0].isDefault = true;
  writeMine(list);
}
/** an address as the lines of a label: name, company, street, flat, town, phone (empty lines dropped) */
export const addressLines = (a: Omit<Address, 'id' | 'isDefault'>) =>
  [`${a.firstName} ${a.lastName}`, a.company, a.address1, a.address2, `${a.zip} ${a.city}, ${a.county}`, a.phone].filter((l) => l && l.trim());

const allOrders = () => read<Order[]>(K.orders, []).sort((a, b) => b.number - a.number);
/** The signed-in customer's orders (matched by the email they were placed with), newest first. */
export const getOrders = () => { const e = getAccount()?.email; return e ? allOrders().filter((o) => o.email === e) : []; };
export function addOrder(o: Omit<Order, 'number' | 'date'>) {
  const list = allOrders();
  const order: Order = { ...o, number: (list[0]?.number ?? 1000) + 1, date: new Date().toISOString() };
  write(K.orders, [order, ...list]);
  return order;
}

/** Password rule shown next to the field: at least 8 characters, one letter and one digit. */
export const passwordOk = (p: string) => p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p);

const dateFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

// Shop facts. Everything marked `confirmed: false` is a placeholder the owner must confirm before launch;
// the UI shows those values, but ARCHITECTURE.md lists them under "De confirmat".

export const shop = {
  name: 'Bomba Shop',
  domain: 'bomba-shop.ro',
  company: {
    legalName: '1A ARMORED HYACINTH SRL',
    cui: '40529249',
    regCom: 'J2019000189307',
  },
  email: { office: 'office@bomba-shop.ro', orders: 'comanda@bomba-shop.ro' },
  phone: { value: null as string | null, confirmed: false },
  address: { value: null as string | null, confirmed: false },
  hours: { value: 'Luni – Vineri, 10:00 – 17:00', confirmed: false },
  social: [] as { name: string; url: string }[],
};

export const commerce = {
  currency: 'RON',
  freeShipping: { threshold: 300, confirmed: false },
  shipping: { courierDays: '1–3 zile lucrătoare', confirmed: false },
  returns: { days: 14 }, // dreptul legal de retragere (OUG 34/2014); excepțiile pentru pirotehnice se confirmă cu juristul
  payments: { methods: ['Card online', 'Ramburs la curier'], confirmed: false },
};

// Legea 92/2025: persoanele fizice pot cumpăra doar F1, de la 16 ani. P1/T1 doar persoane autorizate.
export const law = {
  publicCategory: 'F1',
  publicMinAge: 16,
  proCategories: ['P1', 'T1', 'F2', 'F3', 'F4', 'T2', 'P2'],
  reference: 'Legea nr. 92/2025 pentru modificarea Legii nr. 126/1995 privind regimul materiilor explozive',
  reviewedByLawyer: false,
};

// Proiectul site-ului actual are finanțare PNRR; mențiunea trebuie păstrată (logo-uri oficiale la integrare).
export const pnrr = {
  show: true,
  text: 'Proiect finanțat prin Planul Național de Redresare și Reziliență (PNRR), finanțat de Uniunea Europeană – NextGenerationEU.',
  url: 'https://mfe.gov.ro/pnrr/',
};

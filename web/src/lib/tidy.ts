// Editorial clean-up of the old shop's product descriptions, without changing their meaning:
// restores diacritics for unambiguous words, turns "!" into calm full stops, drops the repeated age notice
// (the category badge already states it) and fixes a known typo. Liquid: done once in the product import instead.
const WORDS: Record<string, string> = {
  varsta: 'vârsta', minima: 'minimă', pretul: 'prețul', pret: 'preț', afisat: 'afișat', bucati: 'bucăți', bucata: 'bucată',
  contine: 'conține', adica: 'adică', fumigena: 'fumigenă', in: 'în', si: 'și', indepartarea: 'îndepărtarea',
  emitator: 'emițător', emitatoare: 'emițătoare', efenimente: 'evenimente', nastere: 'naștere', torta: 'torță', tortei: 'torței',
  moristi: 'moriști', colorata: 'colorată', bilute: 'biluțe', atentie: 'atenție', cate: 'câte', rosie: 'roșie', rosu: 'roșu',
  incarcatura: 'încărcătura', curand: 'curând', cumparate: 'cumpărate', siguranta: 'siguranța', instructiuni: 'instrucțiuni',
  pana: 'până', dupa: 'după', fara: 'fără', cand: 'când', intr: 'într', inaltime: 'înălțime', scantei: 'scântei',
  galbena: 'galbenă', albastra: 'albastră', portocalie: 'portocalie', stralucire: 'strălucire', petrecerile: 'petrecerile',
};
const matchCase = (src: string, out: string) => (src[0] === src[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out);

function tidyText(t: string) {
  return t
    .replace(/[A-Za-z]+/g, (w) => { const r = WORDS[w.toLowerCase()]; return r ? matchCase(w, r) : w; })
    .replace(/\s*!+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ');
}

export function tidyDescription(html: string): string {
  const paras = html.split(/<\/p>\s*<p>|<\/?p>/).map((s) => s.trim()).filter(Boolean);
  const out = paras
    .map((p) => p.split(/(?<=[.!?])\s+/).filter((s) => !/v[aâ]rst[aă]\s+minim/i.test(s.replace(/<[^>]+>/g, ''))).join(' '))
    .map((p) => p.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : tidyText(part))).join(''))
    .map((p) => p.trim())
    .filter((p) => p.replace(/<[^>]+>/g, '').trim().length > 2);
  return out.map((p) => `<p>${p}</p>`).join('');
}

# Bomba Shop — DESIGN.md

Regulile de design ale noului bomba-shop.ro. Se aplică la orice pagină, componentă sau secțiune Shopify construită pe baza acestui frontend. Valorile exacte sunt în [`brand/tokens.css`](brand/tokens.css).

## 1. Direcția

**Expunere lungă, cu etichete de specificații.** Site-ul arată ca o fotografie de noapte cu expunere lungă: cer aproape negru, urme de lumină, produse luminate de jos. Peste această atmosferă, datele tehnice ale fiecărui produs apar ca etichete industriale, inspirate de etichetele de transport de pe lăzile de artificii.

Trei reguli care decid orice dispută:

1. **Produsul și efectul lui sunt eroii.** Interfața se retrage; lumina, produsul și specificațiile rămân.
2. **Un singur moment spectaculos pe pagină.** Restul e liniștit, rapid și previzibil.
3. **Clar înainte de frumos.** Categoria (F1 / P1 / T1), prețul, stocul și butonul de cumpărare se văd mereu, la orice animație.

## 1b. Logo

Conceptul ales: **Explozia**. „O”-ul din BOMBA e o explozie văzută de sus: 6 raze lungi de magneziu, 6 raze scurte de stronțiu, un miez. Literele sunt desenate geometric, fără font. Fișierele sunt în [`brand/logo/`](brand/logo/).

| Fișier | Când |
|---|---|
| `bomba-wordmark-dark.svg` | Pe fundal închis (implicit pe site) |
| `bomba-wordmark-light.svg` | Pe fundal deschis (raze în nuanțe mai închise) |
| `bomba-wordmark-white.svg` / `-black.svg` | O singură culoare: ștampile, gravuri, colete |
| `bomba-symbol.svg` | Explozia singură: avatar, iconițe, încărcare |
| `favicon.svg`, `png/favicon-32.png`, `png/apple-touch-icon.png`, `png/icon-512.png` | Browser și telefon (8 raze, mai groase, pentru 16–32px) |
| `og-image.svg`, `png/og-image.png` | Previzualizare la distribuirea linkului (1200×630) |

Reguli:
- **Spațiu liber:** cel puțin înălțimea literei B împărțită la 4 pe fiecare latură (24px la logo de 100px).
- **Mărime minimă:** wordmark 96px lățime pe ecran; sub asta folosim simbolul.
- Nu schimbăm culorile razelor, nu rotim explozia, nu adăugăm umbre, contururi sau gradiente, nu înlocuim „O”-ul cu alt simbol.
- Pe fotografii, logo-ul stă doar pe zone liniștite și întunecate; altfel se folosește varianta albă.
- În scena 3D, particulele formează exact această geometrie (aceleași coordonate).

## 2. Culoare

| Rol | Token | Valoare | Utilizare |
|---|---|---|---|
| Fundal | `--night-950` | `#07060b` | Fundalul paginii |
| Suprafață | `--night-900` / `--night-800` | `#0e0c14` / `#17141f` | Secțiuni, carduri, drawer |
| Linii | `--night-700` | `#241f2e` | Borduri, separatoare |
| Text principal | `--white` | `#f6f1ea` | Titluri și text |
| Text secundar | `--smoke-400` | `#8f879c` | Meta, etichete atenuate (AA) |
| Accent | `--magnesium-400` | `#ffb648` | CTA, linkuri, F1, focus |
| Accent secundar | `--strontium-500` | `#ff3d6e` | P1/T1, reduceri, alerte |

**Culorile efectelor** poartă numele sărurilor care le produc în artificii: stronțiu (roșu), sodiu (galben), bariu (verde), cupru (albastru), potasiu (violet), magneziu (alb). Se folosesc **doar** pentru a codifica efectul unui produs (filtre, puncte de culoare pe card, particule 3D), niciodată decorativ.

Reguli:
- Maximum **un accent** pe ecran în afara produselor. Magneziul e implicit; stronțiul doar unde semnalează ceva.
- Textul pe accent folosește `--on-magnesium`, nu alb.
- Contrast minim WCAG AA: 4.5:1 pentru text, 3:1 pentru elemente UI. Toate perechile din tokens trec.
- Fără gradiente curcubeu, fără sclipici, fără poze stock cu artificii ca fundal.

## 3. Tipografie

| Rol | Font | Greutate | Utilizare |
|---|---|---|---|
| Display | Big Shoulders Display | 800–900, MAJUSCULE | Titluri de pagină și de secțiune, numele produsului, prețul mare |
| Corp | Figtree | 400 / 500 / 600 / 700 | Text, descrieri, butoane, etichete mici, prețuri (cu `tabular-nums`) |

- Scara: 12 · 14 · 16 · 18 · 22 · 28 · 36 · 48 · 64, iar hero `clamp(64px, 11vw, 128px)`.
- Titlurile display au `line-height: 1` și `text-wrap: balance`.
- Textul de corp: `line-height: 1.6`, maximum ~65 caractere pe rând.
- Etichetele mici sunt în Figtree, cu literă mică (sentence case), 13–14px. Fără font monospace și fără majuscule spațiate: arată a șablon.
- Cifrele în tabele, prețuri și countdown: `font-variant-numeric: tabular-nums`.
- Diacriticele românești (ă, â, î, ș, ț) se verifică în fiecare font; ambele le au.

## 4. Spațiere, forme, lumină

- Spațiere pe bază de 4px: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128.
- **Etichetele sunt drepte** (`--radius-label: 2px`, bordură de 2px). Cardurile au 6px. Pastilele rotunde doar pentru chip-urile de filtru.
- Nu folosim umbre clasice. Elevația vine din suprafețe mai deschise; accentul primește **lumină** (`--glow-magnesium`), ca un obiect aprins.
- Grilă: 12 coloane pe desktop, 4 pe mobil; gutter 16px pe mobil, 24px de la 768px, max-width 1440px.

## 5. Sistemul de etichete

Elementul specific brandului. Orice produs își arată datele tehnice prin etichete, nu prin tabele ascunse.

**Eticheta de specificații** (`.spec-label`): un rând de celule separate de borduri de 2px, doar pe pagina de produs. Ordinea e fixă:

`FOCURI 36 | CALIBRU 25 MM | TIMP 42 S | EFECT CRACKLING | F1`

- Ultima celulă e mereu categoria, plină cu culoarea categoriei.
- O valoare lipsă se afișează `—`, niciodată nu se inventează.
- Pe card: un singur rând de text simplu („36 focuri · Crackling”), doar cu valorile cunoscute. Pe pagina de produs: toate celulele.

**Insigna de categorie** (romb, `.cat-badge`): pătrat rotit la 45°, cu bordură interioară dublă, în stilul etichetelor ADR.
- **F1 · 16+**: magneziu, text „PUBLIC”.
- **P1 / T1**: stronțiu, text „AUTORIZAT”. Butonul de cumpărare cere autorizația încărcată.
- Rombul e decorativ în stil, dar informația din el e reală. Nu imităm etichete ADR reale (nu scriem „1.4G” sau numere UN pe produse fără ca ele să fie corecte pentru acel produs).

**Fitilul** (`.fuse`): bară de progres care arde de la stânga la dreapta (portocaliu → galben, cu o scânteie în vârf). Folosit pentru: progres spre livrare gratuită, încărcare, confirmare add-to-cart. Durata `--dur-scene`, easing liniar.

## 6. Componente de bază

| Componentă | Variante | Note |
|---|---|---|
| Buton | primar (magneziu plin), secundar (contur alb), ghost | Înălțime min. 48px pe mobil. Focus: contur magneziu 2px, offset 3px |
| Card produs | normal, epuizat, autorizat | Imagine decupată pe `--night-800`, lumină caldă de jos; etichetă cu 3 specificații; preț mono; add-to-cart mereu vizibil pe mobil |
| Gate de intrare | public / profesionist | Întrebarea „Cine cumpără?”; F1 cere confirmarea de 16+; P1/T1 cer autorizație |
| Mini-cart | drawer dreapta | Fitil spre livrare gratuită, upsell discret |
| Filtre | chip-uri + sheet pe mobil | Categorie, efect (culorile sărurilor), focuri, calibru, durată, preț, stoc |
| Formulare | cont, adrese, checkout, contact, dezabonare | Mesajul de eroare stă sub câmp și e legat cu `aria-describedby` (`scripts/auth-forms.ts`); parola are buton Arată/Ascunde; starea de succes ia focusul |

Stări obligatorii pentru orice componentă interactivă: default, hover, focus-visible, active, disabled, loading, eroare.

## 7. Mișcare și 3D

**Durate:** micro 120ms · UI 240ms · reveal 480ms · scenă 900ms. **Easing:** `--ease-out-expo` pentru apariții, `--ease-spring` doar pentru micro-interacțiuni (add-to-cart), liniar pentru fitil.

**Scene Three.js** (reacționează la scroll):

| Pagină | Scenă | Ce face |
|---|---|---|
| Intrare pe site | **Intro** | O bombă urcă, explodează, scânteile formează logo-ul, apoi zboară exact în logo-ul din header (o dată pe sesiune). WebGL, un singur apel de desen pe cadru |
| Home, hero | **Scena** | Un studio 3D (WebGL): podea lucioasă care reflectă produsul și efectul, fundal închis care se stinge în ceață. 5 produse reale, modelate în Blender din fotografiile lor (`tools/blender/make_models.py`, GLB cu textura pozei), alese cu săgeți sau taburi și „aprinse” cu efectul lor (vulcan argintiu, candele romane, bengală, artificii de tort, fumigenă). Lumina efectului e o lumină reală în scenă. Candelele au și spatele fotografiat: butonul „Vezi spatele” sau tragerea cu mouse-ul întoarce cutia. Fitilul de sub tab e cronometrul. Countdown până la Revelion. Primul produs e fumigena (alegerea proprietarului). Reflexia arată doar baza produsului și se stinge repede (mai slabă pe telefon). Pe telefon: countdown-ul e o bandă subțire sub header („57 zile 00:29:02”), scânteile trec pe sub ea, descrierea produsului lipsește, titlul paginii vine după primul ecran. Fără scroll forțat |
| Home, raft | **Ce aprinzi la…** | Titlul e comutatorul (Revelion, Nuntă, Aniversare, Petrecere, Gender reveal); cinci produse reale pe un raft, cu preț și coș |
| Colecție | Cer de fundal | Stele și scântei rare, cu parallax la scroll. Foarte ușor |
| Produs | Fără WebGL | Doar galeria. Scântei 2D la add-to-cart |
| Footer | **Jarul** | Scântei care cad încet și se sting |

Reguli tehnice pentru 3D:
- **Un singur context WebGL** pe pagină, reutilizat între scene.
- Randarea se oprește când scena iese din ecran (`IntersectionObserver`) și când tab-ul e ascuns.
- Buget de particule: ~9.000 pe mobil, ~18.000 pe desktop; `devicePixelRatio` limitat la 1.5.
- Scroll-ul controlează un singur parametru de progres, netezit; nu blocăm și nu deturnăm scroll-ul nativ.
- `prefers-reduced-motion`: scena arată direct starea finală, statică.
- Fără WebGL: o imagine statică a stării finale. Conținutul nu depinde niciodată de scenă.
- Textul important stă în HTML deasupra canvas-ului, nu în 3D, ca să fie accesibil și indexabil.

## 7b. Ce nu facem (arată a șablon generat)

- Etichetă mică deasupra fiecărui titlu care doar repetă titlul.
- Ultimul cuvânt din titlu colorat cu accentul.
- Numerotare 01 / 02 când conținutul nu e o secvență reală.
- Chenare în jurul a orice: celule, pastile cu contur, carduri în carduri. Spațiul, alinierea și tipografia separă conținutul.
- Nori de etichete decorative, puncte care pulsează, pete de lumină, „Derulează”, logo uriaș în footer.
- Benzi de statistici (cifră mare + etichetă mică) puse ca decor.
- Texte de marketing generice („spectaculos”, „experiență de neuitat”, semne de exclamare). Spunem concret ce face produsul.

## 8. Imagini

- **Fundalul site-ului** (`tools/make_backdrop.py`, `html::before`, fix): noaptea de după foc. Fuioare subțiri de fum care stau în aer, reci sus și calde jos, unde ard focurile, sub o granulație fină de film care ascunde treptele de culoare. Contrast foarte mic, ca textul să rămână curat. Studioul din hero se topește în el pe ultimii 96 px, iar subsolul e un văl peste el, nu un perete.

- Toate produsele: decupate, pe fundal transparent, **așezate pe podea**: fiecare decupaj are coaptă sub bază o umbră de contact calculată din forma bazei (`tools/ground_shadow.py`), iar în pagină stă pe podeaua de studio (`.mat`: podea închisă, lucioasă, cu lumina caldă sub produs, ca în scena 3D din hero). Nicio umbră „sub” produs care să-l ridice de pe sol.
- Fără poze generate cu AI ca decor: ocaziile și efectele se arată cu produse reale și cu efecte randate live.
- Watermark-urile se elimină prin inpainting; originalele se păstrează.
- Formate WebP/AVIF, `srcset` cu 3–4 lățimi, `width`/`height` declarate.
- Alt text în română, descriptiv: „Baterie de artificii Void Reaper, cutie neagră cu 12 jerbe”.
- Produsele cu personaje licențiate pe ambalaj se arată ca atare, dar personajele nu se folosesc în materialele de brand.

## 8b. Cont și pagini de serviciu

Contul urmează șabloanele Shopify `customers/*`, ca portarea să fie directă: `/account/login` (cu recuperarea parolei), `/account/register`,
`/account/reset` (și activarea contului, `?activate=1`), `/account` (comenzi, adresa principală, profil, noutăți), `/account/addresses`,
`/account/order?n=`. Până la portare, contul, adresele și comenzile demonstrative plasate din `/checkout` stau în `localStorage`
(`scripts/account.ts`); parola se verifică doar ca formă și nu se salvează nicăieri. O comandă aparține emailului cu care a fost plasată.

- **Contact** (`/pages/contact`) e doar pentru întrebări despre o comandă: subiectul (unde e comanda, modificare sau anulare, retur, altceva),
  numărul comenzii, emailul folosit. Se precompletează din cont și din pagina comenzii (`?comanda=`).
- **Dezabonare** (`/pages/dezabonare`): emailul (precompletat din `?email=` sau din cont), motivul opțional, confirmare și „abonează-mă la loc”.
  Campaniile Shopify Email au și linkul lor de dezabonare; pagina asta e cea din subsol și din cont.
- Nu mai avem pagină de spectacole sau ofertă pentru evenimente.

## 9. Ton și text

- Direct, scurt, puțin îndrăzneț, niciodată iresponsabil. „Noaptea e a ta.”, nu „Cele mai tari petarde!!!”.
- Siguranța se comunică calm și clar, fără să sperie: vârstă, distanță, mod de utilizare.
- Butoane cu verbul acțiunii: „Adaugă în coș”, „Încarcă autorizația”, „Cere ofertă”.
- Nu inventăm recenzii, stocuri, urgențe sau cifre.

## 10. Accesibilitate și performanță

- WCAG 2.2 AA: contrast, navigare completă cu tastatura, focus vizibil, ARIA corect.
- Țintă Lighthouse mobil ≥ 90 la toate categoriile; LCP < 2.5s, CLS < 0.1, INP < 200ms.
- Scenele 3D se încarcă după conținutul principal și nu blochează LCP.

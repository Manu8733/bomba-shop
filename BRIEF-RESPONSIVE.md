# Brief: site responsive pe orice ecran

Varianta clarificată a cererii: „să arate perfect pe orice ecran, rezoluție, dispozitiv și browser, nimic prea mic sau prea mare, și să se vadă în primul ecran ce trebuie, fără scroll”.

## Obiectiv

bomba-shop.ro arată complet și proporționat pe orice ecran:
- de la telefonul mic (320 px) la monitor 4K și ultrawide;
- în portret și în landscape;
- în Chrome, Edge, Firefox, Safari (macOS și iOS) și Samsung Internet.

Nimic nu e tăiat, minuscul, uriaș sau împins sub marginea ecranului.

## Ce trebuie să se vadă fără scroll

| Pagina | În primul ecran, întregi |
|---|---|
| Home | Logo, produsul din scenă cu efectul lui, numele, prețul, butonul „Adaugă în coș”, săgețile. Countdown-ul pe telefon vertical. |
| Produs | Poza, numele, prețul și butonul de coș (pe telefon, în bara fixă de jos). |
| Colecție | Titlul și începutul primului rând de produse. |
| Secțiuni „de un ecran” (efecte, spectacole) | Încap întregi în înălțimea ferestrei. |

## Reguli

1. **Scalare lină:** tipografia și spațiile cresc între 320 px și 2560 px, cu limite. Pe ecrane mari, tot layout-ul crește cu ecranul (1rem = 16 → 20 px), nu plutește mic în mijloc.
2. **Înălțimi mici:** laptop 1280×650, 1366×657 sau telefon ținut orizontal primesc un layout compact. Ce e esențial rămâne în primul ecran, iar textul secundar trece după el.
3. **Bare de browser pe mobil:** se folosește `svh` (înălțimea cu barele vizibile), cu rezervă `vh`. Bara de anunț se măsoară real, pentru că pe ecranele înguste se rupe pe două rânduri.
4. **Accesibilitate:**
   - fără scroll orizontal la nicio lățime;
   - text de minimum 12 px;
   - ținte de atingere de cel puțin 44 px;
   - focus vizibil;
   - `prefers-reduced-motion` respectat.
5. **Browsere:** rezerve pentru proprietățile noi, fără erori în consolă pe niciun motor.

## Matrice de test (automată: `web/dev/matrix.mjs`)

**Dimensiuni:**
- Telefoane: 320×568, 360×640, 375×667, 390×844, 412×915, 430×932.
- Telefoane orizontal: 667×375, 844×390.
- Tablete: 768×1024, 820×1180, 1024×768, 1180×820.
- Laptopuri: 1280×650, 1366×657, 1440×789, 1536×730.
- Desktop: 1920×969, 2560×1329, 3440×1329.

**Motoare:** Chromium (Chrome, Edge, Samsung Internet), Firefox, WebKit (Safari).

**Verificări pentru fiecare combinație:**
- elementele din tabelul de mai sus sunt complet în primul ecran;
- overflow orizontal 0;
- cel mai mic text vizibil are cel puțin 12 px;
- fără erori în consolă.

## Livrare

- Commit în Git și repo privat pe GitHub.
- Proiect Vercel legat de repo: fiecare push publică o versiune nouă, deschisă de pe orice dispozitiv.
- Versiunea de dezvoltare are `noindex`, ca să nu concureze cu magazinul real în Google.

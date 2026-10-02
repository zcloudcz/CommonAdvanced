# CommonAdvanced

Implementovaná samostatná mezivrstva mezi RestaurantCommon a RestaurantWorld. Provozní logika nemá závislost na DOM, Three.js ani konkrétním menu. Produkční kód neimportuje žádnou hru; RestaurantWorld dodává `Content` (recepty, stanice, suroviny, rozšíření a kuchyně).

- `src/inventory.ts`: obecné atomické rezervace, skládání požadavků a jednorázové uvolnění surovin. Použitelné i bez restaurace nebo nádobí.
- `src/types.ts`: kontrakty pro datové recepty, pracovníky, objednávky, provozovny a příkazy.
- `src/engine.ts`: první kompletní provozní model pro obsluhovanou restauraci. Obsahuje postupy přípravy, objednávky, zásobování, nádobí, personál, mzdy, rozšíření, síť poboček a validované ukládání.

Jádro používá společný výběr dvou rozšíření z RestaurantCommon. Restaurace dodává vlastní menu a grafiku. Současný provozní model má role a oběh nádobí restaurace; obecný adaptér jiných typů provozoven a libovolné grafy výroby jsou další rozšíření, nikoli již hotová API.

Ověření: 30 jednotkových testů provozu, atomických skladových transakcí a kolizního pohybu.

## Ověření a použití

Z tohoto adresáře: `npm test` a `npm run typecheck`. Nástroje se používají z existujícího RestaurantCommon/node_modules, bez druhé instalace. Hratelný klient: `cd ../RestaurantWorld` a `npm run dev` (port 4176).

Stav je oddělený pro každou hru. Pobočky jedné hry mají společnou pokladnu a vlastní zásoby, personál a rozšíření. Nová pobočka začíná se základním vybavením. Obnova uložené pozice odmítá neplatné vazby objednávek, předmětů, práce a nádobí. Neaktivní pobočky používají skutečné pracovníky a konečné zásoby; offline dopočet je omezen na 120 sekund a dostupnou hotovost na mzdy. Žádné automatické bezplatné doplňování zásob.

Nouzový balíček surovin na splatný dluh vyžaduje výslovný příkaz hráče. Již vzniklé mzdové závazky nezmizí propuštěním personálu. Nákup zásob platí jednou a kapacita skladu započítává i rezervace a zásilku na cestě.

[Architektonický návrh a stav implementace](ARCHITECTURE.md) · [RestaurantWorld](https://github.com/zcloudcz/RestaurantWorld)


Kolizní pohyb používá sdílený navigátor RestaurantCommon. Pevné překážky a plochy dodává obsah hry přes `Content.layout`; stanice, stoly a židle se započítávají podle vlastněných rozšíření. Klepnutí na cíl najde cestu kolem vybavení, přímé ovládání po překážce klouže. Testy ověřují všech 196 tras mezi stanovišti a stoly včetně úzkých průchodů a odchodu od hrany po ručním pohybu.

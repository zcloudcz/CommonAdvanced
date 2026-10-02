# CommonAdvanced — návrh architektury

Datum: **1. října 2026**. Stav: **první implementace běží v RestaurantWorld**.

## Implementováno

`src/inventory.ts` poskytuje obecné atomické skladové transakce. `src/engine.ts` je deterministický provozní model s datovým `Content`: objednávky, lineární kroky receptů, stanice, zásoby, dodávky, explicitní zaměstnávání, mzdy, nádobí, dvě nabídky rozšíření, devět poboček a validace uloženého stavu. Konkrétní ingredience, menu a vizuály dodává RestaurantWorld. Offline běží skutečná simulace nejvýše 120 sekund a jen s krytými mzdami.

Níže je původní cílová architektura. Libovolné grafy výrobních kroků, samostatný obecný adaptér provozoven a volitelné nádoby napříč celým runtime zatím nejsou implementovány. První runtime používá restauraci; obecný sklad na talířích ani hostech nezávisí. Aktuální API je ve zdrojových souborech, názvy v návrhových tabulkách nejsou exportovaný kontrakt.

## Původní návrh

 Samostatná vrstva CommonAdvanced a průběžný provoz RestaurantWorld s avatarem jsou potvrzeným zadáním. Názvy budoucích rozhraní níže jsou návrhové; nejde o existující API.

## Tři projekty a směr závislostí

```text
RestaurantCommon ← CommonAdvanced
        ↑                ↑
        └── RestaurantWorld
```

Šipka znamená „používá veřejné rozhraní“. CommonAdvanced smí používat úzké obecné utility a typy RestaurantCommon. RestaurantWorld používá obě vrstvy. Opačná závislost na RestaurantWorld ani import jiných konkrétních her do CommonAdvanced není dovolený.

| Projekt | Odpovědnost | Co do něj nepatří |
| --- | --- | --- |
| RestaurantCommon | Vstupy, lokalizační infrastruktura, ikony, zvuk, základní UI/renderovací pomocníky; dosavadní fastfoodový model a kompatibilita starých her | Nové objednávkové a skladové pravidlo vnucené původním hrám. |
| CommonAdvanced | Obecné objednávky, zásoby, výrobní postupy, úkoly, stanice, volitelné vratné předměty, zaměstnávání, mzdy, ekonomika, adaptér kariéry | Konkrétní jídla, země, kuchyňské styly, mapy, grafické prostředky či znalost ID existujících her. |
| RestaurantWorld | Menu, ingredience, receptová data, čtyři kuchyňské koncepty, mapy, grafika, herní cíle, vlastní UI a vstupní bod | Druhá nezávislá implementace skladové či mzdové transakce. |

Nepoužívat interní `GameState` ze souboru `RestaurantCommon/src/game/types.ts` jako univerzální kontrakt. Současný model pizza/burger má jiné předměty, pořadí obsluhy a automatické najímání. Staré hry své chování zachovají.

## Doménové služby a data

Doména CommonAdvanced je nezávislá na DOM, Three.js a konkrétním uživatelském rozhraní. Přijímá příkazy, postupuje v simulačním čase a vrací stavové změny či události. Renderovací vrstva pouze zobrazuje výsledek.

| Oblast | Navržený kontrakt |
| --- | --- |
| Zásoby | Položky s datovým ID a jednotkou; dostupné/rezervované množství; atomická rezervace, spotřeba, přesun a uvolnění. |
| Objednávky | Jedinečný lístek s požadavky, cílem dodání a stavem; částečné plnění, řízené zrušení a účet právě jednou. |
| Pracovní postupy | Graf kroků se vstupy, výstupy, dobou práce a schopností stanice. Nezávislé kroky mohou běžet souběžně. |
| Úkoly a stanice | Stabilní ID, kapacita, požadovaná schopnost, závislosti, rezervace řešitele a bezpečné předání. |
| Vratné předměty | Volitelný stavový oběh předmětu; součet kusů se změnou stavu nemění. RestaurantWorld jej použije pro talíře. |
| Zaměstnávání | Výslovné najmutí/propuštění, smlouva, role/schopnosti, pracující čas a personální kapacita. |
| Mzdy a ekonomika | Sdílená pokladna, úhrady s jedinečným ID, mzdové závazky a oddělení hotovosti od analytických nákladů. |
| Kariéra | Adaptér provozovny pro nový začátek, uložení/obnovu a konzervativní odhad čistého neaktivního provozu. |

„Oloupat brambory“ je v RestaurantWorld receptový krok se vstupem brambory a požadavkem na přípravu. CommonAdvanced zná převod položek a schopnost stanice, nikoli jméno jídla. Totéž rozhraní může jiná hra použít pro jiný výrobek.

Oběh talířů je zapnutá obsahová schopnost RestaurantWorld. Budoucí hra bez vratných předmětů nemusí vytvářet dřez, čisté/špinavé stavy ani falešné položky, aby fungovala. Podobně poskytuje hra vlastní obsluhu hostů a pravidla jejich trpělivosti; nemají být povinnou závislostí obecného skladu.

## Hranice transakcí

Přijetí lístku a rezervace vstupů musí být jedna operace. Dokončení kroku spotřebuje jeho vstupy a vytvoří výstup právě jednou. Při souběhu ručního hráče a zaměstnance vyhraje jediný platný nárok na úkol.

Propuštění nejprve bezpečně vypořádá držený inventář a rezervace řešitele. Výroba na stanici může pokračovat; jiný pracovník ji převezme. Již vzniklý mzdový dluh nezmizí. Personální limit pouze omezuje smlouvy a nikdy sám nepřidává pracovníka.

Nákup zásob odečte peníze při potvrzení objednávky jednou. Spotřeba surovin se promítá do analytického nákladu COGS, nikoli do druhé platby. Refundace musí současně upravit příslušnou rezervaci či dodávku. Všechny tyto operace mají testovatelná ID a invarianty.

Kariérní adaptér nesmí vytvářet příjem jednoduchým násobkem úrovně. Hra dodá provozní omezení: pracovníky, kapacitu, skutečné zásoby, cenu doplnění a časový limit. Offline provoz se pozastaví, když by další práce nebyla krytá; dlouhá nepřítomnost nesmí vytvořit neomezené dluhy. Politika obnovy provozu zůstává explicitním pravidlem konkrétní hry.

## Perzistence a izolace

Každá hra vlastní svůj verzovaný kořenový snapshot a identitu úložiště. CommonAdvanced nabídne validaci svých obecných částí a ověření vazeb mezi ID. RestaurantWorld použije `restaurant.world.v1`; uloží celou kariéru atomicky. Cizí hry se do její domény automaticky nemigrují.

Nesmí vzniknout singleton sdílející pokladnu nebo zásoby mezi různými spuštěnými hrami. Změna aktivní pobočky předá existující zůstatek jednou a neobnoví startovní peníze. Poškozený či budoucí formát se odmítne bez přepsání zdrojových dat.

## Postup zavedení

1. Popsat minimální veřejné utility RestaurantCommon, které první prototyp skutečně potřebuje; nic obecného nevyvíjet pouze do zásoby.
2. V CommonAdvanced ověřit malý datový pracovní postup, atomický sklad, úkol a vratný předmět v deterministických testech.
3. V RestaurantWorld propojit jeden ručně obsloužený stůl s přípravou, účtem a mytím; přidávat další recepty postupně.
4. Doplnit výslovné zaměstnávání, mzdy, zásobování a bezpečné předání práce. Zachovat manuální náhradní cestu.
5. Teprve po ověření jedné provozovny přidat kariérní adaptér, omezený neaktivní provoz a další obsahové styly.

Každé případné vytažení utility z RestaurantCommon musí projít regresními testy původních her. CommonAdvanced potřebuje vlastní testy invariantů zásob, účtů, propuštění a obnovy snapshotu; RestaurantWorld integrační testy celého restauračního provozu. Současná etapa nekonfiguruje buildy ani neinstaluje závislosti.

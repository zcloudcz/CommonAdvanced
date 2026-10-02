# CommonAdvanced

Herně nezávislá provozní simulace (bez DOM a Three.js): datové recepty, sklad s atomickými rezervacemi, objednávky, personál a mzdy, nádobí, rozšíření a síť poboček. Obsah (menu, mapy, grafiku) dodává hra — dnes [RestaurantWorld](https://github.com/zcloudcz/RestaurantWorld).

## Příkazy

```bash
npm test            # testy (používají obsah z ../RestaurantWorld)
npm run typecheck
```

Nástroje bere z `../RestaurantCommon/node_modules`. Architektura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), podrobnosti: [docs/DETAILS.md](docs/DETAILS.md)

## Rodina repozitářů

Hry sdílí kód přes relativní cesty, proto se všechny repozitáře klonují **vedle sebe do jedné složky** (názvy složek musí zůstat stejné):

```bash
for r in RestaurantCommon CommonAdvanced BurgerRush PizzaPiazza GasStation RestaurantWorld; do git clone https://github.com/zcloudcz/$r.git; done
cd RestaurantCommon && npm ci
```

| Repo | Obsah |
|---|---|
| [RestaurantCommon](https://github.com/zcloudcz/RestaurantCommon) | sdílený engine, UI, build a testy |
| [CommonAdvanced](https://github.com/zcloudcz/CommonAdvanced) | provozní simulace pro RestaurantWorld |
| [BurgerRush](https://github.com/zcloudcz/BurgerRush) · [PizzaPiazza](https://github.com/zcloudcz/PizzaPiazza) · [GasStation](https://github.com/zcloudcz/GasStation) · [RestaurantWorld](https://github.com/zcloudcz/RestaurantWorld) | hry |

Stack: TypeScript, Three.js, Vite, Vitest, Playwright. Node.js 22.12+, prohlížeč s WebGL 2.

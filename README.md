# CommonAdvanced

Game-agnostic operations simulation (no DOM, no Three.js): data-driven recipes, stock with atomic reservations, orders, staff and payroll, dishes, expansions and a branch network. Content (menus, maps, graphics) is supplied by the game — currently [RestaurantWorld](https://github.com/zcloudcz/RestaurantWorld).

## Commands

```bash
npm test            # tests (use content from ../RestaurantWorld)
npm run typecheck
```

Tooling comes from `../RestaurantCommon/node_modules`. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), details: [docs/DETAILS.md](docs/DETAILS.md)

## Repository family

The games share code through relative paths, so all repositories must be cloned **side by side into one folder** (keep the folder names unchanged):

```bash
for r in RestaurantCommon CommonAdvanced BurgerRush PizzaPiazza GasStation RestaurantWorld; do git clone https://github.com/zcloudcz/$r.git; done
cd RestaurantCommon && npm ci
```

| Repo | Contents |
|---|---|
| [RestaurantCommon](https://github.com/zcloudcz/RestaurantCommon) | shared engine, UI, build tooling and tests |
| [CommonAdvanced](https://github.com/zcloudcz/CommonAdvanced) | operations simulation used by Restaurant World |
| [BurgerRush](https://github.com/zcloudcz/BurgerRush) · [PizzaPiazza](https://github.com/zcloudcz/PizzaPiazza) · [GasStation](https://github.com/zcloudcz/GasStation) · [RestaurantWorld](https://github.com/zcloudcz/RestaurantWorld) | games |

Stack: TypeScript, Three.js, Vite, Vitest, Playwright. Requires Node.js 22.12+ and a browser with WebGL 2.

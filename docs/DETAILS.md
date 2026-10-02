# CommonAdvanced

An implemented standalone intermediate layer between RestaurantCommon and RestaurantWorld. The operational logic has no dependency on the DOM, Three.js, or any specific menu. Production code does not import any game; RestaurantWorld supplies `Content` (recipes, stations, ingredients, expansions, and cuisines).

- `src/inventory.ts`: general atomic reservations, composition of requirements, and one-time release of ingredients. Usable even without a restaurant or dishes.
- `src/types.ts`: contracts for data recipes, workers, orders, venues, and commands.
- `src/engine.ts`: the first complete operational model for a table-service restaurant. It contains preparation workflows, orders, supply, dishes, staff, wages, expansions, a branch network, and validated saving.

The core uses the shared two-expansion selection from RestaurantCommon. The restaurant supplies its own menu and graphics. The current operational model has the restaurant's roles and dish cycle; a general adapter for other types of venues and arbitrary production graphs are further extensions, not already finished APIs.

Validation: 30 unit tests of operation, atomic stock transactions, and collision movement.

## Validation and use

From this directory: `npm test` and `npm run typecheck`. The tools are used from the existing RestaurantCommon/node_modules, without a second installation. Playable client: `cd ../RestaurantWorld` and `npm run dev` (port 4176).

State is separate for each game. Branches of one game share a treasury and have their own stock, staff, and expansions. A new branch starts with basic equipment. Restoring a saved game rejects invalid links between orders, items, work, and dishes. Inactive branches use real workers and finite stock; the offline catch-up is limited to 120 seconds and the available cash for wages. No automatic free stock top-ups.

The emergency ingredient package on a repayable debt requires an explicit player command. Wage obligations that have already arisen do not disappear by firing staff. A stock purchase is paid once, and the warehouse capacity counts reservations and the shipment in transit as well.

[Architecture design and implementation status](ARCHITECTURE.md) · [RestaurantWorld](https://github.com/zcloudcz/RestaurantWorld)


Collision movement uses the shared RestaurantCommon navigator. Fixed obstacles and areas are supplied by the game's content via `Content.layout`; stations, tables, and chairs are counted according to the owned expansions. A tap on a target finds a path around the equipment, and direct control slides along an obstacle. The tests verify all 196 routes between stations and tables, including narrow passages and walking away from an edge after manual movement.

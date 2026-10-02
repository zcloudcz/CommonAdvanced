import { navigationFor } from "./navigation";
import { distanceToFootprint } from "../../RestaurantCommon/src/interaction";
import { combine, canReserve, reserve, releaseReservation } from "./inventory";
import type {
  Actor,
  Branch,
  Command,
  Content,
  Item,
  Line,
  Order,
  Recipe,
  Role,
  State,
  Vec,
} from "./types";
import { ROLES, WAGES } from "./types";
import { offeredIds } from "../../RestaurantCommon/src/progression";
export * from "./types";
export const trainingCost = (b: Branch) => Math.ceil(50 * 1.55 ** b.training);
export const movementSpeed = (b: Branch) => 4 + 0.2 * b.training;
export const activeBranch = (s: State) => s.branches[s.active];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
const newActor = (id: number, role: Actor["role"]): Actor => ({
  id,
  role,
  x: 0,
  z: 2,
  tray: [],
  target: null,
  actionTime: 0,
  angle: 0,
});
export const branchCost = (index: number) =>
  index === 0
    ? 0
    : ([0, 2000, 4000, 7000, 11000, 16000, 23000, 32000, 44000][index] ??
      Infinity);
const effects = (
  b: Branch,
  c: Content,
  key: "tables" | "staff" | "storage" | "plates" | "capacity",
) =>
  c.expansions.reduce(
    (n, e) => n + (b.owned.includes(e.id) ? (e[key] ?? 0) : 0),
    0,
  );
export const tableCount = (b: Branch, c: Content) =>
  Math.min(c.tables.length, 2 + effects(b, c, "tables"));
export const staffLimit = (b: Branch, c: Content) =>
  Math.min(12, 2 + effects(b, c, "staff"));
export const trayCapacity = (b: Branch, c: Content) =>
  Math.min(12, 4 + effects(b, c, "capacity"));
export const storageCapacity = (b: Branch, c: Content) =>
  60 + effects(b, c, "storage");
export const wagePerMinute = (b: Branch) =>
  b.workers.reduce((n, w) => n + WAGES[w.role as Role], 0);
export const styleOf = (b: Branch, c: Content) =>
  c.styles.find((v) => v.id === b.style)!;
const recipe = (b: Branch, c: Content, id: string) =>
  styleOf(b, c).recipes.find((r) => r.id === id)!;
export const offeredExpansions = (s: State, c: Content) =>
  offeredIds(c.expansions.length, activeBranch(s).owned).map(
    (id) => c.expansions.find((e) => e.id === id)!,
  );
function createBranch(s: State, c: Content, style: string): Branch {
  const used = new Set(
    c.styles
      .find((v) => v.id === style)!
      .recipes.flatMap((r) => Object.keys(r.ingredients)),
  );
  const stock: Record<string, number> = {};
  for (const i of c.ingredients) stock[i.id] = used.has(i.id) ? 4 : 0;
  return {
    style,
    training: 0,
    owned: [],
    player: newActor(s.nextId++, "player"),
    workers: [],
    stock,
    crates: {},
    orders: [],
    jobs: [],
    shelf: [],
    cleanPlates: 6,
    totalPlates: 6,
    debt: 0,
    rescueOutstanding: 0,
    wagesPaid: 0,
    revenue: 0,
    supplySpent: 0,
    served: 0,
    spawn: 1,
    time: 0,
    selectedOrder: null,
    delivery: null,
    open: true,
  };
}
export function createGame(c: Content): State {
  const s: State = {
    version: 1,
    id: c.id,
    money: 250,
    active: 0,
    branches: [],
    nextId: 1,
    seed: 42,
    time: 0,
  };
  s.branches.push(createBranch(s, c, c.styles[0].id));
  return s;
}
function random(s: State) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
function settle(s: State, b: Branch) {
  const paid = Math.min(s.money, b.debt);
  s.money -= paid;
  const rescue = Math.min(paid, b.rescueOutstanding);
  b.debt -= paid;
  b.rescueOutstanding -= rescue;
  b.wagesPaid += paid - rescue;
}
export function occupiedStorage(b: Branch) {
  return [
    ...Object.values(b.stock),
    ...Object.values(b.crates),
    ...Object.values(b.delivery?.cargo ?? {}),
    ...b.orders.flatMap((o) =>
      o.lines.flatMap((l) => Object.values(l.reserved)),
    ),
  ].reduce((n, q) => n + q, 0);
}
export function supplyQuote(b: Branch, c: Content, budget = Infinity) {
  const cargo: Record<string, number> = {};
  const used = new Set(
    styleOf(b, c).recipes.flatMap((r) => Object.keys(r.ingredients)),
  );
  let room = storageCapacity(b, c) - occupiedStorage(b);
  for (const i of c.ingredients) {
    if (!used.has(i.id)) continue;
    const n = Math.max(
      0,
      Math.min(room, Math.floor(budget / i.cost), 8 - (b.stock[i.id] ?? 0)),
    );
    if (n) {
      cargo[i.id] = n;
      room -= n;
      budget -= n * i.cost;
    }
  }
  return cargo;
}
export function supplyCost(c: Content, cargo: Record<string, number>) {
  return Object.entries(cargo).reduce(
    (n, [id, q]) =>
      n + (c.ingredients.find((i) => i.id === id)?.cost ?? Infinity) * q,
    0,
  );
}
export function rescueQuote(
  s: State,
  c: Content,
): Record<string, number> | null {
  const b = activeBranch(s),
    food = styleOf(b, c).recipes.filter((r) => r.kind === "meal");
  if (
    b.delivery ||
    b.rescueOutstanding > 0 ||
    b.orders.some((o) => o.state !== "waiting") ||
    food.some((r) =>
      Object.entries(r.ingredients).every(([id, q]) => (b.stock[id] ?? 0) >= q),
    )
  )
    return null;
  const kits = food
    .map((r) =>
      Object.fromEntries(
        Object.entries(r.ingredients)
          .map(([id, q]) => [id, Math.max(0, q - (b.stock[id] ?? 0))])
          .filter(([, q]) => Number(q) > 0),
      ),
    )
    .sort((a, b) => supplyCost(c, a) - supplyCost(c, b));
  const kit = kits[0];
  return kit && s.money < supplyCost(c, kit) ? kit : null;
}
function credit(s: State, b: Branch, amount: number) {
  s.money = Math.min(1e12, s.money + amount);
  b.revenue += amount;
  settle(s, b);
}
export function command(s: State, c: Content, cmd: Command): boolean {
  const b = activeBranch(s);
  for (const branch of s.branches) settle(s, branch);
  if (cmd.type === "move") {
    if (!Number.isFinite(cmd.target.x) || !Number.isFinite(cmd.target.z))
      return false;
    b.player.target = {
      x: clamp(cmd.target.x, -10, 10),
      z: clamp(cmd.target.z, -8, 12),
    };
    return true;
  }
  if (cmd.type === "select-order") {
    if (!b.orders.some((o) => o.id === cmd.id)) return false;
    b.selectedOrder = cmd.id;
    return true;
  }
  if (cmd.type === "open") {
    b.open = !b.open;
    return true;
  }
  if (cmd.type === "train") {
    const cost = trainingCost(b);
    if (b.training >= 10 || s.money < cost) return false;
    s.money -= cost;
    b.training++;
    return true;
  }
  if (cmd.type === "expand") {
    const e = offeredExpansions(s, c).find((e) => e.id === cmd.id);
    if (!e || s.money < e.cost) return false;
    s.money -= e.cost;
    b.owned.push(e.id);
    b.cleanPlates += e.plates ?? 0;
    b.totalPlates += e.plates ?? 0;
    return true;
  }
  if (cmd.type === "hire") {
    if (
      !ROLES.includes(cmd.role) ||
      b.workers.length >= staffLimit(b, c) ||
      s.money < WAGES[cmd.role] * 5
    )
      return false;
    // Five minutes' salary is a disclosed recruitment fee, not free capital.
    s.money -= WAGES[cmd.role] * 5;
    b.workers.push(newActor(s.nextId++, cmd.role));
    return true;
  }
  if (cmd.type === "fire") {
    const index = b.workers.findIndex((w) => w.id === cmd.id);
    if (index < 0) return false;
    b.shelf.push(...b.workers[index].tray);
    b.workers.splice(index, 1);
    return true;
  }
  if (cmd.type === "rescue") {
    const kit = rescueQuote(s, c);
    if (!kit) return false;
    const cost = supplyCost(c, kit);
    for (const [id, q] of Object.entries(kit))
      b.stock[id] = (b.stock[id] ?? 0) + q;
    b.debt += cost;
    b.rescueOutstanding = cost;
    b.supplySpent += cost;
    // Old waiting tickets may request ingredients absent from the emergency kit.
    b.orders = [];
    b.selectedOrder = null;
    b.spawn = 0;
    return true;
  }
  if (cmd.type === "supply") {
    if (b.delivery) return false;
    const entries = Object.entries(cmd.cargo);
    if (
      !entries.length ||
      entries.some(
        ([id, n]) =>
          !c.ingredients.some((i) => i.id === id) ||
          !Number.isInteger(n) ||
          n <= 0 ||
          n > 100,
      )
    )
      return false;
    const amount = entries.reduce((n, [, q]) => n + q, 0),
      stock = occupiedStorage(b);
    const cost = supplyCost(c, cmd.cargo);
    if (stock + amount > storageCapacity(b, c) || s.money < cost) return false;
    s.money -= cost;
    b.supplySpent += cost;
    b.delivery = { cargo: { ...cmd.cargo }, remaining: 12, cost };
    return true;
  }
  if (cmd.type === "travel") {
    const n = cmd.index;
    if (
      !Number.isInteger(n) ||
      n < 0 ||
      n > 8 ||
      n > s.branches.length ||
      n === s.active
    )
      return false;
    if (n === s.branches.length) {
      if (
        s.branches[n - 1].owned.length < c.expansions.length ||
        s.money < branchCost(n) ||
        !c.styles.some((v) => v.id === cmd.style)
      )
        return false;
      s.money -= branchCost(n);
      s.branches.push(createBranch(s, c, cmd.style!));
    }
    s.active = n;
    activeBranch(s).player.target = null;
    return true;
  }
  if (cmd.type === "cancel-order") {
    const o = b.orders.find((o) => o.id === cmd.id);
    if (
      !o ||
      !["waiting", "accepted"].includes(o.state) ||
      o.lines.some((l) => l.state !== "reserved")
    )
      return false;
    for (const l of o.lines) releaseReservation(b.stock, l.reserved);
    b.orders.splice(b.orders.indexOf(o), 1);
    if (b.selectedOrder === o.id) b.selectedOrder = null;
    return true;
  }
  return false;
}
const findLine = (b: Branch, id: number) =>
  b.orders.flatMap((o) => o.lines).find((l) => l.id === id);
function canCarry(a: Actor, item: Item, c: Content, b: Branch) {
  return (
    a.tray.length < trayCapacity(b, c) &&
    (item.kind === "dirty"
      ? a.tray.every((i) => i.kind === "dirty")
      : a.tray.every((i) => i.kind !== "dirty"))
  );
}
function requiredStock(b: Branch, c: Content, o: Order) {
  return combine(o.lines.map((l) => recipe(b, c, l.recipeId).ingredients));
}
function canAccept(b: Branch, c: Content, o: Order) {
  return canReserve(b.stock, requiredStock(b, c, o));
}
function accept(b: Branch, c: Content, o: Order) {
  if (!reserve(b.stock, requiredStock(b, c, o))) return false;
  for (const l of o.lines) {
    l.reserved = { ...recipe(b, c, l.recipeId).ingredients };
    l.state = "reserved";
  }
  o.state = "accepted";
  b.selectedOrder = o.id;
  return true;
}
const station = (c: Content, cap: string) =>
  c.stations.find((st) => st.capability === cap)!;
function takeShelf(
  b: Branch,
  c: Content,
  a: Actor,
  predicate: (i: Item) => boolean,
) {
  for (let i = b.shelf.length - 1; i >= 0; i--) {
    const item = b.shelf[i];
    if (predicate(item) && canCarry(a, item, c, b)) {
      a.tray.push(item);
      b.shelf.splice(i, 1);
    }
  }
}
function action(s: State, b: Branch, c: Content, a: Actor, dt: number) {
  const table = b.orders.find((o) => distance(a, c.tables[o.table]) <= 1.5);
  if (table) {
    if (table.state === "waiting") accept(b, c, table);
    if (table.state === "accepted") {
      for (let i = a.tray.length - 1; i >= 0; i--) {
        const item = a.tray[i],
          line = table.lines.find((l) => l.id === item.lineId);
        if (
          item.orderId === table.id &&
          line &&
          (item.kind === "meal" || item.kind === "drink") &&
          line.state !== "served"
        ) {
          line.state = "served";
          a.tray.splice(i, 1);
        }
      }
      if (table.lines.every((l) => l.state === "served")) {
        table.state = "eating";
        table.timer = 6;
      }
    }
    if (table.state === "bill" && !table.billed) {
      table.billed = true;
      credit(
        s,
        b,
        table.lines.reduce((n, l) => n + recipe(b, c, l.recipeId).price, 0),
      );
      b.served++;
      table.state = "dirty";
    }
    if (table.state === "dirty") {
      const item: Item = {
        kind: "dirty",
        lineId: 0,
        orderId: table.id,
        recipeId: "",
        stage: 0,
      };
      if (canCarry(a, item, c, b)) {
        a.tray.push(item);
        b.orders.splice(b.orders.indexOf(table), 1);
        if (b.selectedOrder === table.id) b.selectedOrder = null;
      }
    }
  }
  for (const st of c.stations) {
    if (
      (st.unlock && !b.owned.includes(st.unlock)) ||
      distanceToFootprint(a, st, 1.25, 0.65) > 0.85
    )
      continue;
    if (st.capability === "source") {
      for (const [id, q] of Object.entries(b.crates))
        b.stock[id] = (b.stock[id] ?? 0) + q;
      b.crates = {};
      takeShelf(
        b,
        c,
        a,
        (i) =>
          i.kind === "work" &&
          (a.role === "player" ||
            recipe(b, c, i.recipeId).kind ===
              (a.role === "bartender" ? "drink" : "meal")),
      );
      const appropriate = (o: Order) =>
        o.state === "accepted" &&
        o.lines.some(
          (l) =>
            l.state === "reserved" &&
            (a.role === "player" ||
              recipe(b, c, l.recipeId).kind ===
                (a.role === "bartender" ? "drink" : "meal")),
        );
      const order =
        b.orders.find((o) => o.id === b.selectedOrder && appropriate(o)) ??
        b.orders.find(appropriate);
      if (order)
        for (const l of order.lines) {
          const r = recipe(b, c, l.recipeId);
          if (
            l.state !== "reserved" ||
            (a.role === "cook" && r.kind !== "meal") ||
            (a.role === "bartender" && r.kind !== "drink") ||
            !["cook", "bartender", "player"].includes(a.role)
          )
            continue;
          const item: Item = {
            kind: "work",
            lineId: l.id,
            orderId: order.id,
            recipeId: r.id,
            stage: 0,
          };
          if (canCarry(a, item, c, b)) {
            a.tray.push(item);
            l.state = "moving";
          }
        }
    } else if (st.capability === "pass") {
      for (const item of a.tray) {
        if (
          item.kind === "work" &&
          item.stage >= recipe(b, c, item.recipeId).steps.length &&
          b.cleanPlates > 0
        ) {
          item.kind = "meal";
          b.cleanPlates--;
          const l = findLine(b, item.lineId);
          if (l) l.state = "ready";
        }
      }
      if (a.role === "cook" || a.role === "bartender") {
        for (let i = a.tray.length - 1; i >= 0; i--)
          if (["meal", "drink"].includes(a.tray[i].kind))
            b.shelf.push(...a.tray.splice(i, 1));
      } else
        takeShelf(b, c, a, (i) => ["meal", "drink", "dirty"].includes(i.kind));
    } else if (st.capability === "wash") {
      if (a.tray.some((i) => i.kind === "dirty")) {
        a.actionTime += dt;
        if (a.actionTime >= 2) {
          a.tray.splice(
            a.tray.findIndex((i) => i.kind === "dirty"),
            1,
          );
          b.cleanPlates++;
          a.actionTime = 0;
        }
      } else a.actionTime = 0;
    } else {
      let job = b.jobs.find((j) => j.station === st.id);
      if (job?.ready && canCarry(a, job.item, c, b)) {
        a.tray.push(job.item);
        const l = findLine(b, job.item.lineId);
        if (l) l.state = job.item.kind === "drink" ? "ready" : "moving";
        b.jobs.splice(b.jobs.indexOf(job), 1);
        job = undefined;
      }
      if (!job) {
        const i = a.tray.findIndex(
          (item) =>
            item.kind === "work" &&
            recipe(b, c, item.recipeId).steps[item.stage]?.capability ===
              st.capability,
        );
        if (i >= 0) {
          const item = a.tray.splice(i, 1)[0],
            l = findLine(b, item.lineId);
          if (l) {
            l.state = "working";
            l.reserved = {};
          }
          b.jobs.push({
            station: st.id,
            item,
            remaining: recipe(b, c, item.recipeId).steps[item.stage].seconds,
            ready: false,
          });
        }
      }
    }
  }
}
function workerTarget(b: Branch, c: Content, a: Actor): Vec | null {
  const held = a.tray[0];
  if (held) {
    if (held.kind === "dirty") return station(c, "wash");
    if (held.kind === "work")
      return station(
        c,
        recipe(b, c, held.recipeId).steps[held.stage]?.capability ?? "pass",
      );
    if (a.role === "cook" || a.role === "bartender") return station(c, "pass");
    const o = b.orders.find((o) => o.id === held.orderId);
    return o ? c.tables[o.table] : station(c, "pass");
  }
  if (a.role === "porter")
    return Object.values(b.crates).some((n) => n > 0)
      ? station(c, "source")
      : null;
  if (a.role === "waiter") {
    const bill = b.orders.find((o) => o.state === "bill");
    if (bill) return c.tables[bill.table];
    const clearing = b.orders.find((o) => o.state === "dirty");
    if (clearing) return c.tables[clearing.table];
    if (b.shelf.some((i) => i.kind === "meal" || i.kind === "drink"))
      return station(c, "pass");
    const waiting = b.orders.find(
      (o) => o.state === "waiting" && canAccept(b, c, o),
    );
    if (waiting) return c.tables[waiting.table];
  }
  if (a.role === "dishwasher" || a.role === "waiter") {
    const dirty = b.orders.find((o) => o.state === "dirty");
    if (dirty) return c.tables[dirty.table];
    if (b.shelf.some((i) => i.kind === "dirty")) return station(c, "pass");
  }
  if (a.role === "cook" || a.role === "bartender") {
    const kind = a.role === "cook" ? "meal" : "drink";
    const job = b.jobs.find((j) => recipe(b, c, j.item.recipeId).kind === kind);
    if (job) return c.stations.find((st) => st.id === job.station)!;
    if (
      b.orders.some(
        (o) =>
          o.state === "accepted" &&
          o.lines.some(
            (l) =>
              l.state === "reserved" && recipe(b, c, l.recipeId).kind === kind,
          ),
      ) ||
      b.shelf.some(
        (i) => i.kind === "work" && recipe(b, c, i.recipeId).kind === kind,
      )
    )
      return station(c, "source");
  }
  return null;
}
function move(a: Actor, target: Vec, dt: number, b:Branch,c:Content) {
  const before={x:a.x,z:a.z};
  const arrived=navigationFor(b,c).toward(a,target,movementSpeed(b),dt);
  if(Math.hypot(a.x-before.x,a.z-before.z)>.001)a.angle=Math.atan2(a.x-before.x,a.z-before.z);
  if(arrived)a.target=null;
}
function simulate(
  s: State,
  b: Branch,
  c: Content,
  input: Vec,
  dt: number,
  automatedOnly = false,
) {
  b.time += dt;
  if (b.delivery) {
    b.delivery.remaining -= dt;
    if (b.delivery.remaining <= 0) {
      for (const [id, q] of Object.entries(b.delivery.cargo))
        b.crates[id] = (b.crates[id] ?? 0) + q;
      b.delivery = null;
    }
  }
  if (b.open) {
    b.debt = Math.min(1e12, b.debt + (wagePerMinute(b) * dt) / 60);
    settle(s, b);
    b.spawn = Math.max(0, b.spawn - dt);
    if (b.spawn <= 0 && b.orders.length < Math.min(32, tableCount(b, c))) {
      const used = new Set(b.orders.map((o) => o.table)),
        table = c.tables.findIndex(
          (_, i) => i < tableCount(b, c) && !used.has(i),
        );
      if (table >= 0) {
        const recipes = styleOf(b, c).recipes,
          meals = recipes.filter((r) => r.kind === "meal"),
          drinks = recipes.filter((r) => r.kind === "drink");
        // Only offer menu combinations that can be reserved from current stock.
        const available = meals.filter((r) =>
          Object.entries(r.ingredients).every(
            ([id, q]) => (b.stock[id] ?? 0) >= q,
          ),
        );
        if (available.length) {
          const r = available[Math.floor(random(s) * available.length)],
            chosen = [r],
            drink = drinks.find((v) =>
              Object.keys({ ...r.ingredients, ...v.ingredients }).every(
                (id) =>
                  (b.stock[id] ?? 0) >=
                  (r.ingredients[id] ?? 0) + (v.ingredients[id] ?? 0),
              ),
            );
          if (drink) chosen.push(drink);
          b.orders.push({
            id: s.nextId++,
            table,
            state: "waiting",
            lines: chosen.map((r) => ({
              id: s.nextId++,
              recipeId: r.id,
              state: "reserved",
              reserved: {},
            })),
            timer: 0,
            billed: false,
          });
        }
      }
      b.spawn = 4;
    }
  }
  for (const o of b.orders)
    if (o.state === "eating") {
      o.timer -= dt;
      if (o.timer <= 0) o.state = "bill";
    }
  for (const job of b.jobs) {
    if (job.ready) continue;
    const st = c.stations.find((st) => st.id === job.station)!;
    if (
      st.capability === "prep" &&
      ![...(automatedOnly ? [] : [b.player]), ...b.workers].some(
        (a) => distanceToFootprint(a, st, 1.25, 0.65) <= 0.85,
      )
    )
      continue;
    job.remaining -= dt;
    if (job.remaining <= 0) {
      job.ready = true;
      job.remaining = 0;
      job.item.stage++;
      const r = recipe(b, c, job.item.recipeId);
      if (job.item.stage >= r.steps.length && r.kind === "drink")
        job.item.kind = "drink";
    }
  }
  const navigation=navigationFor(b,c);
  if (!automatedOnly) {
    const p=b.player;
    if(!navigation.walkable(p))Object.assign(p,navigation.nearest(p));
    if(Math.hypot(input.x,input.z)>.01){
      p.target=null;const before={x:p.x,z:p.z};
      navigation.move(p,input,movementSpeed(b)*dt);
      if(Math.hypot(p.x-before.x,p.z-before.z)>.001)p.angle=Math.atan2(p.x-before.x,p.z-before.z);
    }else if(p.target)move(p,p.target,dt,b,c);
    action(s,b,c,p,dt);
  }
  if(b.open)for(const w of b.workers){
    if(!navigation.walkable(w))Object.assign(w,navigation.nearest(w));
    const target=workerTarget(b,c,w);w.target=target;
    if(target)move(w,target,dt,b,c);
    action(s,b,c,w,dt);
  }
}
export function step(s: State, c: Content, input: Vec, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(0.1, dt);
  if (!Number.isFinite(input.x) || !Number.isFinite(input.z))
    input = { x: 0, z: 0 };
  s.time += dt;
  simulate(s, activeBranch(s), c, input, dt);
  // Inactive branches use their actual workers and stock at bounded population, no invented revenue.
  for (let i = 0; i < s.branches.length; i++)
    if (i !== s.active && s.branches[i].workers.length)
      simulate(s, s.branches[i], c, { x: 0, z: 0 }, dt, true);
}
export function encode(s: State, now = Date.now()) {
  return JSON.stringify({ state: s, savedAt: now });
}
export function decode(
  raw: string,
  c: Content,
  now = Date.now(),
): { state: State; offline: number } | null {
  try {
    if (raw.length > 1500000) return null;
    const data = JSON.parse(raw),
      s = data.state as State;
    const finite = (n: unknown, min = 0, max = 1e12) =>
      typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
    if (
      !finite(data.savedAt, 0, 8640000000000000) ||
      !finite(now, 0, 8640000000000000) ||
      s?.version !== 1 ||
      s.id !== c.id ||
      !finite(s.money) ||
      !Number.isInteger(s.active) ||
      !Array.isArray(s.branches) ||
      s.branches.length < 1 ||
      s.branches.length > 9 ||
      s.active < 0 ||
      s.active >= s.branches.length ||
      !Number.isSafeInteger(s.nextId) ||
      s.nextId < 1 ||
      !finite(s.time) ||
      !finite(s.seed, 0, 4294967295)
    )
      return null;
    const seen = new Set<number>();
    const id = (v: number) => {
      if (!Number.isSafeInteger(v) || v < 1 || v >= s.nextId || seen.has(v))
        throw Error();
      seen.add(v);
    };
    for (const b of s.branches) {
      b.training ??= 0;
      if (!Number.isInteger(b.training) || !finite(b.training, 0, 10))
        return null;
      if (
        !c.styles.some((v) => v.id === b.style) ||
        !Array.isArray(b.owned) ||
        new Set(b.owned).size !== b.owned.length ||
        b.owned.some((i) => !c.expansions.some((e) => e.id === i))
      )
        return null;
      for (const key of [
        "debt",
        "rescueOutstanding",
        "wagesPaid",
        "revenue",
        "supplySpent",
        "served",
        "time",
        "spawn",
        "cleanPlates",
        "totalPlates",
      ] as const)
        if (!finite(b[key], key === "spawn" ? -1 : 0)) return null;
      if (
        b.totalPlates !== 6 + effects(b, c, "plates") ||
        b.cleanPlates > b.totalPlates ||
        !Number.isInteger(b.cleanPlates) ||
        !Array.isArray(b.orders) ||
        b.orders.length > 32 ||
        !Array.isArray(b.workers) ||
        b.workers.length > staffLimit(b, c) ||
        !Array.isArray(b.jobs) ||
        b.jobs.length > c.stations.length ||
        !Array.isArray(b.shelf) ||
        b.shelf.length > 200 ||
        typeof b.open !== "boolean"
      )
        return null;
      for (const inventory of [b.stock, b.crates]) {
        if (
          !inventory ||
          typeof inventory !== "object" ||
          Array.isArray(inventory)
        )
          return null;
        for (const [k, v] of Object.entries(inventory))
          if (
            !c.ingredients.some((i) => i.id === k) ||
            !Number.isInteger(v) ||
            !finite(v, 0, 1000)
          )
            return null;
      }
      for (const a of [b.player, ...b.workers]) {
        id(a.id);
        if (
          !finite(a.x, -12, 12) ||
          !finite(a.z, -10, 14) ||
          !finite(a.actionTime, 0, 5) ||
          !finite(a.angle, -10, 10) ||
          !Array.isArray(a.tray) ||
          a.tray.length > trayCapacity(b, c) ||
          (a !== b.player && !ROLES.includes(a.role as Role))
        )
          return null;
        if (
          a.target &&
          (!finite(a.target.x, -10, 10) || !finite(a.target.z, -8, 12))
        )
          return null;
      }
      if (b.player.role !== "player" || b.rescueOutstanding > b.debt + 1e-8)
        return null;
      if (
        b.selectedOrder !== null &&
        (!Number.isSafeInteger(b.selectedOrder) ||
          !b.orders.some((o) => o.id === b.selectedOrder))
      )
        return null;
      if (
        [b.player, ...b.workers].some(
          (a) =>
            a.tray.some((i) => i.kind === "dirty") &&
            a.tray.some((i) => i.kind !== "dirty"),
        )
      )
        return null;
      const tables = new Set<number>(),
        lineIds = new Set<number>();
      for (const o of b.orders) {
        id(o.id);
        if (
          !Number.isInteger(o.table) ||
          o.table < 0 ||
          o.table >= tableCount(b, c) ||
          tables.has(o.table) ||
          !["waiting", "accepted", "eating", "bill", "dirty"].includes(
            o.state,
          ) ||
          !Array.isArray(o.lines) ||
          o.lines.length < 1 ||
          o.lines.length > 2 ||
          !finite(o.timer, -1, 20) ||
          typeof o.billed !== "boolean"
        )
          return null;
        tables.add(o.table);
        for (const l of o.lines) {
          id(l.id);
          lineIds.add(l.id);
          if (
            !recipe(b, c, l.recipeId) ||
            !["reserved", "moving", "working", "ready", "served"].includes(
              l.state,
            ) ||
            !l.reserved
          )
            return null;
          for (const [k, v] of Object.entries(l.reserved))
            if (
              !c.ingredients.some((i) => i.id === k) ||
              !Number.isInteger(v) ||
              !finite(v, 0, 100)
            )
              return null;
        }
      }
      const heldLines = new Set<number>();
      let plates =
        b.cleanPlates +
        b.orders.filter((o) => ["eating", "bill", "dirty"].includes(o.state))
          .length;
      const items = [
        ...b.player.tray,
        ...b.workers.flatMap((a) => a.tray),
        ...b.shelf,
        ...b.jobs.map((j) => j.item),
      ];
      for (const item of items) {
        if (
          !["work", "meal", "drink", "dirty"].includes(item.kind) ||
          !Number.isInteger(item.stage) ||
          item.stage < 0
        )
          return null;
        if (item.kind === "dirty") {
          plates++;
          continue;
        }
        const r = recipe(b, c, item.recipeId),
          order = b.orders.find((o) => o.id === item.orderId),
          line = order?.lines.find((l) => l.id === item.lineId);
        if (
          !r ||
          !line ||
          line.recipeId !== item.recipeId ||
          order?.state !== "accepted" ||
          line.state === "served" ||
          item.stage > r.steps.length ||
          !lineIds.has(item.lineId) ||
          heldLines.has(item.lineId)
        )
          return null;
        if (
          (item.kind === "meal" &&
            (r.kind !== "meal" || item.stage !== r.steps.length)) ||
          (item.kind === "drink" &&
            (r.kind !== "drink" || item.stage !== r.steps.length))
        )
          return null;
        heldLines.add(item.lineId);
        if (item.kind === "meal") plates++;
      }
      // A meal can be served while its drink is still in preparation.
      plates += b.orders
        .filter((o) => o.state === "accepted")
        .reduce(
          (n, o) =>
            n +
            o.lines.filter(
              (l) =>
                l.state === "served" &&
                recipe(b, c, l.recipeId).kind === "meal",
            ).length,
          0,
        );
      if (plates !== b.totalPlates) return null;
      for (const o of b.orders) {
        if (o.billed !== (o.state === "dirty")) return null;
        if (
          ["eating", "bill", "dirty"].includes(o.state) &&
          o.lines.some((l) => l.state !== "served")
        )
          return null;
        for (const l of o.lines) {
          const held = heldLines.has(l.id),
            required = recipe(b, c, l.recipeId).ingredients;
          if (
            o.state === "waiting" &&
            (l.state !== "reserved" || held || Object.keys(l.reserved).length)
          )
            return null;
          if (
            o.state === "accepted" &&
            l.state === "reserved" &&
            (held ||
              Object.keys({ ...l.reserved, ...required }).some(
                (k) => l.reserved[k] !== required[k],
              ))
          )
            return null;
          if (["moving", "working", "ready"].includes(l.state) && !held)
            return null;
        }
      }
      if (new Set(b.jobs.map((j) => j.station)).size !== b.jobs.length)
        return null;
      for (const j of b.jobs) {
        const st = c.stations.find((st) => st.id === j.station),
          r = recipe(b, c, j.item.recipeId);
        if (
          !st ||
          (st.unlock && !b.owned.includes(st.unlock)) ||
          !finite(j.remaining, 0, 600) ||
          typeof j.ready !== "boolean" ||
          r.steps[j.item.stage - (j.ready ? 1 : 0)]?.capability !==
            st.capability ||
          (j.ready && j.remaining !== 0)
        )
          return null;
      }
      if (b.delivery) {
        if (
          !finite(b.delivery.remaining, 0, 12) ||
          !finite(b.delivery.cost) ||
          supplyCost(c, b.delivery.cargo) !== b.delivery.cost ||
          Object.values(b.delivery.cargo).some(
            (q) => !Number.isInteger(q) || !finite(q, 1, 100),
          )
        )
          return null;
      }
      if (occupiedStorage(b) > storageCapacity(b, c)) return null;
    }
    if (
      s.branches
        .slice(0, -1)
        .some((b) => b.owned.length !== c.expansions.length)
    )
      return null;
    // Deliberately bounded exact stock-based offline simulation; no extrapolation.
    const elapsed = Math.max(0, Math.min(120, (now - data.savedAt) / 1000)),
      before = s.money;
    for (let t = 0; t < elapsed; t += 0.1)
      for (const b of s.branches)
        if (b.workers.length && b.open && s.money >= wagePerMinute(b) / 600)
          simulate(s, b, c, { x: 0, z: 0 }, Math.min(0.1, elapsed - t), true);
    return { state: s, offline: Math.max(0, s.money - before) };
  } catch {
    return null;
  }
}

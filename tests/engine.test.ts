import {
  describe,
  it,
  expect,
} from "../../RestaurantCommon/node_modules/vitest";
import { content } from "../../RestaurantWorld/src/content";
import {
  createGame,
  activeBranch,
  step,
  command,
  encode,
  decode,
  tableCount,
  offeredExpansions,
  supplyQuote,
  supplyCost,
  wagePerMinute,
  rescueQuote,
  occupiedStorage,
  storageCapacity,
} from "../src/engine";
import type { State, Content, Vec } from "../src/types";
const tick = (s: State, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.1) step(s, content, { x: 0, z: 0 }, 0.1);
};
const at = (s: State, p: Vec, seconds = 0.2) => {
  const b = activeBranch(s);
  b.player.x = p.x;
  b.player.z = p.z;
  b.player.target = null;
  tick(s, seconds);
};
const station = (cap: string) =>
  content.stations.find((st) => st.capability === cap)!;
function prepare(s: State) {
  tick(s, 1.2);
  const b = activeBranch(s),
    o = b.orders[0];
  at(s, content.tables[o.table]);
  at(s, station("source"));
  for (let n = 0; n < 12; n++) {
    const work = b.player.tray.find((i) => i.kind === "work");
    if (work) {
      const r = content.styles
        .find((v) => v.id === b.style)!
        .recipes.find((r) => r.id === work.recipeId)!;
      at(s, station(r.steps[work.stage]?.capability ?? "pass"), 5);
    } else {
      const job = b.jobs[0];
      if (job) at(s, content.stations.find((st) => st.id === job.station)!, 5);
      else break;
    }
  }
  return o;
}
describe("advanced operations", () => {
  it("has two genuine choices and charges only the selected expansion", () => {
    const s = createGame(content),
      b = activeBranch(s);
    s.money = 10000;
    const choices = offeredExpansions(s, content);
    expect(choices).toHaveLength(2);
    const next = choices[1],
      before = s.money;
    expect(command(s, content, { type: "expand", id: next.id })).toBe(true);
    expect(b.owned).toEqual([next.id]);
    expect(s.money).toBe(before - next.cost);
    expect(offeredExpansions(s, content)[0].id).toBe(choices[0].id);
  });
  it("completes manual prep/heat/drink/serve/bill/wash conserving plates", () => {
    const s = createGame(content),
      b = activeBranch(s),
      o = prepare(s);
    expect(b.player.tray.some((i) => i.kind === "meal")).toBe(true);
    expect(b.player.tray.some((i) => i.kind === "drink")).toBe(true);
    expect(b.cleanPlates).toBe(5);
    at(s, content.tables[o.table], 8);
    expect(b.served).toBe(1);
    expect(s.money).toBeGreaterThan(250);
    const money = s.money;
    tick(s, 1);
    expect(s.money).toBe(money);
    expect(b.player.tray[0].kind).toBe("dirty");
    at(s, station("wash"), 3);
    expect(b.cleanPlates).toBe(b.totalPlates);
    expect(decode(encode(s, 1000), content, 1000)).not.toBeNull();
  });
  it("round trips work in every preparation stage", () => {
    const s = createGame(content);
    tick(s, 1.2);
    const b = activeBranch(s),
      o = b.orders[0];
    at(s, content.tables[o.table]);
    for (const cap of ["source", "prep", "heat", "bar", "pass"]) {
      at(s, station(cap), 5);
      expect(decode(encode(s, 1000), content, 1000), cap).not.toBeNull();
    }
  });
  it("reserves once and restores a cancelled unstarted ticket", () => {
    const s = createGame(content);
    tick(s, 1.2);
    const b = activeBranch(s),
      o = b.orders[0],
      before = { ...b.stock };
    at(s, content.tables[o.table]);
    const reserved = { ...b.stock };
    tick(s, 1);
    expect(b.stock).toEqual(reserved);
    expect(command(s, content, { type: "cancel-order", id: o.id })).toBe(true);
    expect(b.stock).toEqual(before);
  });
  it("charges a delivery once and preserves it across saves", () => {
    const s = createGame(content),
      b = activeBranch(s),
      cargo = { potato: 3 },
      cost = supplyCost(content, cargo),
      before = s.money;
    expect(command(s, content, { type: "supply", cargo })).toBe(true);
    expect(command(s, content, { type: "supply", cargo })).toBe(false);
    expect(s.money).toBe(before - cost);
    const saved = decode(encode(s, 1000), content, 1000)!;
    expect(saved.state.branches[0].delivery?.cargo).toEqual(cargo);
    tick(s, 13);
    expect(b.crates.potato).toBe(3);
    const stock = b.stock.potato;
    at(s, station("source"));
    expect(b.stock.potato).toBe(stock + 3);
    expect(s.money).toBe(before - cost);
  });
  it("hire/fire preserves carried goods, debt and stops future wages", () => {
    const s = createGame(content),
      b = activeBranch(s);
    expect(command(s, content, { type: "hire", role: "cook" })).toBe(true);
    s.money = 0;
    tick(s, 1);
    expect(b.debt).toBeGreaterThan(0);
    const debt = b.debt,
      worker = b.workers[0];
    worker.tray.push({
      kind: "dirty",
      lineId: 0,
      orderId: 0,
      recipeId: "",
      stage: 0,
    });
    b.cleanPlates--;
    expect(command(s, content, { type: "fire", id: worker.id })).toBe(true);
    tick(s, 1);
    expect(b.debt).toBe(debt);
    expect(b.shelf).toHaveLength(1);
    expect(wagePerMinute(b)).toBe(0);
    expect(decode(encode(s, 0), content, 0)).not.toBeNull();
  });
  it("opens fresh branches with chosen style and retains one shared wallet", () => {
    const s = createGame(content),
      b = activeBranch(s);
    s.money = 100000;
    b.owned = content.expansions.map((e) => e.id);
    b.cleanPlates = b.totalPlates =
      6 + content.expansions.reduce((n, e) => n + (e.plates ?? 0), 0);
    expect(
      command(s, content, { type: "travel", index: 1, style: "wok" }),
    ).toBe(true);
    expect(activeBranch(s).owned).toEqual([]);
    expect(activeBranch(s).style).toBe("wok");
    const money = s.money;
    command(s, content, { type: "travel", index: 0 });
    expect(activeBranch(s)).toBe(b);
    expect(s.money).toBe(money);
    expect(decode(encode(s, 0), content, 0)).not.toBeNull();
  });
  it("staff can finish actual orders without a player and never invent raw stock", () => {
    const s = createGame(content),
      b = activeBranch(s);
    s.money = 500;
    b.owned = content.expansions.filter((e) => e.staff).map((e) => e.id);
    b.cleanPlates = b.totalPlates =
      6 +
      content.expansions
        .filter((e) => b.owned.includes(e.id))
        .reduce((n, e) => n + (e.plates ?? 0), 0);
    for (const role of ["cook", "bartender", "waiter", "dishwasher"] as const)
      command(s, content, { type: "hire", role });
    const stock = Object.values(b.stock).reduce((a, v) => a + v, 0);
    tick(s, 180);
    expect(b.served).toBeGreaterThan(0);
    expect(Object.values(b.stock).reduce((a, v) => a + v, 0)).toBeLessThan(
      stock,
    );
    expect(s.money).toBeGreaterThanOrEqual(0);
    expect(decode(encode(s, 1000), content, 1000)).not.toBeNull();
  });
  it("rejects invalid money, game identity and broken dish conservation", () => {
    const s = createGame(content);
    for (const patch of [{ money: -1 }, { id: "burger" }, { active: 9 }])
      expect(decode(encode({ ...s, ...patch }, 0), content, 0)).toBeNull();
    s.branches[0].cleanPlates = 99;
    expect(decode(encode(s, 0), content, 0)).toBeNull();
  });
  it("counts reserved raw ingredients against delivery capacity", () => {
    const s = createGame(content),
      b = activeBranch(s);
    tick(s, 1.2);
    at(s, content.tables[b.orders[0].table]);
    const room = storageCapacity(b, content) - occupiedStorage(b);
    expect(
      command(s, content, { type: "supply", cargo: { potato: room + 1 } }),
    ).toBe(false);
    expect(
      command(s, content, { type: "supply", cargo: { potato: room } }),
    ).toBe(true);
    command(s, content, { type: "cancel-order", id: b.orders[0].id });
    tick(s, 13);
    expect(occupiedStorage(b)).toBe(storageCapacity(b, content));
    expect(decode(encode(s, 0), content, 0)).not.toBeNull();
  });
  it("rejects orphaned work and wrong station capabilities", () => {
    const s = createGame(content),
      b = activeBranch(s);
    tick(s, 1.2);
    at(s, content.tables[b.orders[0].table]);
    at(s, station("source"));
    const bad = structuredClone(s);
    bad.branches[0].player.tray[0].orderId = 9999;
    expect(decode(encode(bad, 0), content, 0)).toBeNull();
    const missing = structuredClone(s);
    missing.branches[0].player.tray = [];
    expect(decode(encode(missing, 0), content, 0)).toBeNull();
    at(s, station("prep"), 0.2);
    expect(b.jobs.length).toBeGreaterThan(0);
    b.jobs[0].station = station("wash").id;
    expect(decode(encode(s, 0), content, 0)).toBeNull();
  });
  it("requires explicit emergency credit and recovers an empty restaurant", () => {
    const s = createGame(content),
      b = activeBranch(s);
    tick(s, 1.2);
    for (const k of Object.keys(b.stock)) b.stock[k] = 0;
    s.money = 0;
    at(s, station("source"));
    expect(b.rescueOutstanding).toBe(0);
    const quote = rescueQuote(s, content)!;
    expect(quote).not.toBeNull();
    expect(command(s, content, { type: "rescue" })).toBe(true);
    expect(b.rescueOutstanding).toBe(supplyCost(content, quote));
    expect(command(s, content, { type: "rescue" })).toBe(false);
    tick(s, 0.2);
    expect(b.orders.length).toBeGreaterThan(0);
    expect(decode(encode(s, 0), content, 0)).not.toBeNull();
  });
  it.each(content.styles.map((v) => v.id))(
    "completes and saves cuisine %s",
    (style) => {
      const s = createGame(content),
        b = activeBranch(s);
      b.style = style;
      for (const i of content.ingredients) b.stock[i.id] = 4;
      const o = prepare(s);
      at(s, content.tables[o.table], 8);
      at(s, station("wash"), 3);
      expect(b.served).toBe(1);
      expect(decode(encode(s, 0), content, 0)).not.toBeNull();
    },
  );
  it("collects ingredients beside a station footprint, not just its front", () => {
    const s = createGame(content),
      b = activeBranch(s);
    tick(s, 1.2);
    at(s, content.tables[b.orders[0].table]);
    const source = station("source");
    at(s, { x: source.x + 2, z: source.z });
    expect(b.player.tray.length).toBeGreaterThan(0);
  });
  it("caps offline operation at two minutes and stops unfunded payroll", () => {
    const s = createGame(content);
    command(s, content, { type: "hire", role: "waiter" });
    const raw = encode(s, 1000);
    expect(decode(raw, content, 121000)!.state).toEqual(
      decode(raw, content, 86401000)!.state,
    );
    s.money = 0;
    const before = activeBranch(s).debt;
    expect(
      activeBranch(decode(encode(s, 1000), content, 86401000)!.state).debt,
    ).toBe(before);
  });
  it("offers a paid movement skill without granting any expansion", () => {
    const s = createGame(content),
      b = activeBranch(s);
    const plain = createGame(content);
    expect(command(s, content, { type: "train" })).toBe(true);
    expect(s.money).toBe(200);
    expect(b.owned).toEqual([]);
    expect(b.training).toBe(1);
    step(s, content, { x: 1, z: 0 }, 0.1);
    step(plain, content, { x: 1, z: 0 }, 0.1);
    expect(b.player.x).toBeGreaterThan(activeBranch(plain).player.x);
    expect(decode(encode(s, 0), content, 0)).not.toBeNull();
  });
});

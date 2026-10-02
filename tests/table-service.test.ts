import { it, expect } from "../../RestaurantCommon/node_modules/vitest";
import { createGame, activeBranch, step, encode, decode } from "../src/engine";
import { content } from "../../RestaurantWorld/src/content";
export function billFixture(full = false) {
  const s = createGame(content),
    b = activeBranch(s),
    r = content.styles[0].recipes.find((r) => r.kind === "meal")!;
  b.open = false;
  b.orders = [
    {
      id: 2,
      table: 0,
      state: "bill",
      timer: 0,
      billed: false,
      lines: [{ id: 3, recipeId: r.id, state: "served", reserved: {} }],
    },
  ];
  s.nextId = 10;
  b.cleanPlates--;
  Object.assign(b.player, {
    x: content.tables[0].x,
    z: content.tables[0].z - 1.35,
    target: null,
  });
  if (full) {
    for (let i = 0; i < 4; i++)
      b.player.tray.push({
        kind: "dirty",
        orderId: 0,
        lineId: 0,
        recipeId: "",
        stage: 0,
      });
    b.cleanPlates -= 4;
  }
  return s;
}
it("collects payment and dishes in one action without requiring another click", () => {
  const s = billFixture(),
    b = activeBranch(s),
    before = s.money;
  expect(decode(encode(s, 1000), content, 1000)).not.toBeNull();
  step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.served).toBe(1);
  expect(s.money).toBeGreaterThan(before);
  expect(b.orders).toHaveLength(0);
  expect(b.player.tray[0]?.kind).toBe("dirty");
  expect(decode(encode(s, 1000), content, 1000)).not.toBeNull();
  for (let i = 0; i < 12; i++) step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.orders).toHaveLength(0);
  expect(b.player.tray[0].kind).toBe("dirty");
  expect(b.served).toBe(1);
});
it("collects the bill once with a full tray, then clears after washing and reloading", () => {
  let s = billFixture(true),
    b = activeBranch(s);
  const before = s.money;
  for (let i = 0; i < 15; i++) step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.orders[0].state).toBe("dirty");
  expect(b.served).toBe(1);
  expect(s.money).toBeGreaterThan(before);
  const paid = s.money,
    loaded = decode(encode(s, 1000), content, 1000)!;
  expect(loaded).not.toBeNull();
  s = loaded.state;
  b = activeBranch(s);
  const wash = content.stations.find((st) => st.capability === "wash")!;
  Object.assign(b.player, { x: wash.x, z: wash.z + 1.35 });
  for (let i = 0; i < 85; i++) step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.player.tray).toHaveLength(0);
  Object.assign(b.player, {
    x: content.tables[0].x,
    z: content.tables[0].z - 1.35,
  });
  for (let i = 0; i < 12; i++) step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.orders).toHaveLength(0);
  expect(s.money).toBe(paid);
  expect(b.served).toBe(1);
  Object.assign(b.player, { x: wash.x, z: wash.z + 1.35 });
  for (let i = 0; i < 25; i++) step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.cleanPlates).toBe(b.totalPlates);
  expect(decode(encode(s, 1000), content, 1000)).not.toBeNull();
});
it("a waiter finishes clearing a paid table before fetching another ready meal", () => {
  const s = billFixture(),
    b = activeBranch(s);
  b.open = true;
  b.orders[0].state = "dirty";
  b.orders[0].billed = true;
  b.served = 1;
  b.revenue = 27;
  s.money = 277;
  b.spawn = 20;
  b.cleanPlates--;
  b.orders.push({
    id: 4,
    table: 1,
    state: "accepted",
    timer: 0,
    billed: false,
    lines: [{ id: 5, recipeId: "roast", state: "ready", reserved: {} }],
  });
  b.shelf.push({
    kind: "meal",
    orderId: 4,
    lineId: 5,
    recipeId: "roast",
    stage: 2,
  });
  b.workers.push({
    id: 6,
    role: "waiter",
    x: b.player.x,
    z: b.player.z,
    angle: 0,
    tray: [],
    target: null,
    actionTime: 0,
  });
  Object.assign(b.player, { x: -8, z: -7 });
  step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.workers[0].target).toEqual(content.tables[0]);
  for (let i = 0; i < 150 && b.orders.some((o) => o.id === 2); i++)
    step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.orders.some((o) => o.id === 2)).toBe(false);
  expect(b.workers[0].tray[0]?.kind).toBe("dirty");
  expect(decode(encode(s, 1000), content, 1000)).not.toBeNull();
});
it("takes payment with four clean food items without mixing dirty dishes into them", () => {
  const s = billFixture(),
    b = activeBranch(s);
  b.owned = [1];
  b.cleanPlates = 3;
  s.nextId = 20;
  for (const [id, table] of [
    [4, 1],
    [7, 2],
  ]) {
    b.orders.push({
      id,
      table,
      state: "accepted",
      timer: 0,
      billed: false,
      lines: [
        { id: id + 1, recipeId: "roast", state: "ready", reserved: {} },
        { id: id + 2, recipeId: "coffee", state: "ready", reserved: {} },
      ],
    });
    b.player.tray.push(
      {
        kind: "meal",
        orderId: id,
        lineId: id + 1,
        recipeId: "roast",
        stage: 2,
      },
      {
        kind: "drink",
        orderId: id,
        lineId: id + 2,
        recipeId: "coffee",
        stage: 1,
      },
    );
  }
  expect(decode(encode(s, 1000), content, 1000)).not.toBeNull();
  step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.served).toBe(1);
  expect(s.money).toBe(277);
  expect(b.player.tray.length).toBe(4);
  expect(b.orders[0].state).toBe("dirty");
  expect(b.player.tray.some((i) => i.kind === "dirty")).toBe(false);
  for (const table of [1, 2]) {
    Object.assign(b.player, {
      x: content.tables[table].x,
      z: content.tables[table].z - 1.35,
    });
    step(s, content, { x: 0, z: 0 }, 0.1);
  }
  expect(b.player.tray).toHaveLength(0);
  Object.assign(b.player, {
    x: content.tables[0].x,
    z: content.tables[0].z - 1.35,
  });
  for (let i = 0; i < 12; i++) step(s, content, { x: 0, z: 0 }, 0.1);
  expect(b.player.tray[0]?.kind).toBe("dirty");
  expect(s.money).toBe(277);
  expect(decode(encode(s, 1000), content, 1000)).not.toBeNull();
});

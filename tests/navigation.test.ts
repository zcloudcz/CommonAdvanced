import {
  describe,
  it,
  expect,
} from "../../RestaurantCommon/node_modules/vitest";
import { content } from "../../RestaurantWorld/src/content";
import { createGame, activeBranch, step, command } from "../src/engine";
import { navigationFor } from "../src/navigation";
import { createNavigator } from "../../RestaurantCommon/src/navigation";

describe("solid equipment and routed movement", () => {
  it("blocks held keyboard movement across a workstation", () => {
    const s = createGame(content),
      b = activeBranch(s),
      st = content.stations[0];
    b.player.x = st.x;
    b.player.z = st.z + 2;
    for (let i = 0; i < 50; i++) step(s, content, { x: 0, z: -1 }, 0.1);
    expect(b.player.z).toBeGreaterThan(st.z + 0.9);
    expect(navigationFor(b, content).walkable(b.player)).toBe(true);
  });
  it("routes to each station and expanded table without crossing furniture", () => {
    const s = createGame(content),
      b = activeBranch(s);
    b.owned = content.expansions.map((e) => e.id);
    const nav = navigationFor(b, content),
      targets = [...content.stations, ...content.tables];
    for (const start of targets)
      for (const end of targets) {
        const p = nav.nearest(start);
        let arrived = false;
        for (let n = 0; n < 300 && !arrived; n++) {
          const before = { ...p };
          arrived = nav.toward(p, end, 4, 0.1);
          expect(
            nav.walkable(p),
            `${JSON.stringify(start)}→${JSON.stringify(end)}`,
          ).toBe(true);
          // Sample the entire travelled segment, not merely its endpoint.
          for (let j = 1; j < 5; j++)
            expect(
              nav.walkable({
                x: before.x + ((p.x - before.x) * j) / 5,
                z: before.z + ((p.z - before.z) * j) / 5,
              }),
              JSON.stringify({ start, end, before, p, j }),
            ).toBe(true);
        }
        expect(
          arrived,
          `${JSON.stringify({ start, end, p, target: nav.nearest(end) })}`,
        ).toBe(true);
      }
  }, 20000);
  it("projects old saves out of newly solid furniture and allows a tap target inside it", () => {
    const s = createGame(content),
      b = activeBranch(s);
    Object.assign(b.player, content.stations[0]);
    step(s, content, { x: 0, z: 0 }, 0.1);
    expect(navigationFor(b, content).walkable(b.player)).toBe(true);
    command(s, content, { type: "move", target: content.stations[3] });
    for (let i = 0; i < 150 && b.player.target; i++)
      step(s, content, { x: 0, z: 0 }, 0.1);
    expect(b.player.target).toBeNull();
    expect(
      Math.hypot(
        b.player.x - content.stations[3].x,
        b.player.z - content.stations[3].z,
      ),
    ).toBeLessThan(2);
  });
  it("substeps fast motion and never falls back to walking through an unreachable wall", () => {
    const nav = createNavigator({
      key: "test-solid-wall",
      walkable: (p) =>
        p.x >= -5 && p.x <= 5 && p.z >= -2 && p.z <= 2 && Math.abs(p.x) > 0.2,
    });
    const p = { x: -2, z: 0 };
    nav.move(p, { x: 1, z: 0 }, 10);
    expect(p.x).toBeLessThan(-0.19);
    for (let i = 0; i < 10; i++)
      expect(nav.toward(p, { x: 2, z: 0 }, 20, 0.1)).toBe(false);
    expect(p.x).toBeLessThan(-0.19);
  });
  it("can leave a wall after direct input stopped at its edge", () => {
    const b = activeBranch(createGame(content)),
      nav = navigationFor(b, content),
      st = content.stations[0];
    const actor = { x: st.x, z: st.z + 0.951 };
    expect(nav.walkable(actor)).toBe(true);
    expect(nav.toward(actor, { x: st.x, z: st.z + 3 }, 4, 0.1)).toBe(false);
    expect(actor.z).toBeGreaterThan(st.z + 1.2);
  });
});

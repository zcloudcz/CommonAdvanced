import { createNavigator } from "../../RestaurantCommon/src/navigation";
import type { Branch, Content, Vec } from "./types";

const cache = new WeakMap<
  Branch,
  { key: string; content: Content; nav: ReturnType<typeof createNavigator> }
>();
export function navigationFor(b: Branch, c: Content) {
  const key = b.owned.join(","),
    previous = cache.get(b);
  if (previous?.key === key && previous.content === c) return previous.nav;
  const count = Math.min(
    c.tables.length,
    2 +
      c.expansions.reduce(
        (n, e) => n + (b.owned.includes(e.id) ? (e.tables ?? 0) : 0),
        0,
      ),
  );
  const rectangles = [
    ...c.stations
      .filter((s) => !s.unlock || b.owned.includes(s.unlock))
      .map((s) => ({ ...s, hw: 1.35, hd: 0.73 })),
    ...c.tables
      .slice(0, count)
      .flatMap((t) =>
        [-1.05, 1.05].map((dx) => ({
          x: t.x + dx,
          z: t.z,
          hw: 0.275,
          hd: 0.35,
        })),
      ),
    ...c.layout.obstacles
      .filter((r) => "hw" in r && (!r.unlock || b.owned.includes(r.unlock)))
      .map((r) => ({ ...r }) as Vec & { hw: number; hd: number }),
  ];
  const circles = [
    ...c.tables.slice(0, count).map((t) => ({ ...t, r: 0.8 })),
    ...c.layout.obstacles
      .filter((r) => "r" in r && (!r.unlock || b.owned.includes(r.unlock)))
      .map((r) => ({ ...r }) as Vec & { r: number }),
  ];
  const walkable = (p: Vec, clearance = 0) => {
    const radius = 0.22 + clearance;
    const inside = (x: number, z: number) =>
      c.layout.areas.some(
        (a) =>
          (!a.unlock || b.owned.includes(a.unlock)) &&
          x >= a.minX &&
          x <= a.maxX &&
          z >= a.minZ &&
          z <= a.maxZ,
      );
    if (
      ![-radius, radius].every((dx) =>
        [-radius, radius].every((dz) => inside(p.x + dx, p.z + dz)),
      )
    )
      return false;
    return (
      !rectangles.some(
        (r) =>
          Math.abs(p.x - r.x) < r.hw + radius &&
          Math.abs(p.z - r.z) < r.hd + radius,
      ) && !circles.some((r) => Math.hypot(p.x - r.x, p.z - r.z) < r.r + radius)
    );
  };
  const nav = createNavigator({
    cellSize: 0.25,
    key: `advanced:${c.id}:${key}`,
    walkable,
  });
  cache.set(b, { key, content: c, nav });
  return nav;
}

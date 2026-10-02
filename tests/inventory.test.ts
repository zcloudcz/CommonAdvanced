import {
  describe,
  it,
  expect,
} from "../../RestaurantCommon/node_modules/vitest";
import { combine, reserve, releaseReservation } from "../src/inventory";
describe("reusable inventory transactions", () => {
  it("combines shared ingredients and never partially reserves", () => {
    const stock = { wood: 4, metal: 1 };
    const required = combine([{ wood: 2 }, { wood: 3, metal: 1 }]);
    expect(reserve(stock, required)).toBe(false);
    expect(stock).toEqual({ wood: 4, metal: 1 });
  });
  it("releases reservations once for arbitrary game items", () => {
    const stock = { wood: 4, metal: 1 },
      reservation = { wood: 3, metal: 1 };
    expect(reserve(stock, reservation)).toBe(true);
    releaseReservation(stock, reservation);
    releaseReservation(stock, reservation);
    expect(stock).toEqual({ wood: 4, metal: 1 });
    expect(reservation).toEqual({});
  });
});

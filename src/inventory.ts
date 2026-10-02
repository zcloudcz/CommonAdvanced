/** Raw item quantities; IDs and units belong to the consuming game. */
export type Inventory = Record<string, number>;

export function combine(inventories: Inventory[]): Inventory {
  const result: Inventory = {};
  for (const inventory of inventories)
    for (const [id, quantity] of Object.entries(inventory))
      result[id] = (result[id] ?? 0) + quantity;
  return result;
}

export function canReserve(stock: Inventory, required: Inventory): boolean {
  return Object.entries(required).every(
    ([id, quantity]) =>
      Number.isSafeInteger(quantity) &&
      quantity >= 0 &&
      (stock[id] ?? 0) >= quantity,
  );
}

/** All-or-nothing reservation; a failed reservation leaves stock untouched. */
export function reserve(stock: Inventory, required: Inventory): boolean {
  if (!canReserve(stock, required)) return false;
  for (const [id, quantity] of Object.entries(required))
    stock[id] = (stock[id] ?? 0) - quantity;
  return true;
}

/** Return an unconsumed reservation exactly once, then empty its record. */
export function releaseReservation(
  stock: Inventory,
  reserved: Inventory,
): void {
  for (const [id, quantity] of Object.entries(reserved)) {
    stock[id] = (stock[id] ?? 0) + quantity;
    delete reserved[id];
  }
}

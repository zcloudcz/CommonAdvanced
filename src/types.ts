export interface Vec {
  x: number;
  z: number;
}
export interface Text {
  cs: string;
  en: string;
}
export interface Recipe {
  id: string;
  name: Text;
  kind: "meal" | "drink";
  ingredients: Record<string, number>;
  steps: { capability: string; seconds: number }[];
  price: number;
  color: string;
}
export interface Style {
  id: string;
  name: Text;
  color: string;
  recipes: Recipe[];
}
export interface Station extends Vec {
  id: string;
  name: Text;
  capability: string;
  unlock?: number;
}
export interface Expansion {
  id: number;
  name: Text;
  description: Text;
  cost: number;
  tables?: number;
  staff?: number;
  storage?: number;
  plates?: number;
  capacity?: number;
}
export interface Content {
  id: string;
  styles: Style[];
  ingredients: { id: string; name: Text; cost: number }[];
  stations: Station[];
  tables: Vec[];
  expansions: Expansion[];
  layout: {
    areas: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      unlock?: number;
    }[];
    obstacles: ({ x: number; z: number; unlock?: number } & (
      | { hw: number; hd: number }
      | { r: number }
    ))[];
  };
}
export type Role = "cook" | "waiter" | "bartender" | "dishwasher" | "porter";
export interface Item {
  kind: "work" | "meal" | "drink" | "dirty";
  lineId: number;
  orderId: number;
  recipeId: string;
  stage: number;
}
export interface Actor extends Vec {
  id: number;
  role: "player" | Role;
  tray: Item[];
  target: Vec | null;
  actionTime: number;
  angle: number;
}
export interface Line {
  id: number;
  recipeId: string;
  state: "reserved" | "moving" | "working" | "ready" | "served";
  reserved: Record<string, number>;
}
export interface Order {
  id: number;
  table: number;
  state: "waiting" | "accepted" | "eating" | "bill" | "dirty";
  lines: Line[];
  timer: number;
  billed: boolean;
}
export interface Job {
  station: string;
  item: Item;
  remaining: number;
  ready: boolean;
}
export interface Delivery {
  cargo: Record<string, number>;
  remaining: number;
  cost: number;
}
export interface Branch {
  style: string;
  training: number;
  owned: number[];
  player: Actor;
  workers: Actor[];
  stock: Record<string, number>;
  crates: Record<string, number>;
  orders: Order[];
  jobs: Job[];
  shelf: Item[];
  cleanPlates: number;
  totalPlates: number;
  debt: number;
  rescueOutstanding: number;
  wagesPaid: number;
  revenue: number;
  supplySpent: number;
  served: number;
  spawn: number;
  time: number;
  selectedOrder: number | null;
  delivery: Delivery | null;
  open: boolean;
}
export interface State {
  version: 1;
  id: string;
  money: number;
  active: number;
  branches: Branch[];
  nextId: number;
  seed: number;
  time: number;
}
export type Command =
  | { type: "train" }
  | { type: "rescue" }
  | { type: "move"; target: Vec }
  | { type: "select-order"; id: number }
  | { type: "expand"; id: number }
  | { type: "hire"; role: Role }
  | { type: "fire"; id: number }
  | { type: "supply"; cargo: Record<string, number> }
  | { type: "travel"; index: number; style?: string }
  | { type: "open" }
  | { type: "cancel-order"; id: number };
export const ROLES: Role[] = [
  "cook",
  "waiter",
  "bartender",
  "dishwasher",
  "porter",
];
export const WAGES: Record<Role, number> = {
  cook: 3,
  waiter: 2.5,
  bartender: 2,
  dishwasher: 1.5,
  porter: 1.5,
};

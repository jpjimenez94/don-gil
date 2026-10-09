import { readFileSync } from "node:fs";

// Carta base: productos, precios, marca y los datos iniciales de cada sede.
export const menu = JSON.parse(readFileSync(new URL("../data/menu.json", import.meta.url), "utf8"));

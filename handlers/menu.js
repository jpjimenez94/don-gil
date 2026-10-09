import { menu } from "../lib/menu.js";
import { store } from "../lib/store.js";

// La carta con las sedes como están ahora: horario, tarifas, agotados y si reciben pedidos.
export default function handler(req, res) {
  return res.status(200).json({ ...menu, sedes: store.sedes, agenteActivo: store.agenteActivo });
}

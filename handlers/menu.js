import { menu } from "../lib/agent.js";
import { store } from "../lib/store.js";

export default function handler(req, res) {
  return res.status(200).json({ ...menu, agotados: store.agotados });
}

import { store } from "../lib/store.js";

// Alimenta el panel de sede (celular o tableta).
export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });
  return res.status(200).json({ pedidos: store.pedidos, avisos: store.avisos });
}

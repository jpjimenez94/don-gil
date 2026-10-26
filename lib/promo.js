// Promoción de bienvenida, igual a la de Sauko Store: un descuento a los primeros pedidos de cada día y
// un descuento sorpresa al azar con tope diario. Lo decide el sistema al registrar el pedido, nunca el
// asistente, para que el total cuadre. Solo sobre los productos (no el domicilio), uno solo por cliente,
// y solo en pedidos por WhatsApp, donde el cliente se identifica por su número.
// Viene apagada: Don Gil la prende y la ajusta en el panel.
import { store } from "./store.js";

export const PROMO_INICIAL = { activa: false, pct: 10, cupo: 10, sorpresaPct: 20, sorpresaTope: 1, sorpresaCada: 8 };
export const CANAL_CON_PROMO = "WhatsApp";

const g = globalThis.__donGil;
g.promo ??= { ...PROMO_INICIAL };
g.promoDia ??= { dia: "", primeros: 0, sorpresa: 0 };
g.clientesConPromo ??= new Set();

const entero = (v, min, max, def) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Lo que manda el panel, con límites sanos; lo que no venga conserva el valor vigente. */
export function configurarPromo(p = {}) {
  const actual = store.promo;
  store.promo = {
    activa: typeof p.activa === "boolean" ? p.activa : Boolean(actual.activa),
    pct: entero(p.pct ?? actual.pct, 1, 50, PROMO_INICIAL.pct),
    cupo: entero(p.cupo ?? actual.cupo, 0, 500, PROMO_INICIAL.cupo),
    sorpresaPct: entero(p.sorpresaPct ?? actual.sorpresaPct, 0, 70, PROMO_INICIAL.sorpresaPct),
    sorpresaTope: entero(p.sorpresaTope ?? actual.sorpresaTope, 0, 50, PROMO_INICIAL.sorpresaTope),
    sorpresaCada: entero(p.sorpresaCada ?? actual.sorpresaCada, 1, 100, PROMO_INICIAL.sorpresaCada),
  };
  return store.promo;
}

/** El día de la promoción es el de Colombia (UTC-5, sin horario de verano). */
const diaDeColombia = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

function contadorDeHoy() {
  const hoy = diaDeColombia();
  if (store.promoDia.dia !== hoy) store.promoDia = { dia: hoy, primeros: 0, sorpresa: 0 };
  return store.promoDia;
}

/** Descuento en pesos sobre los productos, redondeado a $50. */
export const valorDescuento = (subtotal, pct) => Math.round((subtotal * pct) / 100 / 50) * 50;

/** Lo que el asistente puede contarle al cliente mientras arma el pedido. No aparta nada. */
export function promoParaCliente(cliente, canal) {
  const promo = store.promo;
  if (!promo.activa || canal !== CANAL_CON_PROMO || !cliente) return null;
  if (store.clientesConPromo.has(cliente)) return { aplica: false, motivo: "Ya recibió su descuento de bienvenida en un pedido anterior, y es uno solo por cliente." };
  const quedan = Math.max(0, promo.cupo - contadorDeHoy().primeros);
  if (!quedan) return { aplica: false, motivo: `Ya se dieron los ${promo.cupo} descuentos de hoy; mañana hay de nuevo.` };
  return { aplica: true, porcentaje: promo.pct, quedan };
}

/**
 * Al registrar: decide y aparta el descuento. Primero se sortea el sorpresa (no gasta un cupo del día);
 * si no sale, se toma un cupo del día si queda.
 */
export function apartarPromo(cliente, canal, azar = Math.random) {
  const promo = store.promo;
  if (!promo.activa || canal !== CANAL_CON_PROMO || !cliente || store.clientesConPromo.has(cliente)) return null;
  const hoy = contadorDeHoy();
  let descuento = null;
  if (promo.sorpresaTope > 0 && promo.sorpresaPct > 0 && hoy.sorpresa < promo.sorpresaTope && azar() < 1 / promo.sorpresaCada) {
    hoy.sorpresa += 1;
    descuento = { tipo: "sorpresa", pct: promo.sorpresaPct, dia: hoy.dia };
  } else if (hoy.primeros < promo.cupo) {
    hoy.primeros += 1;
    descuento = { tipo: "bienvenida", pct: promo.pct, dia: hoy.dia, numero: hoy.primeros };
  }
  if (descuento) store.clientesConPromo.add(cliente);
  return descuento;
}

/** Si la sede cancela el pedido, el cliente recupera su descuento y el cupo del día vuelve. */
export function soltarPromo(pedido) {
  const d = pedido.descuento;
  if (!d) return;
  store.clientesConPromo.delete(pedido.cliente);
  const hoy = contadorDeHoy();
  if (d.dia === hoy.dia) hoy[d.tipo === "sorpresa" ? "sorpresa" : "primeros"] = Math.max(0, hoy[d.tipo === "sorpresa" ? "sorpresa" : "primeros"] - 1);
}

/** Para el panel: la configuración y cuántos descuentos van hoy. */
export function promoDeHoy() {
  const hoy = contadorDeHoy();
  return { ...store.promo, hoy: { primeros: hoy.primeros, sorpresa: hoy.sorpresa }, canal: CANAL_CON_PROMO };
}

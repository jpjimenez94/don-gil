// Almacén en memoria para la demo. En producción esto va a una base de datos:
// en Vercel cada función serverless tiene su propia memoria y no la comparte.
const g = globalThis;
g.__donGil ??= { pedidos: [], avisos: [], conversaciones: new Map(), consecutivo: 100 };

export const store = g.__donGil;

export function guardarPedido(pedido) {
  store.consecutivo += 1;
  const registro = { numero: `DG-${store.consecutivo}`, creado: new Date().toISOString(), estado: "Nuevo", ...pedido };
  store.pedidos.unshift(registro);
  return registro;
}

export function guardarAviso(aviso) {
  const registro = { creado: new Date().toISOString(), ...aviso };
  store.avisos.unshift(registro);
  return registro;
}

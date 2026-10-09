import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { guardarPedido, guardarAviso } from "./store.js";

export const menu = JSON.parse(readFileSync(new URL("../data/menu.json", import.meta.url), "utf8"));

const MODEL = process.env.DON_GIL_MODEL || "claude-opus-5-5";

// Si el modelo declina por una política de seguridad, la API reintenta en un modelo de respaldo.
// Haiku no admite este parámetro.
const RESPALDO = MODEL.includes("haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

const pesos = (n) => "$" + n.toLocaleString("es-CO");

function cartaEnTexto() {
  const sedes = menu.sedes
    .map((s) => `- ${s.id}: ${s.nombre}. ${s.direccion}. Lista de precios "${s.lista}". Horario: ${s.horario}.`)
    .join("\n");
  const productos = menu.productos
    .map((p) => `- ${p.id}: ${p.nombre}${p.desc ? ` (${p.desc})` : ""}. calle ${pesos(p.precio.calle)}, cc ${pesos(p.precio.cc)}`)
    .join("\n");
  return `SEDES\n${sedes}\n\nCARTA (id: nombre. precio lista "calle", precio lista "cc")\n${productos}`;
}

const SYSTEM = `Eres el asistente de pedidos por WhatsApp de Don Gil Empanaditas y Buñuelitos, una cadena de comida típica en Cali y Jamundí (Colombia). Lema: "${menu.marca.lema}".

Hablas como la marca: paisa, cálido y con humor suave. Usas expresiones como "mijito", "mija", "pues", "pa' que llegue pues", "con mucho gusto". No exageres: una o dos expresiones por mensaje bastan, y nunca a costa de la claridad.

Escribes para WhatsApp: mensajes cortos, texto plano, sin Markdown, sin tablas y sin asteriscos. Como mucho un emoji por mensaje. Una pregunta a la vez.

Tu trabajo es tomar pedidos completos y dejarlos listos para la sede. Para cerrar un pedido necesitas:
1. Los productos y las cantidades. Solo vendes lo que está en la carta de abajo.
2. Si es a domicilio o para recoger.
3. La sede. Si es para recoger, la que el cliente elija. Si es a domicilio, pide el barrio o la dirección y propón la sede más cercana; si no estás seguro de cuál queda más cerca, pregúntale al cliente cuál prefiere.
4. Si es a domicilio, la dirección completa.
5. El nombre de quien recibe.
6. La hora: "lo antes posible" o una hora concreta dentro del horario de la sede.

Precios: cada sede usa una lista. Las sedes de calle usan la lista "calle" y las de centro comercial la lista "cc". Cotiza siempre con la lista de la sede que va a despachar. Si el cliente pregunta por qué cambia el precio, explícale con naturalidad que las sedes de centro comercial manejan otra lista. Los nombres "calle" y "cc" son internos: nunca los menciones al cliente ni hables de "listas". Mientras no sepas la sede, da el precio de sede de calle y aclara que en centro comercial cambia un poquito.

Pago: por ahora solo contra entrega. No pidas datos de tarjeta ni envíes enlaces de pago.

Domicilio: lo llevan repartidores propios de Don Gil. No conoces el costo del domicilio ni la cobertura exacta; di que la sede confirma el valor del domicilio al despachar. No inventes tiempos de entrega exactos.

Antes de registrar, repite el pedido ítem por ítem, con sede, entrega, nombre y hora, y pide un "sí" explícito. Cuando el cliente confirme, usa la herramienta registrar_pedido. El total lo calcula la herramienta: usa el total que te devuelva, no hagas la suma de memoria. Después dile al cliente el número de pedido, el total y que se paga contra entrega.

Usa la herramienta pasar_a_persona cuando haya un reclamo, un pedido para evento o de más de 3 kilos, una pregunta que no puedas resolver con esta información, o cuando el cliente pida hablar con alguien. Dile al cliente que alguien del equipo le escribe por este mismo chat.

No inventes productos, precios, promociones, horarios ni direcciones. Si algo figura "Por confirmar", dilo así.

${cartaEnTexto()}`;

export function construirHerramientas(contexto) {
  const registrarPedido = betaTool({
    name: "registrar_pedido",
    description:
      "Registra el pedido y lo envía a la sede. Llámala solo después de que el cliente confirme el resumen del pedido con un sí explícito. Devuelve el número de pedido y el total calculado con la lista de precios de la sede.",
    inputSchema: {
      type: "object",
      properties: {
        sede_id: { type: "string", enum: menu.sedes.map((s) => s.id), description: "Sede que despacha el pedido." },
        entrega: { type: "string", enum: ["domicilio", "recoger"] },
        direccion: { type: "string", description: "Dirección completa. Obligatoria si la entrega es a domicilio." },
        nombre: { type: "string", description: "Nombre de quien recibe." },
        hora: { type: "string", description: "'Lo antes posible' o la hora pedida por el cliente." },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              producto_id: { type: "string", enum: menu.productos.map((p) => p.id) },
              cantidad: { type: "integer", minimum: 1 },
            },
            required: ["producto_id", "cantidad"],
            additionalProperties: false,
          },
        },
        notas: { type: "string", description: "Indicaciones del cliente, por ejemplo 'con bastante ají'." },
      },
      required: ["sede_id", "entrega", "nombre", "hora", "items"],
      additionalProperties: false,
    },
    run: (input) => {
      const sede = menu.sedes.find((s) => s.id === input.sede_id);
      if (!sede) return "Error: la sede no existe.";
      if (input.entrega === "domicilio" && !input.direccion?.trim()) {
        return "Error: falta la dirección para el domicilio. Pídela al cliente antes de registrar.";
      }
      const lineas = [];
      for (const item of input.items ?? []) {
        const producto = menu.productos.find((p) => p.id === item.producto_id);
        if (!producto || !Number.isInteger(item.cantidad) || item.cantidad < 1) {
          return `Error: el producto "${item.producto_id}" o su cantidad no son válidos.`;
        }
        const unitario = producto.precio[sede.lista];
        lineas.push({ producto: producto.nombre, cantidad: item.cantidad, unitario, subtotal: unitario * item.cantidad });
      }
      if (!lineas.length) return "Error: el pedido no tiene productos.";
      const total = lineas.reduce((suma, l) => suma + l.subtotal, 0);
      const pedido = guardarPedido({
        canal: contexto.canal,
        cliente: contexto.cliente,
        sede: sede.nombre,
        sede_id: sede.id,
        entrega: input.entrega,
        direccion: input.direccion ?? "",
        nombre: input.nombre,
        hora: input.hora,
        notas: input.notas ?? "",
        lineas,
        total,
        pago: menu.marca.pago,
      });
      contexto.pedido = pedido;
      return JSON.stringify({
        numero: pedido.numero,
        sede: sede.nombre,
        total_productos: pesos(total),
        detalle: lineas.map((l) => `${l.cantidad} x ${l.producto} = ${pesos(l.subtotal)}`),
        domicilio: input.entrega === "domicilio" ? "La sede confirma el valor del domicilio al despachar." : "No aplica.",
        pago: menu.marca.pago,
      });
    },
  });

  const pasarAPersona = betaTool({
    name: "pasar_a_persona",
    description:
      "Avisa al equipo de Don Gil para que una persona continúe la conversación. Úsala ante reclamos, pedidos para eventos o de más de 3 kilos, preguntas que no puedas resolver, o cuando el cliente pida hablar con alguien.",
    inputSchema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Qué necesita el cliente, en una frase." },
        sede_id: { type: "string", enum: menu.sedes.map((s) => s.id), description: "Sede relacionada, si se sabe." },
      },
      required: ["motivo"],
      additionalProperties: false,
    },
    run: (input) => {
      const sede = menu.sedes.find((s) => s.id === input.sede_id);
      contexto.aviso = guardarAviso({
        canal: contexto.canal,
        cliente: contexto.cliente,
        motivo: input.motivo,
        sede: sede?.nombre ?? "Sin definir",
      });
      return "Aviso enviado al equipo. Una persona continúa por este mismo chat.";
    },
  });

  return [registrarPedido, pasarAPersona];
}

/**
 * Responde un turno de conversación.
 * @param {Array<{role: "user" | "assistant", content: string}>} historial - termina en un mensaje del cliente.
 * @param {{canal: string, cliente: string}} origen
 */
export async function responder(historial, origen) {
  const client = new Anthropic();
  const contexto = { ...origen, pedido: null, aviso: null };

  const mensaje = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    ...RESPALDO,
    system: SYSTEM,
    tools: construirHerramientas(contexto),
    messages: historial.map((m) => ({ role: m.role, content: m.content })),
    max_iterations: 6,
  });

  if (mensaje.stop_reason === "refusal") {
    return { texto: "Qué pena mijito, con eso no le puedo ayudar por acá. ¿Le tomo un pedido?", pedido: null, aviso: null };
  }

  const texto = mensaje.content
    .filter((bloque) => bloque.type === "text")
    .map((bloque) => bloque.text)
    .join("\n")
    .trim();

  return { texto: texto || "Deme un momentico y le confirmo, mijito.", pedido: contexto.pedido, aviso: contexto.aviso };
}

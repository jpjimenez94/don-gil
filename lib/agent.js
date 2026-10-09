import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { guardarPedido, guardarAviso, store } from "./store.js";

export const menu = JSON.parse(readFileSync(new URL("../data/menu.json", import.meta.url), "utf8"));

const MODEL = process.env.DON_GIL_MODEL || "claude-opus-5-5";

// Si el modelo declina por una política de seguridad, la API reintenta en un modelo de respaldo.
// Haiku no admite este parámetro.
const RESPALDO = MODEL.includes("haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

const pesos = (n) => "$" + n.toLocaleString("es-CO");
const zonasDe = (sede) => sede.domicilio ?? [];
const todasLasZonas = menu.sedes.flatMap(zonasDe);

function cartaEnTexto() {
  const sedes = menu.sedes
    .map((s) => {
      const zonas = zonasDe(s)
        .map((z) => `    - ${z.id}: ${z.nombre} (${z.barrios.join(", ")}). Domicilio ${pesos(z.precio)}`)
        .join("\n");
      return `- ${s.id}: ${s.nombre}. ${s.direccion}. Lista de precios "${s.lista}". Horario: ${s.horario}.\n  Zonas de domicilio:\n${zonas}`;
    })
    .join("\n");
  const productos = menu.productos
    .map((p) => `- ${p.id}: ${p.nombre}${p.desc ? ` (${p.desc})` : ""}. calle ${pesos(p.precio.calle)}, cc ${pesos(p.precio.cc)}`)
    .join("\n");
  return `SEDES Y ZONAS DE DOMICILIO\n${sedes}\n\nCARTA (id: nombre. precio lista "calle", precio lista "cc")\n${productos}`;
}

const SYSTEM = `Eres quien atiende los pedidos por WhatsApp de Don Gil Empanaditas y Buñuelitos, una cadena de comida típica en Cali y Jamundí (Colombia). Lema: "${menu.marca.lema}".

CÓMO ESCRIBES
Escribes como una persona de la sede que contesta el WhatsApp desde el mostrador, no como un formulario. El cliente tiene hambre y quiere salir de eso rápido.
- Trata siempre de "usted", con calidez paisa: "mijito", "mija", "con mucho gusto", "pues". Una expresión así por mensaje es suficiente, y no en todos.
- Mensajes cortos: lo normal son una o dos líneas. Texto plano, sin Markdown, sin asteriscos, sin listas con guiones. Como mucho un emoji, y no en todos los mensajes.
- No repitas lo que el cliente acaba de decir ni saludes de nuevo en cada mensaje.
- Pide de una sola vez todo lo que falte, en una frase natural. Por ejemplo: "¿A nombre de quién y para qué hora se lo dejo?" en vez de dos preguntas en dos mensajes. Si el cliente ya dio un dato, no lo vuelvas a pedir.
- Si el cliente da todo en un solo mensaje, pasa directo al resumen.
- Entiende el habla corriente: "ya", "ahora" o "de una vez" como hora significan lo antes posible; un nombre suelto al final del mensaje es quien recibe. "Me regala" o "regáleme" es la forma amable de pedir en Colombia ("me da", "véndame"): nunca lo tomes como que lo quiere gratis ni hagas chistes con eso. No preguntes lo que se puede entender.
- Responde primero lo que preguntó y después sigue con el pedido.

QUÉ NECESITAS PARA CERRAR UN PEDIDO
Productos y cantidades (solo lo que está en la carta), si es a domicilio o para recoger, la sede, el nombre de quien recibe y la hora ("lo antes posible" o una hora dentro del horario de la sede). Si es a domicilio, además la dirección completa con barrio.

PRECIOS
Cada sede tiene su lista. Las sedes de calle usan "calle" y las de centro comercial "cc". Cotiza con la lista de la sede que despacha. Mientras no sepas la sede, da el precio de sede de calle y aclara que en centro comercial cambia un poquito. Los nombres "calle" y "cc" y los id de productos, sedes y zonas (como empanadas-5 o jamundi-cerca) son internos: nunca los menciones; usa los nombres.

DOMICILIO
Lo llevan repartidores propios de Don Gil y tiene un valor fijo según la zona. Con el barrio del cliente, busca la zona en la lista de abajo: eso define la sede que despacha y el valor del domicilio. Dile el valor del domicilio antes de confirmar, sumado en el total; nunca digas que "se confirma después". Si el barrio no aparece en ninguna zona, pregunta por un barrio o punto de referencia cercano; si sigue sin aparecer, di con franqueza que por ahora no llegan hasta allá y ofrece recoger en la sede más cercana. No prometas tiempos de entrega exactos.

PAGO
Solo contra entrega por ahora. No pidas datos de tarjeta ni envíes enlaces de pago.

CONFIRMACIÓN Y REGISTRO
Antes de registrar, resume el pedido en un solo mensaje corto y corrido: qué lleva, dónde y cuándo, a nombre de quién, y el total con domicilio incluido. Cierra con una pregunta natural como "¿Se lo dejo así?". Cualquier respuesta afirmativa clara ("sí", "dale", "hágale", "listo", "de una") vale como confirmación. Entonces usa registrar_pedido. El total lo calcula la herramienta: usa ese valor, no sumes de memoria. Después confirma en una o dos líneas: el número de pedido dicho en palabras claras ("su pedido es el número 101"), el total y que se paga contra entrega. Si es para recoger, dile que con ese número y su nombre lo reclama en la sede. Dile que le avisas por aquí cuando esté en preparación y cuando salga.

CUÁNDO PASAR A UNA PERSONA
Usa pasar_a_persona ante un reclamo, un pedido para evento o de más de 3 kilos, una pregunta que no puedas resolver con esta información, o cuando el cliente lo pida. Dile que alguien del equipo le escribe por este mismo chat.

No inventes productos, precios, promociones, horarios, zonas ni direcciones. Si algo figura "Por confirmar", dilo así. Los mensajes de la conversación que avisan cambios de estado del pedido los envió la sede; puedes apoyarte en ellos si el cliente pregunta cómo va su pedido.

${cartaEnTexto()}`;

// La sede marca en el panel lo que se acabó; el agente deja de ofrecerlo en el siguiente mensaje.
function agotadosEnTexto() {
  const nombres = menu.productos.filter((p) => store.agotados.includes(p.id)).map((p) => p.nombre);
  if (!nombres.length) return "";
  return `

AGOTADO HOY: ${nombres.join(", ")}. No los ofrezcas ni los registres. Si el cliente los pide, dile con naturalidad que hoy se acabaron y ofrece lo más parecido de la carta.`;
}

export function construirHerramientas(contexto) {
  const registrarPedido = betaTool({
    name: "registrar_pedido",
    description:
      "Registra el pedido y lo envía a la sede. Llámala solo después de que el cliente confirme el resumen. Devuelve el número de pedido y el total calculado: productos con la lista de la sede más el domicilio de la zona.",
    inputSchema: {
      type: "object",
      properties: {
        sede_id: { type: "string", enum: menu.sedes.map((s) => s.id), description: "Sede que despacha el pedido." },
        entrega: { type: "string", enum: ["domicilio", "recoger"] },
        zona_id: { type: "string", enum: todasLasZonas.map((z) => z.id), description: "Zona de domicilio. Obligatoria si la entrega es a domicilio; debe ser una zona de la sede que despacha." },
        direccion: { type: "string", description: "Dirección completa con barrio. Obligatoria si la entrega es a domicilio." },
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

      let zona = null;
      if (input.entrega === "domicilio") {
        if (!input.direccion?.trim()) return "Error: falta la dirección para el domicilio. Pídela al cliente antes de registrar.";
        zona = zonasDe(sede).find((z) => z.id === input.zona_id);
        if (!zona) return `Error: la zona no pertenece a la sede ${sede.nombre}. Elige una zona de esa sede o cambia de sede.`;
      }

      const lineas = [];
      for (const item of input.items ?? []) {
        const producto = menu.productos.find((p) => p.id === item.producto_id);
        if (!producto || !Number.isInteger(item.cantidad) || item.cantidad < 1) {
          return `Error: el producto "${item.producto_id}" o su cantidad no son válidos.`;
        }
        if (store.agotados.includes(producto.id)) return `Error: "${producto.nombre}" está agotado hoy. Díselo al cliente y ofrécele otra cosa.`;
        const unitario = producto.precio[sede.lista];
        lineas.push({ producto: producto.nombre, cantidad: item.cantidad, unitario, subtotal: unitario * item.cantidad });
      }
      if (!lineas.length) return "Error: el pedido no tiene productos.";

      const subtotal = lineas.reduce((suma, l) => suma + l.subtotal, 0);
      const domicilio = zona?.precio ?? 0;
      const pedido = guardarPedido({
        canal: contexto.canal,
        cliente: contexto.cliente,
        sede: sede.nombre,
        sede_id: sede.id,
        entrega: input.entrega,
        zona: zona?.nombre ?? "",
        direccion: input.direccion ?? "",
        nombre: input.nombre,
        hora: input.hora,
        notas: input.notas ?? "",
        lineas,
        subtotal,
        domicilio,
        total: subtotal + domicilio,
        pago: menu.marca.pago,
      });
      contexto.pedido = pedido;
      return JSON.stringify({
        numero_de_pedido: pedido.corto,
        sede: sede.nombre,
        detalle: lineas.map((l) => `${l.cantidad} x ${l.producto} = ${pesos(l.subtotal)}`),
        productos: pesos(subtotal),
        domicilio: zona ? pesos(domicilio) : "No aplica",
        total: pesos(pedido.total),
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
    system: SYSTEM + agotadosEnTexto(),
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

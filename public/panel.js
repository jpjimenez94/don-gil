// Panel de sede: tablero de pedidos que se actualiza solo.
const INTERVALO_MS = 3000;
const MINUTOS_DEMORA = 10; // un pedido nuevo sin atender pasa a rojo
// Cada botón mueve el pedido un paso y le avisa al cliente por el chat.
const SIGUIENTE = {
  "Nuevo": () => ({ estado: "En preparación", texto: "Empezar a preparar", clase: "" }),
  "En preparación": (p) => ({ estado: "Listo", texto: p.entrega === "domicilio" ? "Despachar domicilio" : "Listo para recoger", clase: "accion--listo" }),
  "Listo": () => ({ estado: "Entregado", texto: "Marcar entregado", clase: "accion--suave" }),
};
const COLUMNAS = { "Nuevo": "col-Nuevo", "En preparación": "col-prep", "Listo": "col-Listo" };
const CONTADORES = { "Nuevo": "n-Nuevo", "En preparación": "n-prep", "Listo": "n-Listo" };

const $ = (id) => document.getElementById(id);
const pesos = (n) => "$" + n.toLocaleString("es-CO");
const hora = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (texto) => String(texto ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c]);

const filtro = $("filtro");
const botonSonido = $("sonido");
let datos = { pedidos: [], avisos: [] };
let conocidos = null; // números de pedido ya vistos; null hasta la primera carga
let audio = null;

function recordar(clave, valor) {
  try {
    if (valor === undefined) return localStorage.getItem(clave);
    localStorage.setItem(clave, valor);
  } catch {
    return null;
  }
}

function haceCuanto(iso) {
  const minutos = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  return `hace ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

function timbre() {
  if (!audio) return;
  for (const [i, frecuencia] of [880, 1175].entries()) {
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    const inicio = audio.currentTime + i * 0.18;
    oscilador.frequency.value = frecuencia;
    volumen.gain.setValueAtTime(0.25, inicio);
    volumen.gain.exponentialRampToValueAtTime(0.001, inicio + 0.35);
    oscilador.connect(volumen).connect(audio.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.36);
  }
}

function tarjeta(pedido, esNuevo) {
  const paso = SIGUIENTE[pedido.estado](pedido);
  const demorado = pedido.estado === "Nuevo" && Date.now() - new Date(pedido.creado) > MINUTOS_DEMORA * 60000;
  return `
    <article class="pedido${esNuevo ? " is-nuevo" : ""}${demorado ? " is-demorado" : ""}">
      <div class="pedido__cabeza">
        <span class="pedido__numero">${esc(pedido.numero)}</span>
        <span class="pedido__tiempo">${hora(pedido.creado)} · ${haceCuanto(pedido.creado)}</span>
      </div>
      <div class="chips">
        <span class="chip${pedido.entrega === "domicilio" ? " chip--domi" : ""}">${pedido.entrega === "domicilio" ? "Domicilio" : "Recoger"}</span>
        <span class="chip">${esc(pedido.hora)}</span>
        <span class="chip">${esc(pedido.sede)}</span>
        <span class="chip">${esc(pedido.canal)}</span>
      </div>
      <ul>${pedido.lineas.map((l) => `<li><span><b>${l.cantidad}×</b>${esc(l.producto)}</span><span>${pesos(l.subtotal)}</span></li>`).join("")}</ul>
      ${pedido.domicilio ? `<p class="dato dato--domi"><span><b>Domicilio:</b> ${esc(pedido.zona)}</span><span>${pesos(pedido.domicilio)}</span></p>` : ""}
      <div class="total"><span>${esc(pedido.pago)}</span><span>${pesos(pedido.total)}</span></div>
      <p class="dato"><b>Recibe:</b> ${esc(pedido.nombre)}</p>
      ${pedido.direccion ? `<p class="dato"><b>Dirección:</b> ${esc(pedido.direccion)}</p>` : ""}
      ${pedido.notas ? `<p class="dato"><b>Notas:</b> ${esc(pedido.notas)}</p>` : ""}
      <button class="enlace" type="button" data-ver="${esc(pedido.numero)}">Ver conversación (${pedido.conversacion?.length ?? 0})</button>
      <button class="accion ${paso.clase}" type="button" data-numero="${esc(pedido.numero)}" data-estado="${esc(paso.estado)}">${paso.texto}</button>
    </article>`;
}

function pintar(nuevos = new Set()) {
  const sede = filtro.value;
  const pedidos = datos.pedidos.filter((p) => !sede || p.sede === sede);
  const avisos = datos.avisos.filter((a) => !a.atendido && (!sede || a.sede === sede || a.sede === "Sin definir"));

  for (const [estado, columna] of Object.entries(COLUMNAS)) {
    // Los más antiguos arriba: es lo primero que hay que atender.
    const lista = pedidos.filter((p) => p.estado === estado).reverse();
    $(columna).innerHTML = lista.map((p) => tarjeta(p, nuevos.has(p.numero))).join("") || `<p class="vacio">Nada por aquí.</p>`;
    $(CONTADORES[estado]).textContent = lista.length;
  }

  const entregados = pedidos.filter((p) => p.estado === "Entregado");
  $("n-Entregado").textContent = entregados.length;
  $("col-Entregado").innerHTML =
    entregados
      .map((p) => `<div class="fila"><button class="enlace" type="button" data-ver="${esc(p.numero)}"><strong>${esc(p.numero)}</strong></button><span>${esc(p.nombre)} · ${p.lineas.map((l) => `${l.cantidad}× ${esc(l.producto)}`).join(", ")}</span><span class="fila__hora">${hora(p.creado)}</span><span>${pesos(p.total)}</span></div>`)
      .join("") || `<p class="vacio">Aún no se ha entregado ningún pedido.</p>`;

  $("c-nuevos").textContent = pedidos.filter((p) => p.estado === "Nuevo").length;
  $("c-prep").textContent = pedidos.filter((p) => p.estado === "En preparación").length;
  $("c-listos").textContent = pedidos.filter((p) => p.estado === "Listo").length;
  $("c-ventas").textContent = pesos(pedidos.reduce((suma, p) => suma + p.total, 0));

  $("avisos-seccion").hidden = avisos.length === 0;
  $("n-avisos").textContent = avisos.length;
  $("avisos").innerHTML = avisos
    .map((a) => `
      <div class="aviso">
        <strong>${esc(a.motivo)}</strong>
        <small>${hora(a.creado)} · ${esc(a.sede)} · ${esc(a.canal)} · ${esc(a.cliente)}</small>
        <button class="enlace" type="button" data-ver-aviso="${esc(a.id)}">Ver conversación (${a.conversacion?.length ?? 0})</button>
        <button class="accion accion--suave" type="button" data-aviso="${esc(a.id)}">Marcar atendido</button>
      </div>`)
    .join("");

  const pendientes = pedidos.filter((p) => p.estado === "Nuevo").length;
  document.title = `${pendientes ? `(${pendientes}) ` : ""}Don Gil · Panel de sede`;
}

async function cargar() {
  try {
    const respuesta = await fetch("/api/orders");
    if (!respuesta.ok) throw new Error(respuesta.status);
    datos = await respuesta.json();
    const numeros = new Set(datos.pedidos.map((p) => p.numero));
    const nuevos = conocidos ? new Set([...numeros].filter((n) => !conocidos.has(n))) : new Set();
    conocidos = numeros;
    if (nuevos.size) timbre();
    pintar(nuevos);
    $("vivo").classList.remove("is-caido");
    $("vivo-texto").textContent = "En vivo";
  } catch {
    $("vivo").classList.add("is-caido");
    $("vivo-texto").textContent = "Sin conexión, reintentando";
  }
}

async function enviar(cuerpo, boton) {
  boton.disabled = true;
  try {
    const respuesta = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    if (!respuesta.ok) throw new Error(respuesta.status);
  } catch {
    boton.textContent = "No se pudo guardar. Toque de nuevo";
    boton.disabled = false;
    return;
  }
  await cargar();
}

const dialogo = $("conversacion");

function verConversacion(titulo, subtitulo, conversacion = []) {
  $("conv-titulo").textContent = titulo;
  $("conv-subtitulo").textContent = subtitulo;
  $("conv-mensajes").innerHTML =
    conversacion.map((m) => `<div class="msg ${m.role === "user" ? "msg--cliente" : m.automatico ? "msg--sede" : "msg--agente"}">${m.automatico ? "<small>Aviso automático de la sede</small>" : ""}${esc(m.content)}</div>`).join("") ||
    `<p class="vacio">Este pedido no tiene conversación guardada.</p>`;
  dialogo.showModal();
  $("conv-mensajes").scrollTop = 0;
}
$("conv-cerrar").addEventListener("click", () => dialogo.close());
dialogo.addEventListener("click", (evento) => evento.target === dialogo && dialogo.close());

document.querySelector("main").addEventListener("click", (evento) => {
  const ver = evento.target.closest("button[data-ver], button[data-ver-aviso]");
  if (ver) {
    const pedido = datos.pedidos.find((p) => p.numero === ver.dataset.ver);
    const aviso = datos.avisos.find((a) => a.id === ver.dataset.verAviso);
    if (pedido) verConversacion(`Pedido ${pedido.numero}`, `${pedido.nombre} · ${pedido.sede} · ${pedido.canal}`, pedido.conversacion);
    if (aviso) verConversacion("Aviso para el equipo", `${aviso.sede} · ${aviso.canal} · ${aviso.cliente}`, aviso.conversacion);
    return;
  }
  const boton = evento.target.closest("button[data-numero], button[data-aviso]");
  if (!boton) return;
  if (boton.dataset.aviso) enviar({ aviso: boton.dataset.aviso }, boton);
  else enviar({ numero: boton.dataset.numero, estado: boton.dataset.estado }, boton);
});

botonSonido.addEventListener("click", () => {
  const encender = botonSonido.getAttribute("aria-pressed") !== "true";
  if (encender) {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    timbre();
  } else {
    audio?.suspend();
    audio = null;
  }
  botonSonido.setAttribute("aria-pressed", encender);
  botonSonido.textContent = `Sonido: ${encender ? "encendido" : "apagado"}`;
});

filtro.addEventListener("change", () => {
  recordar("don-gil-sede", filtro.value);
  pintar();
});

fetch("/api/menu")
  .then((r) => r.json())
  .then((menu) => {
    for (const sede of menu.sedes) filtro.add(new Option(sede.nombre, sede.nombre));
    filtro.value = recordar("don-gil-sede") ?? "";
    pintar();
  })
  .catch(() => {});

cargar();
setInterval(cargar, INTERVALO_MS);
setInterval(() => pintar(), 30000); // refresca los "hace X min"

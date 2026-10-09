// Chat de demostración con apariencia de WhatsApp. Habla con el mismo agente que atiende el número real.
(() => {
  const chat = document.getElementById("chat");
  const burbuja = document.getElementById("burbuja");
  const mensajes = document.getElementById("chat-mensajes");
  const formulario = document.getElementById("chat-form");
  const entrada = document.getElementById("chat-entrada");
  const sugerencias = document.getElementById("chat-sugerencias");
  const enviarBoton = formulario.querySelector("button");
  const estadoCabeza = document.getElementById("chat-estado");
  const pesos = (n) => "$" + n.toLocaleString("es-CO");
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

  const EN_LINEA = "Asistente de pedidos · en línea";
  const CONSULTA_ESTADO_MS = 4000;

  const historial = [];
  const misPedidos = new Map(); // número de pedido -> último estado que el cliente ya vio
  const misAvisos = new Set(); // avisos pasados a una persona en esta conversación
  const manualesVistos = new Map(); // pedido o aviso -> cuántos mensajes de la sede ya se mostraron
  let ocupado = false;
  mensajes.setAttribute("data-lenis-prevent", "");

  function burbujaMensaje(texto, clase) {
    const nodo = document.createElement("div");
    nodo.className = `msg ${clase}`;
    nodo.textContent = texto;
    mensajes.append(nodo);
    mensajes.scrollTop = mensajes.scrollHeight;
    return nodo;
  }

  function mostrarEscribiendo() {
    estadoCabeza.textContent = "escribiendo…";
    const nodo = burbujaMensaje("", "msg--bot escribiendo");
    nodo.innerHTML = "<i></i><i></i><i></i>";
    return () => {
      nodo.remove();
      estadoCabeza.textContent = EN_LINEA;
    };
  }

  // Una persona no contesta al instante ni manda todo en un solo bloque:
  // cada párrafo sale como un mensaje aparte, tras una pausa proporcional a su largo.
  async function escribirComoPersona(texto, yaEsperado = 0) {
    const partes = texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    for (const [i, parte] of partes.entries()) {
      const pausa = Math.min(2600, 500 + parte.length * 22) - (i === 0 ? yaEsperado : 0);
      if (pausa > 0) {
        const quitar = mostrarEscribiendo();
        await esperar(pausa);
        quitar();
      }
      burbujaMensaje(parte, "msg--bot");
    }
  }

  function tarjetaPedido(pedido) {
    const nodo = document.createElement("div");
    nodo.className = "msg msg--pedido";
    const titulo = document.createElement("strong");
    titulo.textContent = `Pedido ${pedido.corto} enviado a ${pedido.sede}`;
    const detalle = document.createElement("span");
    const productos = pedido.lineas.map((l) => `${l.cantidad} x ${l.producto}`).join(", ");
    const domicilio = pedido.domicilio ? ` · Domicilio ${pesos(pedido.domicilio)}` : "";
    detalle.textContent = `${productos}${domicilio} · Total ${pesos(pedido.total)} · ${pedido.pago}`;
    nodo.append(titulo, detalle);
    mensajes.append(nodo);
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  // En celular, los botones llevan al WhatsApp del cliente con el mensaje ya escrito: ahí le llegan
  // los avisos del pedido. En computador se usa el chat de la página.
  const esCelular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  function abrir(mensaje) {
    const numero = window.donGilWhatsApp;
    if (numero && esCelular) {
      window.registrarEvento?.("chat_abierto");
      const texto = encodeURIComponent(mensaje || "Hola, quiero hacer un pedido");
      window.location.href = `https://wa.me/${numero}?text=${texto}`;
      return;
    }
    chat.classList.add("is-abierto");
    chat.setAttribute("aria-hidden", "false");
    burbuja.classList.add("is-oculta");
    if (!mensajes.childElementCount) {
      window.registrarEvento?.("chat_abierto");
      burbujaMensaje("¡Quiubo pues! Bienvenido a Don Gil. ¿Qué se le antoja hoy?", "msg--bot");
    }
    if (mensaje && !ocupado) enviar(mensaje);
    else entrada.focus({ preventScroll: true });
  }

  function cerrar() {
    chat.classList.remove("is-abierto");
    chat.setAttribute("aria-hidden", "true");
    burbuja.classList.remove("is-oculta");
  }

  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || ocupado) return;
    ocupado = true;
    enviarBoton.disabled = true;
    sugerencias.hidden = true;
    burbujaMensaje(texto, "msg--yo");
    historial.push({ role: "user", content: texto });

    await esperar(600); // el "visto" antes de empezar a escribir
    const inicio = Date.now();
    const quitar = mostrarEscribiendo();

    try {
      const respuesta = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: historial, pedidos: [...misPedidos.keys()] }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error || "Error");
      historial.push({ role: "assistant", content: datos.respuesta });
      const primera = datos.respuesta.split(/\n\s*\n/)[0] ?? "";
      const falta = Math.min(2600, 500 + primera.length * 22) - (Date.now() - inicio);
      if (falta > 0) await esperar(falta);
      quitar();
      await escribirComoPersona(datos.respuesta, Infinity);
      if (datos.pedido) {
        tarjetaPedido(datos.pedido);
        misPedidos.set(datos.pedido.numero, datos.pedido.estado);
      }
      if (datos.aviso) misAvisos.add(datos.aviso.id);
    } catch (error) {
      quitar();
      historial.pop();
      burbujaMensaje(error.message, "msg--error");
    } finally {
      ocupado = false;
      enviarBoton.disabled = false;
      entrada.focus({ preventScroll: true });
    }
  }

  async function mostrarDeLaSede(texto) {
    historial.push({ role: "assistant", content: texto });
    await escribirComoPersona(texto);
    if (!chat.classList.contains("is-abierto")) burbuja.classList.add("is-aviso");
  }

  // Cuando la sede mueve el pedido en el panel o le escribe al cliente, el mensaje llega aquí.
  async function consultarEstados() {
    if ((!misPedidos.size && !misAvisos.size) || ocupado) return;
    try {
      const consulta = new URLSearchParams({ numeros: [...misPedidos.keys()].join(","), avisos: [...misAvisos].join(",") });
      const { pedidos, avisos } = await fetch(`/api/estado?${consulta}`).then((r) => r.json());
      for (const pedido of pedidos) {
        if (misPedidos.get(pedido.numero) !== pedido.estado && pedido.mensaje) {
          misPedidos.set(pedido.numero, pedido.estado);
          await mostrarDeLaSede(pedido.mensaje);
        }
      }
      const conManuales = [...pedidos.map((p) => [p.numero, p.manuales]), ...avisos.map((a) => [a.id, a.manuales])];
      for (const [clave, manuales] of conManuales) {
        for (const texto of manuales.slice(manualesVistos.get(clave) ?? 0)) await mostrarDeLaSede(texto);
        manualesVistos.set(clave, manuales.length);
      }
    } catch {
      // sin conexión: se reintenta en el siguiente ciclo
    }
  }
  setInterval(consultarEstados, CONSULTA_ESTADO_MS);

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const texto = entrada.value;
    entrada.value = "";
    enviar(texto);
  });
  sugerencias.addEventListener("click", (evento) => {
    if (evento.target.matches("button")) enviar(evento.target.textContent);
  });
  document.getElementById("chat-cerrar").addEventListener("click", cerrar);
  document.addEventListener("keydown", (evento) => evento.key === "Escape" && cerrar());
  document.querySelectorAll("[data-abrir-chat]").forEach((boton) => {
    boton.addEventListener("click", () => {
      burbuja.classList.remove("is-aviso");
      abrir(boton.dataset.mensaje);
    });
  });

  window.abrirChat = abrir;
})();

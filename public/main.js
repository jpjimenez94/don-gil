const pesos = (n) => "$" + n.toLocaleString("es-CO");
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hayGsap = typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined";

// Foto real si el producto la tiene; si no, la ilustración.
const arteDe = (producto, clase) =>
  producto.foto
    ? `<div class="${clase} ${clase}--foto"><img src="${producto.foto}" alt="" loading="lazy"></div>`
    : `<div class="${clase}" data-arte="${producto.arte}"></div>`;

const estado = { menu: null, sede: null, cat: "empanadas" };

/* ---------- Menú: una sola lista maestra, precios según la sede ---------- */

function pastilla(texto, seleccionada, alElegir) {
  const boton = document.createElement("button");
  boton.className = "pastilla";
  boton.type = "button";
  boton.role = "tab";
  boton.textContent = texto;
  boton.setAttribute("aria-selected", seleccionada);
  boton.addEventListener("click", alElegir);
  return boton;
}

function pintarControles() {
  const { menu, sede, cat } = estado;
  $("#sedes-tabs").replaceChildren(
    ...menu.sedes.map((s) => pastilla(s.nombre, s.id === sede.id, () => elegirSede(s.id))),
  );
  $("#cats").replaceChildren(
    ...menu.categorias.map((c) => pastilla(c.nombre, c.id === cat, () => elegirCategoria(c.id))),
  );
  $("#menu-sede").textContent = `${sede.nombre} · ${sede.direccion} · ${sede.horario}`;
}

function tarjetaPlato(producto) {
  const precio = producto.precio[estado.sede.lista];
  const tarjeta = document.createElement("article");
  tarjeta.className = "plato";
  tarjeta.innerHTML = `
    ${arteDe(producto, "plato__arte")}
    <h3></h3>
    <p></p>
    <div class="plato__pie">
      <span class="precio">${pesos(precio)}</span>
      <button class="plato__pedir" type="button" aria-label="Pedir">+</button>
    </div>`;
  $("h3", tarjeta).textContent = producto.nombre;
  $("p", tarjeta).textContent = producto.desc;
  $(".plato__pedir", tarjeta).setAttribute("aria-label", `Pedir ${producto.nombre}`);
  $(".plato__pedir", tarjeta).addEventListener("click", () => pedir(producto));
  return tarjeta;
}

function pintarGrilla(animar = true) {
  const grilla = $("#grilla");
  const productos = estado.menu.productos.filter((p) => p.cat === estado.cat);
  grilla.replaceChildren(...productos.map(tarjetaPlato));
  pintarArte(grilla);
  if (animar && hayGsap && !sinMovimiento) {
    gsap.from(grilla.children, { y: 40, opacity: 0, duration: 0.5, stagger: 0.05, ease: "power3.out", clearProps: "all" });
  }
}

function pintarAntojos() {
  const pista = $("#antojos-pista");
  pista.querySelectorAll(".antojo").forEach((n) => n.remove());
  for (const producto of estado.menu.productos.filter((p) => p.destacado)) {
    const tarjeta = document.createElement("article");
    tarjeta.className = "antojo";
    tarjeta.innerHTML = `
      ${arteDe(producto, "antojo__arte")}
      <h3></h3>
      <p></p>
      <div class="antojo__pie">
        <span class="precio">${pesos(producto.precio[estado.sede.lista])}</span>
        <button class="btn btn--dark" type="button">Pedir</button>
      </div>`;
    $("h3", tarjeta).textContent = producto.nombre;
    $("p", tarjeta).textContent = producto.desc;
    $("button", tarjeta).addEventListener("click", () => pedir(producto));
    pista.append(tarjeta);
  }
  pintarArte(pista);
}

function pintarSedes() {
  $("#sedes-lista").replaceChildren(
    ...estado.menu.sedes.map((s) => {
      const fila = document.createElement("article");
      fila.className = "sede";
      fila.innerHTML = `
        <div><h3></h3><small>${s.lista === "cc" ? "Centro comercial" : "Sede de calle"}</small></div>
        <p class="sede__dir"></p>
        <p class="sede__hora"></p>
        <button class="btn btn--dark" type="button">Pedir aquí</button>`;
      $("h3", fila).textContent = s.nombre;
      $(".sede__dir", fila).textContent = s.direccion;
      const tarifas = (s.domicilio ?? []).map((z) => z.precio);
      $(".sede__hora", fila).textContent = tarifas.length ? `${s.horario} · Domicilio desde ${pesos(Math.min(...tarifas))}` : s.horario;
      $("button", fila).addEventListener("click", () => {
        elegirSede(s.id);
        window.abrirChat?.(`Hola, quiero pedir en la sede ${s.nombre}`);
      });
      return fila;
    }),
  );
}

function elegirSede(id) {
  estado.sede = estado.menu.sedes.find((s) => s.id === id);
  pintarControles();
  pintarGrilla();
  pintarAntojos();
  if (hayGsap) ScrollTrigger.refresh();
}

function elegirCategoria(id) {
  estado.cat = id;
  pintarControles();
  pintarGrilla();
  if (hayGsap) ScrollTrigger.refresh();
}

function pedir(producto) {
  window.abrirChat?.(`Hola, quiero pedir: ${producto.nombre}. Sede ${estado.sede.nombre}`);
}

/* ---------- Animaciones: GSAP + ScrollTrigger + Lenis ---------- */

function iniciarScrollSuave() {
  if (typeof Lenis === "undefined" || sinMovimiento) return null;
  const lenis = new Lenis({ lerp: 0.09, anchors: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((tiempo) => lenis.raf(tiempo * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

function animarHero() {
  const entrada = gsap.timeline({ defaults: { ease: "power4.out" } });
  entrada
    .from(".hero__sol", { scale: 0.4, opacity: 0, duration: 1.2 })
    .from(".hero .palabra", { yPercent: 115, rotate: 6, duration: 1, stagger: 0.12 }, 0.15)
    .from(".flota", { scale: 0, rotate: -90, opacity: 0, duration: 0.9, stagger: 0.08, ease: "back.out(1.6)" }, 0.4)
    .from(".hero__sobre, .hero__lema, .hero__acciones > *", { y: 24, opacity: 0, duration: 0.7, stagger: 0.08 }, 0.7)
    .from(".hero__sello", { scale: 0, rotate: -120, duration: 0.8, ease: "back.out(1.8)" }, 0.9)
    .from(".nav > *", { y: -30, opacity: 0, duration: 0.6, stagger: 0.08, clearProps: "all" }, 0.3);

  // Parallax: cada pieza sube a su propio ritmo al bajar.
  document.querySelectorAll(".flota").forEach((pieza) => {
    gsap.to(pieza, {
      yPercent: Number(pieza.dataset.vel),
      rotate: "+=40",
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
  });
  gsap.to(".hero__texto", { yPercent: 28, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to(".hero__sol", { scale: 1.5, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

  // Las piezas se apartan un poco del cursor.
  if (matchMedia("(pointer: fine)").matches) {
    const hero = $(".hero");
    hero.addEventListener("pointermove", (e) => {
      const x = e.clientX / innerWidth - 0.5;
      const y = e.clientY / innerHeight - 0.5;
      gsap.to(".flota svg", { x: (i) => x * -(18 + i * 9), y: (i) => y * -(18 + i * 9), duration: 0.9, ease: "power3.out", overwrite: "auto" });
    });
  }
}

function animarCinta() {
  const pista = $(".cinta__pista");
  const bucle = gsap.to(pista, { xPercent: -50, duration: 22, ease: "none", repeat: -1 });
  // La cinta acelera y cambia de sentido con la velocidad del scroll.
  ScrollTrigger.create({
    onUpdate: (self) => {
      const velocidad = gsap.utils.clamp(-6, 6, self.getVelocity() / 240);
      gsap.to(bucle, { timeScale: velocidad < 0 ? Math.min(-1, velocidad) : Math.max(1, velocidad), duration: 0.3, overwrite: true });
    },
  });
}

function animarTitulos() {
  document.querySelectorAll(".titulo").forEach((titulo) => {
    const partes = titulo.querySelectorAll(".revela");
    gsap.from(partes.length ? partes : titulo, {
      yPercent: 60, opacity: 0, duration: 0.9, stagger: 0.12, ease: "power4.out",
      scrollTrigger: { trigger: titulo, start: "top 85%" },
    });
  });
  gsap.utils.toArray(".etiqueta, .bajada").forEach((nodo) => {
    gsap.from(nodo, { y: 20, opacity: 0, duration: 0.6, scrollTrigger: { trigger: nodo, start: "top 90%" } });
  });
}

function animarAntojos() {
  // En escritorio la sección se fija y las tarjetas pasan de lado con el scroll.
  ScrollTrigger.matchMedia({
    "(min-width: 821px)": () => {
      const pista = $("#antojos-pista");
      const recorrido = () => Math.max(0, pista.scrollWidth - innerWidth);
      const tween = gsap.to(pista, {
        x: () => -recorrido(),
        ease: "none",
        scrollTrigger: { trigger: ".antojos", start: "top top", end: () => "+=" + recorrido(), pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 },
      });
      gsap.utils.toArray(".antojo__arte svg, .antojo__arte img").forEach((arte) => {
        gsap.fromTo(arte, { rotate: -14, scale: 0.85 }, {
          rotate: 10, scale: 1.05, ease: "none",
          scrollTrigger: { trigger: arte, containerAnimation: tween, start: "left right", end: "right left", scrub: true },
        });
      });
    },
  });
}

function animarHistoria() {
  const parrafo = $("#historia-texto");
  parrafo.innerHTML = parrafo.textContent.trim().split(/\s+/).map((palabra) => `<span class="p">${palabra}</span>`).join(" ");
  gsap.to(parrafo.querySelectorAll(".p"), {
    opacity: 1, stagger: 0.1, ease: "none",
    scrollTrigger: { trigger: parrafo, start: "top 78%", end: "bottom 45%", scrub: true },
  });

  document.querySelectorAll("[data-cuenta]").forEach((nodo) => {
    const contador = { valor: 0 };
    gsap.to(contador, {
      valor: Number(nodo.dataset.cuenta), duration: 1.6, ease: "power2.out",
      onUpdate: () => (nodo.textContent = Math.round(contador.valor)),
      scrollTrigger: { trigger: nodo, start: "top 88%", once: true },
    });
  });

  gsap.from(".apoyo", { y: 60, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: ".apoyo", start: "top 88%" } });
}

function animarSedesYKilo() {
  gsap.from(".sede", { y: 40, opacity: 0, duration: 0.7, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: "#sedes-lista", start: "top 82%" } });
  gsap.fromTo(".kilo__arte", { yPercent: 18, rotate: -8 }, { yPercent: -12, rotate: 6, ease: "none", scrollTrigger: { trigger: ".kilo", start: "top bottom", end: "bottom top", scrub: true } });
  gsap.fromTo(".menu", { borderRadius: "5rem 5rem 0 0" }, { borderRadius: "0rem 0rem 0 0", ease: "none", scrollTrigger: { trigger: ".menu", start: "top 90%", end: "top 10%", scrub: true } });
}

function animarNav() {
  const nav = $("#nav");
  ScrollTrigger.create({
    start: 80,
    onUpdate: (self) => {
      nav.classList.toggle("is-solida", self.scroll() > 80);
      nav.classList.toggle("is-oculta", self.direction === 1 && self.scroll() > 600);
    },
  });
}

function botonesMagneticos() {
  if (!matchMedia("(pointer: fine)").matches) return;
  document.querySelectorAll(".btn--grande").forEach((boton) => {
    boton.addEventListener("pointermove", (e) => {
      const caja = boton.getBoundingClientRect();
      gsap.to(boton, { x: (e.clientX - caja.left - caja.width / 2) * 0.25, y: (e.clientY - caja.top - caja.height / 2) * 0.35, duration: 0.4, ease: "power3.out" });
    });
    boton.addEventListener("pointerleave", () => gsap.to(boton, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" }));
  });
}

/* ---------- Arranque ---------- */

async function iniciar() {
  estado.menu = await fetch("/api/menu").then((r) => r.json());
  estado.sede = estado.menu.sedes[0];
  window.donGilWhatsApp = estado.menu.marca.whatsapp_pedidos;
  pintarControles();
  pintarGrilla(false);
  pintarAntojos();
  pintarSedes();

  if (!hayGsap || sinMovimiento) return;
  gsap.registerPlugin(ScrollTrigger);
  window.lenis = iniciarScrollSuave();
  animarHero();
  animarCinta();
  animarTitulos();
  animarAntojos();
  animarHistoria();
  animarSedesYKilo();
  animarNav();
  botonesMagneticos();
  gsap.from("#grilla .plato", { y: 50, opacity: 0, duration: 0.6, stagger: 0.06, ease: "power3.out", clearProps: "all", scrollTrigger: { trigger: "#grilla", start: "top 85%" } });
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

iniciar().catch((error) => console.error("No se pudo cargar el menú:", error));

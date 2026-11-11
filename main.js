/* =========================================================
   FOCO DE ESPERANZA
   Cartel interactivo · 21 de diciembre · Fundación ITACA

   Índice
   1. Configuración
   2. Referencias al DOM
   3. Estado del foco
   4. Cálculos (funciones puras)
   5. Pintado: foco y parallax
   6. Interacción · mousemove
   7. Interacción · mouseenter y mouseleave
   8. Escalado del cartel
   9. Inicio
   ========================================================= */

"use strict";

/* ---------- 1. Configuración ---------- */

const CARTEL = {
  ancho: 848,
  alto: 1200,
  margenVentana: 32, // aire mínimo entre el cartel y el borde de la ventana
};

const FOCO = {
  reposo: { x: 424, y: 670 }, // centro del regalo: ahí descansa la luz
  radioBase: 300,
  radioEncendido: 520,        // al encender el regalo, la luz llega más lejos
  suavizado: 0.14,            // 0 = no se mueve, 1 = sigue al cursor sin inercia
};

const BRILLO = {
  apagado: "drop-shadow(0 0 0 rgba(255, 87, 34, 0))",
  encendido: "drop-shadow(0 0 42px rgba(255, 87, 34, 0.95))",
};

const TEXTO_PISTA = {
  reposo: "Mueve el cursor · tú llevas la luz",
  encendido: "Tu donación enciende su Navidad",
};

/* ---------- 2. Referencias al DOM ---------- */

const escenario = document.getElementById("escenario");
const cartel = document.getElementById("cartel");
const regalo = document.getElementById("regalo");
const botonDonar = document.getElementById("boton-donar");
const pista = document.getElementById("pista");
const lecturaFoco = document.getElementById("lectura-foco");
const capasParallax = Array.from(document.querySelectorAll("[data-profundidad]"));

// Si el usuario pide menos movimiento en su sistema, el parallax se desactiva
const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const intensidadParallax = reducirMovimiento ? 0 : 1;

/* ---------- 3. Estado del foco ---------- */

// "objetivo" es donde está el cursor; "actual" es donde se pinta la luz.
// En cada fotograma, "actual" se acerca un poco a "objetivo": eso da la inercia.
const foco = {
  actual: { x: FOCO.reposo.x, y: FOCO.reposo.y, radio: FOCO.radioBase },
  objetivo: { x: FOCO.reposo.x, y: FOCO.reposo.y, radio: FOCO.radioBase },
};

let fotogramaPendiente = null;

/* ---------- 4. Cálculos (funciones puras) ---------- */

// Valor intermedio entre "inicio" y "fin". factor 0 → inicio, factor 1 → fin.
function interpolar(inicio, fin, factor) {
  return inicio + (fin - inicio) * factor;
}

// Convierte las coordenadas del ratón (píxeles de la ventana) en coordenadas
// del cartel (0–848, 0–1200), aunque el cartel esté escalado en pantalla.
function obtenerPosicionEnCartel(evento) {
  const marco = cartel.getBoundingClientRect();

  return {
    x: ((evento.clientX - marco.left) / marco.width) * CARTEL.ancho,
    y: ((evento.clientY - marco.top) / marco.height) * CARTEL.alto,
  };
}

// Calcula cuántos píxeles se desplaza una capa según la posición del foco.
//   1. Se mide cuánto se aleja el foco de su punto de reposo, tomando medio
//      cartel como unidad (aprox. de -1 a 1). En reposo el desvío es 0, así
//      que la composición original queda intacta.
//   2. Se multiplica por la profundidad de la capa (su desplazamiento en px).
//   3. Se invierte el signo: la capa va en dirección contraria al ratón.
// Una profundidad negativa hace que la capa acompañe al ratón.
function calcularDesplazamientoParallax(posicion, profundidad) {
  const desvioX = (posicion.x - FOCO.reposo.x) / (CARTEL.ancho / 2);
  const desvioY = (posicion.y - FOCO.reposo.y) / (CARTEL.alto / 2);

  return {
    x: -desvioX * profundidad * intensidadParallax,
    y: -desvioY * profundidad * intensidadParallax,
  };
}

// Escala máxima con la que el cartel cabe entero en la ventana (nunca más de 1).
function calcularEscala(anchoVentana, altoVentana) {
  const escala = Math.min(
    (anchoVentana - CARTEL.margenVentana) / CARTEL.ancho,
    (altoVentana - CARTEL.margenVentana) / CARTEL.alto,
    1
  );

  return Math.max(escala, 0.1);
}

/* ---------- 5. Pintado: foco y parallax ---------- */

// Mueve el resplandor y la máscara de la capa revelada (variables CSS)
function pintarFoco() {
  const { x, y, radio } = foco.actual;

  cartel.style.setProperty("--foco-x", `${x.toFixed(1)}px`);
  cartel.style.setProperty("--foco-y", `${y.toFixed(1)}px`);
  cartel.style.setProperty("--foco-radio", `${radio.toFixed(1)}px`);

  const lecturaX = String(Math.round(x)).padStart(4, "0");
  const lecturaY = String(Math.round(y)).padStart(4, "0");
  lecturaFoco.textContent = `X ${lecturaX} · Y ${lecturaY}`;
}

// Desplaza cada capa tipográfica según su data-profundidad
function pintarParallax() {
  capasParallax.forEach((capa) => {
    const profundidad = Number(capa.dataset.profundidad);
    const desplazamiento = calcularDesplazamientoParallax(foco.actual, profundidad);

    capa.style.transform =
      `translate3d(${desplazamiento.x.toFixed(2)}px, ${desplazamiento.y.toFixed(2)}px, 0)`;
  });
}

// Bucle de animación: acerca el foco a su objetivo y se detiene al llegar
function animarFoco() {
  const { actual, objetivo } = foco;

  actual.x = interpolar(actual.x, objetivo.x, FOCO.suavizado);
  actual.y = interpolar(actual.y, objetivo.y, FOCO.suavizado);
  actual.radio = interpolar(actual.radio, objetivo.radio, FOCO.suavizado);

  pintarFoco();
  pintarParallax();

  const haLlegado =
    Math.abs(objetivo.x - actual.x) < 0.1 &&
    Math.abs(objetivo.y - actual.y) < 0.1 &&
    Math.abs(objetivo.radio - actual.radio) < 0.1;

  fotogramaPendiente = haLlegado ? null : requestAnimationFrame(animarFoco);
}

// Arranca el bucle solo si no está ya en marcha
function solicitarAnimacion() {
  if (fotogramaPendiente === null) {
    fotogramaPendiente = requestAnimationFrame(animarFoco);
  }
}

/* ---------- 6. Interacción · mousemove ---------- */

// El foco persigue al cursor; el parallax se deriva de la posición del foco
function seguirCursor(evento) {
  const posicion = obtenerPosicionEnCartel(evento);

  foco.objetivo.x = posicion.x;
  foco.objetivo.y = posicion.y;
  solicitarAnimacion();
}

// Cuando el cursor abandona el cartel, la luz vuelve al regalo
function devolverFocoAlReposo() {
  foco.objetivo.x = FOCO.reposo.x;
  foco.objetivo.y = FOCO.reposo.y;
  solicitarAnimacion();
}

/* ---------- 7. Interacción · mouseenter y mouseleave ---------- */

// Modifica dos propiedades visuales desde JS: transform (escala) y filter (brillo)
function encenderElemento(elemento) {
  elemento.style.transform = `scale(${elemento.dataset.escala})`;
  elemento.style.filter = BRILLO.encendido;
  elemento.classList.add("esta-encendido");
}

// Devuelve el elemento a su tamaño y brillo originales
function apagarElemento(elemento) {
  elemento.style.transform = "scale(1)";
  elemento.style.filter = BRILLO.apagado;
  elemento.classList.remove("esta-encendido");
}

// mouseenter sobre el regalo: se enciende, se abre y la luz del cartel se expande
function encenderRegalo() {
  encenderElemento(regalo);
  cartel.classList.add("cartel--iluminado");
  pista.textContent = TEXTO_PISTA.encendido;

  foco.objetivo.radio = FOCO.radioEncendido;
  solicitarAnimacion();
}

// mouseleave del regalo: todo vuelve suavemente al estado inicial
function apagarRegalo() {
  apagarElemento(regalo);
  cartel.classList.remove("cartel--iluminado");
  pista.textContent = TEXTO_PISTA.reposo;

  foco.objetivo.radio = FOCO.radioBase;
  solicitarAnimacion();
}

/* ---------- 8. Escalado del cartel ---------- */

// El cartel siempre mide 848 × 1200. Si la ventana es más pequeña se reduce
// entero con scale(), sin recolocar ni deformar nada.
function ajustarEscala() {
  const escala = calcularEscala(window.innerWidth, window.innerHeight);

  escenario.style.width = `${CARTEL.ancho * escala}px`;
  escenario.style.height = `${CARTEL.alto * escala}px`;
  cartel.style.transform = `scale(${escala})`;
}

/* ---------- 9. Inicio ---------- */

function iniciarCartel() {
  // Interacción 3 · mousemove (y vuelta al reposo al salir del cartel)
  cartel.addEventListener("mousemove", seguirCursor);
  cartel.addEventListener("mouseleave", devolverFocoAlReposo);

  // Interacciones 1 y 2 · mouseenter / mouseleave sobre el regalo
  regalo.addEventListener("mouseenter", encenderRegalo);
  regalo.addEventListener("mouseleave", apagarRegalo);

  // Las mismas funciones sirven para el botón de donar
  botonDonar.addEventListener("mouseenter", () => encenderElemento(botonDonar));
  botonDonar.addEventListener("mouseleave", () => apagarElemento(botonDonar));

  window.addEventListener("resize", ajustarEscala);

  ajustarEscala();
  pintarFoco();
  pintarParallax();
}

iniciarCartel();

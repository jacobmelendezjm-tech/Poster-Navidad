/* =========================================================
   ILUMINA SU NAVIDAD
   Cartel interactivo · 21 de diciembre · Fundación ITACA

   Índice
   1. Configuración
   2. Referencias al DOM
   3. Estado
   4. Cálculos (funciones puras)
   5. Preparación de la tipografía
   6. Pintado y bucle de animación
   7. Interacción · mousemove
   8. Interacción · mouseenter y mouseleave
   9. Escalado del cartel
   10. Inicio
   ========================================================= */

"use strict";

/* ---------- 1. Configuración ---------- */

const CARTEL = {
  ancho: 848,
  alto: 1200,
  margenVentana: 32, // aire mínimo entre el cartel y el borde de la ventana
};

// Tipografía cinética: cerca del cursor las letras pierden peso y se iluminan
const TIPO = {
  pesoMax: 900,     // peso de las letras en reposo (Anybody Black)
  pesoMin: 140,     // peso de una letra justo debajo del cursor
  anchura: 72,      // eje "wdth" fijo de la fuente variable (condensada: letras más altas)
  radio: 240,       // distancia (px del cartel) a la que llega la influencia del cursor
  suavizado: 0.16,  // 0 = no se mueve, 1 = reacciona sin inercia
};

const COLOR = {
  tinta: [17, 17, 17],
  crema: [255, 241, 230],
};

const ESTRELLA = {
  puntas: 14,
  radioExterior: 150,
  radioInterior: 122,
  reposo: { transform: "scale(1) rotate(0deg)", relleno: "#ffb3d1" },
  encendida: { transform: "scale(1.14) rotate(-12deg)", relleno: "#fff1e6" },
};

const REPOSO_LUZ = { x: 424, y: 600 };

/* ---------- 2. Referencias al DOM ---------- */

const escenario = document.getElementById("escenario");
const cartel = document.getElementById("cartel");
const tipografia = document.getElementById("tipografia");
const estrella = document.getElementById("estrella");
const poligonoEstrella = document.getElementById("estrella-poligono");
const lectura = document.getElementById("lectura");
const filas = Array.from(document.querySelectorAll(".fila"));

/* ---------- 3. Estado ---------- */

// Cada letra guarda su centro (en coordenadas del cartel) y su influencia actual
let letras = [];

const raton = {
  x: REPOSO_LUZ.x,
  y: REPOSO_LUZ.y,
  dentro: false,
};

// La luz persigue al ratón con inercia: "actual" se acerca a "objetivo" en cada fotograma
const luz = {
  actual: { x: REPOSO_LUZ.x, y: REPOSO_LUZ.y, opacidad: 0 },
  objetivo: { x: REPOSO_LUZ.x, y: REPOSO_LUZ.y, opacidad: 0 },
};

let fotogramaPendiente = null;

/* ---------- 4. Cálculos (funciones puras) ---------- */

// Valor intermedio entre "inicio" y "fin". factor 0 → inicio, factor 1 → fin.
function interpolar(inicio, fin, factor) {
  return inicio + (fin - inicio) * factor;
}

// Mezcla dos colores [r, g, b] y devuelve una cadena rgb()
function mezclarColor(desde, hacia, factor) {
  const [r, g, b] = desde.map((canal, i) => Math.round(interpolar(canal, hacia[i], factor)));
  return `rgb(${r}, ${g}, ${b})`;
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

// Influencia del cursor sobre una letra según la distancia que los separa:
// 1 justo debajo del cursor, 0 a partir de TIPO.radio. La curva "smoothstep"
// hace que el cambio empiece y termine suave, sin bordes bruscos.
function calcularInfluencia(distancia) {
  const t = Math.min(Math.max(1 - distancia / TIPO.radio, 0), 1);
  return t * t * (3 - 2 * t);
}

// Puntos de una estrella de N puntas alternando radio exterior e interior
function crearPuntosEstrella(puntas, radioExterior, radioInterior) {
  const puntos = [];

  for (let i = 0; i < puntas * 2; i++) {
    const radio = i % 2 === 0 ? radioExterior : radioInterior;
    const angulo = (Math.PI * i) / puntas - Math.PI / 2;
    puntos.push(`${(Math.cos(angulo) * radio).toFixed(1)},${(Math.sin(angulo) * radio).toFixed(1)}`);
  }

  return puntos.join(" ");
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

/* ---------- 5. Preparación de la tipografía ---------- */

// Sustituye el texto de una fila por una <span> por letra.
// El texto completo se conserva en aria-label para los lectores de pantalla.
function partirEnLetras(fila) {
  const texto = fila.textContent.trim();
  fila.setAttribute("aria-label", texto);
  fila.textContent = "";

  Array.from(texto).forEach((caracter) => {
    const letra = document.createElement("span");
    letra.className = caracter === " " ? "letra letra--espacio" : "letra";
    letra.textContent = caracter === " " ? "" : caracter;
    letra.setAttribute("aria-hidden", "true");
    fila.appendChild(letra);
  });
}

// Calcula el tamaño de letra con el que la fila ocupa exactamente su ancho.
// Se mide a 100px y se aplica una regla de tres.
function ajustarFilaAlAncho(fila) {
  const anchoObjetivo = Number(fila.dataset.ancho);
  fila.style.setProperty("--ancho", anchoObjetivo);
  fila.style.fontSize = "100px";

  const anchoMedido = Array.from(fila.children)
    .reduce((total, letra) => total + letra.offsetWidth, 0);

  fila.style.fontSize = `${((100 * anchoObjetivo) / anchoMedido).toFixed(2)}px`;
}

// Centro de un elemento en coordenadas del cartel (sin contar el escalado)
function obtenerCentroEnCartel(elemento) {
  let x = elemento.offsetWidth / 2;
  let y = elemento.offsetHeight / 2;

  for (let nodo = elemento; nodo && nodo !== cartel; nodo = nodo.offsetParent) {
    x += nodo.offsetLeft;
    y += nodo.offsetTop;
  }

  return { x, y };
}

function prepararTipografia() {
  filas.forEach(partirEnLetras);
  filas.forEach(ajustarFilaAlAncho);

  letras = Array.from(tipografia.querySelectorAll(".letra:not(.letra--espacio)")).map((elemento) => ({
    elemento,
    centro: obtenerCentroEnCartel(elemento),
    clara: elemento.closest(".fila--clara") !== null,
    influencia: 0,
  }));

  tipografia.classList.add("esta-lista");
}

/* ---------- 6. Pintado y bucle de animación ---------- */

// Una letra iluminada pierde peso y cambia de color:
// las negras se vuelven crema y las crema ("Dona hoy.") se vuelven negras.
function pintarLetra(letra) {
  const peso = interpolar(TIPO.pesoMax, TIPO.pesoMin, letra.influencia);
  const desde = letra.clara ? COLOR.crema : COLOR.tinta;
  const hacia = letra.clara ? COLOR.tinta : COLOR.crema;

  letra.elemento.style.fontVariationSettings = `"wght" ${peso.toFixed(0)}, "wdth" ${TIPO.anchura}`;
  letra.elemento.style.color = mezclarColor(desde, hacia, letra.influencia);
}

function pintarLuz() {
  const { x, y, opacidad } = luz.actual;

  cartel.style.setProperty("--luz-x", `${x.toFixed(1)}px`);
  cartel.style.setProperty("--luz-y", `${y.toFixed(1)}px`);
  cartel.style.setProperty("--luz-opacidad", opacidad.toFixed(3));

  const lecturaX = String(Math.round(x)).padStart(4, "0");
  const lecturaY = String(Math.round(y)).padStart(4, "0");
  lectura.textContent = `X ${lecturaX} · Y ${lecturaY}`;
}

// Bucle de animación: acerca cada valor a su objetivo y se detiene cuando todo ha llegado
function animar() {
  let cambioMaximo = 0;

  letras.forEach((letra) => {
    const distancia = Math.hypot(letra.centro.x - raton.x, letra.centro.y - raton.y);
    const objetivo = raton.dentro ? calcularInfluencia(distancia) : 0;
    const siguiente = interpolar(letra.influencia, objetivo, TIPO.suavizado);

    cambioMaximo = Math.max(cambioMaximo, Math.abs(siguiente - letra.influencia));
    if (Math.abs(siguiente - letra.influencia) > 0.0005) {
      letra.influencia = Math.abs(objetivo - siguiente) < 0.001 ? objetivo : siguiente;
      pintarLetra(letra);
    }
  });

  ["x", "y", "opacidad"].forEach((clave) => {
    const siguiente = interpolar(luz.actual[clave], luz.objetivo[clave], TIPO.suavizado);
    const escalaCambio = clave === "opacidad" ? 1 : 0.01; // píxeles frente a opacidad
    cambioMaximo = Math.max(cambioMaximo, Math.abs(siguiente - luz.actual[clave]) * escalaCambio);
    luz.actual[clave] = siguiente;
  });
  pintarLuz();

  fotogramaPendiente = cambioMaximo > 0.0005 ? requestAnimationFrame(animar) : null;
}

// Arranca el bucle solo si no está ya en marcha
function solicitarAnimacion() {
  if (fotogramaPendiente === null) {
    fotogramaPendiente = requestAnimationFrame(animar);
  }
}

/* ---------- 7. Interacción · mousemove ---------- */

// Guarda la posición del cursor; el bucle de animación hace el resto
function seguirCursor(evento) {
  const posicion = obtenerPosicionEnCartel(evento);

  raton.x = posicion.x;
  raton.y = posicion.y;
  raton.dentro = true;

  luz.objetivo.x = posicion.x;
  luz.objetivo.y = posicion.y;
  luz.objetivo.opacidad = 1;
  solicitarAnimacion();
}

// Cuando el cursor abandona el cartel, las letras recuperan su peso y la luz se apaga
function soltarCursor() {
  raton.dentro = false;
  luz.objetivo.opacidad = 0;
  solicitarAnimacion();
}

/* ---------- 8. Interacción · mouseenter y mouseleave ---------- */

// Aplica un estado visual a la estrella. Modifica dos propiedades desde JS:
// transform (escala y giro) y fill (color del polígono).
function aplicarEstadoEstrella(estado) {
  estrella.style.transform = estado.transform;
  poligonoEstrella.style.fill = estado.relleno;
}

// mouseenter: la estrella crece, gira y se vuelve crema
function encenderEstrella() {
  aplicarEstadoEstrella(ESTRELLA.encendida);
  estrella.classList.add("esta-encendida");
}

// mouseleave: vuelve suavemente a su tamaño, giro y color originales
function apagarEstrella() {
  aplicarEstadoEstrella(ESTRELLA.reposo);
  estrella.classList.remove("esta-encendida");
}

/* ---------- 9. Escalado del cartel ---------- */

// El cartel siempre mide 848 × 1200. Si la ventana es más pequeña se reduce
// entero con scale(), sin recolocar ni deformar nada.
function ajustarEscala() {
  const escala = calcularEscala(window.innerWidth, window.innerHeight);

  escenario.style.width = `${CARTEL.ancho * escala}px`;
  escenario.style.height = `${CARTEL.alto * escala}px`;
  cartel.style.transform = `scale(${escala})`;
}

/* ---------- 10. Inicio ---------- */

function iniciarCartel() {
  poligonoEstrella.setAttribute(
    "points",
    crearPuntosEstrella(ESTRELLA.puntas, ESTRELLA.radioExterior, ESTRELLA.radioInterior)
  );

  // Interacción 3 · mousemove (y vuelta al reposo al salir del cartel)
  cartel.addEventListener("mousemove", seguirCursor);
  cartel.addEventListener("mouseleave", soltarCursor);

  // Interacciones 1 y 2 · mouseenter / mouseleave sobre la estrella
  estrella.addEventListener("mouseenter", encenderEstrella);
  estrella.addEventListener("mouseleave", apagarEstrella);

  window.addEventListener("resize", ajustarEscala);
  ajustarEscala();
  pintarLuz();

  // Las filas se miden con la fuente definitiva, así que se espera a que cargue.
  // Si la fuente falla, se mide igualmente con la de reserva.
  document.fonts.load('900 100px "Anybody"')
    .catch(() => null)
    .then(() => document.fonts.ready)
    .then(prepararTipografia);
}

iniciarCartel();

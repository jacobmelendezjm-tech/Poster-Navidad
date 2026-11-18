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
  crema: [255, 241, 230],   // letras del lado feliz
  apagado: [74, 79, 92],    // letras del lado oscuro, sin luz
  dorado: [255, 209, 102],  // cualquier letra bajo el cursor
};

const MITAD = 424;

// Relieve 3D del lema: color de la extrusión de cada lado
const SOMBRA = {
  feliz: [94, 10, 22],
  oscura: [5, 6, 8],
};

// Paralaje 3D: el punto de vista de los regalos que caen sigue al cursor.
// Solo cambia la perspectiva de esas capas decorativas: el cartel no se mueve,
// así el cursor siempre coincide con lo que se ve.
const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // x donde termina la Navidad feliz y empieza la oscura

const ESTRELLA = {
  puntas: 14,
  radioExterior: 150,
  radioInterior: 122,
  reposo: { transform: "scale(1) rotate(0deg)", relleno: "#ffd166" },
  encendida: { transform: "scale(1.14) rotate(-12deg)", relleno: "#fff1e6" },
};

const REPOSO_LUZ = { x: 424, y: 600 };

// Círculo de luz que enciende el lado oscuro de la escena
const LUZ_ESCENA = {
  radio: 190,        // radio con el cursor encima
  radioDonando: 1400, // radio con el cursor sobre la estrella: se enciende todo el lado
  suavizadoDonando: 0.02, // al donar la luz se abre despacio, como un amanecer
};

/* ---------- 2. Referencias al DOM ---------- */

const escenario = document.getElementById("escenario");
const cartel = document.getElementById("cartel");
const tipografia = document.getElementById("tipografia");
const estrella = document.getElementById("estrella");
const poligonoEstrella = document.getElementById("estrella-poligono");
const lectura = document.getElementById("lectura");
const capaLuz = document.getElementById("escena-luz");
const halo = document.querySelector(".luz");
const capasLluvia = Array.from(document.querySelectorAll(".lluvia"));
const cantoEstrella = document.getElementById("estrella-canto");
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
  actual: { x: REPOSO_LUZ.x, y: REPOSO_LUZ.y, opacidad: 0, radio: 0 },
  objetivo: { x: REPOSO_LUZ.x, y: REPOSO_LUZ.y, opacidad: 0, radio: 0 },
};

// true mientras el cursor está sobre la estrella de donar
let estrellaEncendida = false;

// 0 = lado oscuro apagado, 1 = encendido entero (cursor sobre la estrella)
let encendidoTotal = 0;

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
    influencia: 0,
  }));
  letras.forEach((letra) => {
    letra.oscura = letra.centro.x > MITAD;
    pintarLetra(letra);
  });

  tipografia.classList.add("esta-lista");
}

/* ---------- 6. Pintado y bucle de animación ---------- */

// Una letra iluminada pierde peso y se vuelve dorada.
// Las del lado oscuro parten apagadas: el cursor las enciende.
function pintarLetra(letra) {
  const peso = interpolar(TIPO.pesoMax, TIPO.pesoMin, letra.influencia);
  const desde = letra.oscura
    ? COLOR.apagado.map((canal, i) => interpolar(canal, COLOR.crema[i], encendidoTotal))
    : COLOR.crema;
  const hacia = COLOR.dorado;

  letra.elemento.style.fontVariationSettings = `"wght" ${peso.toFixed(0)}, "wdth" ${TIPO.anchura}`;
  letra.elemento.style.color = mezclarColor(desde, hacia, letra.influencia);

  const sombra = letra.oscura
    ? mezclarColor(SOMBRA.oscura, SOMBRA.feliz, encendidoTotal)
    : mezclarColor(SOMBRA.feliz, SOMBRA.feliz, 0);
  letra.elemento.style.setProperty("--sombra", sombra);
}

function pintarLuz() {
  const { x, y, opacidad } = luz.actual;

  // Halo: se mueve con transform y opacity (no se heredan, no recalculan la escena)
  halo.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  halo.style.opacity = opacidad.toFixed(3);

  // Máscara de la capa iluminada (empieza en x = 424, la mitad del cartel)
  // Se escribe la máscara entera, sin variables CSS: las variables se heredan y
  // obligarían a recalcular los estilos de cientos de elementos de la escena
  const mascara = `radial-gradient(circle ${Math.max(luz.actual.radio, 0.01).toFixed(1)}px at `
    + `${(x - MITAD).toFixed(1)}px ${y.toFixed(1)}px, #000 55%, transparent 100%)`;
  capaLuz.style.webkitMaskImage = mascara;
  capaLuz.style.maskImage = mascara;

  // Paralaje 3D: los cubos se ven desde donde está el cursor
  if (!movimientoReducido) {
    capasLluvia.forEach((capa) => {
      const origenX = x - capa.offsetLeft;
      capa.style.perspectiveOrigin = `${origenX.toFixed(0)}px ${y.toFixed(0)}px`;
    });
  }

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

  ["x", "y", "opacidad", "radio"].forEach((clave) => {
    // El radio grande (donar) se abre y se cierra más despacio que el resto
    const lento = clave === "radio"
      && Math.max(luz.actual.radio, luz.objetivo.radio) > LUZ_ESCENA.radio + 1;
    const factor = lento ? LUZ_ESCENA.suavizadoDonando : TIPO.suavizado;
    const siguiente = interpolar(luz.actual[clave], luz.objetivo[clave], factor);
    const escalaCambio = clave === "opacidad" ? 1 : 0.01; // píxeles frente a opacidad
    cambioMaximo = Math.max(cambioMaximo, Math.abs(siguiente - luz.actual[clave]) * escalaCambio);
    luz.actual[clave] = siguiente;
  });
  pintarLuz();

  // Cuanto más se abre la luz hacia todo el lado, más se encienden sus letras
  const siguienteEncendido = Math.min(Math.max(
    (luz.actual.radio - LUZ_ESCENA.radio) / (LUZ_ESCENA.radioDonando - LUZ_ESCENA.radio), 0), 1);
  if (Math.abs(siguienteEncendido - encendidoTotal) > 0.001) {
    encendidoTotal = siguienteEncendido;
    letras.filter((letra) => letra.oscura).forEach(pintarLetra);
  }

  fotogramaPendiente = cambioMaximo > 0.0005 ? requestAnimationFrame(animar) : null;
}

// Arranca el bucle solo si no está ya en marcha
function solicitarAnimacion() {
  if (fotogramaPendiente === null) {
    fotogramaPendiente = requestAnimationFrame(animar);
  }
}

/* ---------- 7. Interacción · mousemove ---------- */

// Radio que debe tener la luz de la escena según dónde esté el cursor
function calcularRadioLuz() {
  if (estrellaEncendida) return LUZ_ESCENA.radioDonando;
  return raton.dentro ? LUZ_ESCENA.radio : 0;
}

// Guarda la posición del cursor; el bucle de animación hace el resto
function seguirCursor(evento) {
  const posicion = obtenerPosicionEnCartel(evento);

  raton.x = posicion.x;
  raton.y = posicion.y;
  raton.dentro = true;

  luz.objetivo.x = posicion.x;
  luz.objetivo.y = posicion.y;
  luz.objetivo.opacidad = 1;
  luz.objetivo.radio = calcularRadioLuz();
  solicitarAnimacion();

  comprobarNinos(posicion.x, posicion.y);
}

// Cuando el cursor abandona el cartel, las letras recuperan su peso y la luz se apaga
function soltarCursor() {
  raton.dentro = false;
  luz.objetivo.opacidad = 0;
  luz.objetivo.radio = calcularRadioLuz();
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

  // Donar enciende toda su Navidad: la luz se abre por todo el lado oscuro
  estrellaEncendida = true;
  cartel.classList.add("esta-donando");
  descongelarLadoOscuro();
  // Los niños felices cargan el árbol y los regalos y corren a llevar la Navidad;
  // al llegar, los niños tristes se levantan uno detrás de otro
  enviarCaravana();
  luz.objetivo.radio = calcularRadioLuz();
  solicitarAnimacion();
}

// mouseleave: vuelve suavemente a su tamaño, giro y color originales
function apagarEstrella() {
  aplicarEstadoEstrella(ESTRELLA.reposo);
  estrella.classList.remove("esta-encendida");

  estrellaEncendida = false;
  cartel.classList.remove("esta-donando");
  // Sin tu donación todo se congela: los regalos se quedan helados donde
  // estén y los niños se sientan y lloran
  congelarLadoOscuro();
  volverCaravana(); // vuelven corriendo a casa con el árbol
  luz.objetivo.radio = calcularRadioLuz();
  solicitarAnimacion();
}

/* ---------- 8b. Niños que saltan ---------- */

// Cada niño feliz sabe dónde está (data-x / data-y, en coordenadas del cartel).
const SALTO = {
  duracion: 1100, // ms, igual que la animación "saltar" del CSS
  anchoMedio: 34, // zona sensible alrededor de cada niño (se multiplica por su escala)
  altoMedio: 88,
};

const ninos = Array.from(document.querySelectorAll(".nino")).map((elemento) => ({
  elemento,
  x: Number(elemento.dataset.x),
  y: Number(elemento.dataset.y),
  escala: Number(elemento.dataset.escala),
  saltando: false,
}));

function estaEncima(nino, x, y) {
  return Math.abs(x - nino.x) < SALTO.anchoMedio * nino.escala
    && Math.abs(y - nino.y) < SALTO.altoMedio * nino.escala;
}

function hacerSaltar(nino) {
  if (nino.saltando) return;
  nino.saltando = true;
  nino.elemento.classList.add("saltando");
  setTimeout(() => {
    nino.elemento.classList.remove("saltando");
    nino.saltando = false;
  }, SALTO.duracion);
}

/* Niños tristes del lado oscuro: al pasar el cursor se levantan felices.
   Se quedan así un rato después de que el cursor se vaya y luego se vuelven
   a sentar (salvo mientras el cursor está en la estrella de donar). */
const ALEGRIA = {
  dura: 2600,     // ms que siguen felices después de que el cursor se vaya
  anchoMedio: 36,
  altoMedio: 72,
};

const ninosTristes = Array.from(document.querySelectorAll(".cambia")).map((elemento) => ({
  elemento,
  x: Number(elemento.dataset.x),
  y: Number(elemento.dataset.y),
  escala: Number(elemento.dataset.escala),
  temporizador: null,
}));

function alegrar(nino) {
  clearTimeout(nino.temporizador);
  nino.elemento.classList.remove("muy-triste");
  nino.elemento.classList.add("feliz");
  nino.temporizador = setTimeout(() => entristecer(nino), ALEGRIA.dura);
}

function entristecer(nino) {
  if (estrellaEncendida) return; // mientras se dona, todos siguen felices
  nino.elemento.classList.remove("feliz");
  // Si el lado oscuro está congelado, no vuelven a estar tristes: vuelven a llorar
  if (lados.triste.congelado) nino.elemento.classList.add("muy-triste");
}

// Se sientan uno detrás de otro y rompen a llorar
function entristecerTodos() {
  esperasCadena.forEach(clearTimeout);
  esperasCadena = ninosTristes.map((nino, orden) => setTimeout(() => {
    clearTimeout(nino.temporizador);
    nino.elemento.classList.remove("feliz");
    nino.elemento.classList.add("muy-triste");
  }, orden * 140));
}

/* Caravana: el árbol y los niños felices cruzan al lado oscuro al donar */
const CARAVANA = { viaje: 2400 }; // ms, igual que la transición del CSS
let estadoCaravana = "casa"; // casa · yendo · alli · volviendo
let esperaCaravana = null;

function enviarCaravana() {
  clearTimeout(esperaCaravana);
  estadoCaravana = "yendo";
  cartel.classList.add("caravana-fuera", "caravana-corriendo");
  esperaCaravana = setTimeout(() => {
    estadoCaravana = "alli";
    cartel.classList.remove("caravana-corriendo");
    levantarEnCadena();
  }, movimientoReducido ? 0 : CARAVANA.viaje);
}

function volverCaravana() {
  clearTimeout(esperaCaravana);
  estadoCaravana = "volviendo";
  cartel.classList.remove("caravana-fuera");
  cartel.classList.add("caravana-corriendo");
  esperaCaravana = setTimeout(() => {
    estadoCaravana = "casa";
    cartel.classList.remove("caravana-corriendo");
  }, movimientoReducido ? 0 : CARAVANA.viaje);
}

// Al donar, la luz avanza desde la estrella: se levantan primero los más cercanos
let esperasCadena = [];

function levantarEnCadena() {
  const estrellaX = 636;
  const estrellaY = 503;
  esperasCadena.forEach(clearTimeout);
  esperasCadena = [...ninosTristes]
    .sort((a, b) => Math.hypot(a.x - estrellaX, a.y - estrellaY) - Math.hypot(b.x - estrellaX, b.y - estrellaY))
    .map((nino, orden) => setTimeout(() => alegrar(nino), 350 + orden * 260));
}

function comprobarNinos(x, y) {
  if (estadoCaravana === "casa") {
    ninos.forEach((nino) => {
      if (estaEncima(nino, x, y)) hacerSaltar(nino);
    });
  }
  ninosTristes.forEach((nino) => {
    if (Math.abs(x - nino.x) < ALEGRIA.anchoMedio * nino.escala
        && Math.abs(y - nino.y) < ALEGRIA.altoMedio * nino.escala) {
      alegrar(nino);
    }
  });
}

/* ---------- 8c. Regalos y nieve que caen y se acumulan ---------- */

const CAIDA = {
  suelo: 1036,            // donde empieza la franja del pie
  velocidad: [70, 120],   // px por segundo
  tamano: [22, 36],       // lado del cubo
  celda: 4,               // ancho de cada columna del mapa de alturas
  maxApilados: { feliz: 14, triste: 30 },
  alturaMaxima: { feliz: 30, triste: 46 }, // la pila no tapa a los niños
  cadaFeliz: [1.2, 2.2],  // segundos entre regalos en el lado feliz
  cadaDonando: 0.22,      // con el cursor en la estrella llueven regalos en el oscuro
  nievePorCopo: 0.16,     // px que crece el manto con cada copo que llega al suelo
  nieveMaxima: 24,
};

const COLORES_REGALO = [
  ["#ffd166", "#e63946"], ["#5aa9ff", "#fff1e6"], ["#ffb3d1", "#1f8a45"],
  ["#fff1e6", "#e63946"], ["#e63946", "#ffd166"], ["#2a9d8f", "#fff1e6"],
];

const azar = (min, max) => min + Math.random() * (max - min);

function crearLado(nombre) {
  const capaNieve = document.querySelector(`.nieve--${nombre}`);
  return {
    nombre,
    capa: document.getElementById(`lluvia-${nombre}`),
    manto: capaNieve.querySelector(".nieve__manto"),
    capaNieve,
    alturas: new Float32Array(Math.ceil(MITAD / CAIDA.celda)),
    nieve: 0,
    cayendo: [],
    posados: [],
    proximo: 0,
    congelado: false,
  };
}

const lados = { feliz: crearLado("feliz"), triste: crearLado("triste") };

// Altura de la superficie (pila de regalos o nieve) bajo un tramo [x, x + ancho]
function superficie(lado, x, ancho) {
  let maxima = lado.nieve;
  const desde = Math.max(0, Math.floor(x / CAIDA.celda));
  const hasta = Math.min(lado.alturas.length - 1, Math.floor((x + ancho) / CAIDA.celda));
  for (let i = desde; i <= hasta; i++) maxima = Math.max(maxima, lado.alturas[i]);
  return maxima;
}

// Un cubo de seis caras; el CSS las coloca en 3D
function crearCubo(regalo) {
  const cubo = document.createElement("div");
  cubo.className = "regalo3d__cubo";
  for (let i = 0; i < 6; i++) {
    const cara = document.createElement("div");
    cara.className = "regalo3d__cara";
    cubo.appendChild(cara);
  }
  regalo.appendChild(cubo);
}

// Reserva el hueco de un regalo en el mapa de alturas y devuelve dónde se posará.
// Se hace al soltarlo: así dos regalos en el aire no eligen el mismo hueco.
function reservarHueco(lado, x, t) {
  const altura = superficie(lado, x, t);
  const desde = Math.max(0, Math.floor(x / CAIDA.celda));
  const hasta = Math.min(lado.alturas.length - 1, Math.floor((x + t) / CAIDA.celda));
  for (let i = desde; i <= hasta; i++) lado.alturas[i] = altura + t * 0.8;
  return CAIDA.suelo - altura - t;
}

function soltarRegalo(lado) {
  const t = Math.round(azar(...CAIDA.tamano));
  // De seis sitios al azar se elige el más bajo: la pila crece pareja
  let x = 0;
  let mejor = Infinity;
  for (let intento = 0; intento < 6; intento++) {
    const candidato = azar(4, MITAD - t - 4);
    const altura = superficie(lado, candidato, t);
    if (altura < mejor) { mejor = altura; x = candidato; }
  }
  if (mejor > CAIDA.alturaMaxima[lado.nombre]) return;

  const [color, cinta] = COLORES_REGALO[Math.floor(Math.random() * COLORES_REGALO.length)];
  const elemento = document.createElement("div");
  elemento.className = "regalo3d";
  elemento.style.cssText = `--t:${t}px; --color:${color}; --cinta:${cinta}; --giro:${azar(5, 9).toFixed(1)}s; --posado:${azar(15, 70).toFixed(0)}deg`;
  crearCubo(elemento);
  lado.capa.appendChild(elemento);

  const regalo = {
    elemento, x, y: -t - 20, t, color, cinta,
    destino: reservarHueco(lado, x, t),
    velocidad: azar(...CAIDA.velocidad),
  };
  lado.cayendo.push(regalo);

  // Interacción · click: el regalo estalla en confeti y fuegos artificiales
  elemento.addEventListener("click", () => estallarRegalo(lado, regalo));
}

function moverRegalos(lado, dt) {
  lado.cayendo = lado.cayendo.filter((regalo) => {
    regalo.y += regalo.velocidad * dt;
    const aterriza = regalo.y >= regalo.destino;
    if (aterriza) {
      regalo.y = regalo.destino;
      regalo.elemento.classList.add("aterrizado");
      lado.posados.push(regalo);
    }
    regalo.elemento.style.transform = `translate3d(${regalo.x.toFixed(1)}px, ${regalo.y.toFixed(1)}px, 0)`;
    return !aterriza;
  });
}

// Tras quitar un regalo se rehace la pila de abajo arriba: los que se quedan
// sin apoyo vuelven a caer hasta su nuevo hueco.
function reconstruirPila(lado) {
  lado.alturas.fill(0);
  const deAbajoArriba = (a, b) => b.y - a.y;
  const posados = [...lado.posados].sort(deAbajoArriba);
  const enElAire = [...lado.cayendo].sort(deAbajoArriba);
  lado.posados = [];

  posados.forEach((regalo) => {
    regalo.destino = reservarHueco(lado, regalo.x, regalo.t);
    if (regalo.destino > regalo.y + 0.5) {
      regalo.velocidad = 200; // cae por su peso, ya posado: sin girar
      lado.cayendo.push(regalo);
    } else {
      lado.posados.push(regalo);
    }
  });

  enElAire.forEach((regalo) => {
    regalo.destino = reservarHueco(lado, regalo.x, regalo.t);
  });
}

function estallarRegalo(lado, regalo) {
  if (lado.congelado) return; // congelado no se puede abrir
  const desplazamiento = lado.nombre === "triste" ? MITAD : 0;
  fuegos.estallar(desplazamiento + regalo.x + regalo.t / 2, regalo.y + regalo.t / 2, [regalo.color, regalo.cinta]);

  regalo.elemento.remove();
  lado.cayendo = lado.cayendo.filter((otro) => otro !== regalo);
  lado.posados = lado.posados.filter((otro) => otro !== regalo);
  reconstruirPila(lado);
}

// Sin donación: los regalos del lado oscuro se quedan helados (también los que
// estaban cayendo, suspendidos en el aire) y los niños lloran
function congelarLadoOscuro() {
  lados.triste.congelado = true;
  lados.triste.capa.classList.add("congelada");
  entristecerTodos();
}

// Al volver a donar, el hielo se derrite y todo sigue
function descongelarLadoOscuro() {
  lados.triste.congelado = false;
  lados.triste.capa.classList.remove("congelada");
}

// Cada copo que llega al suelo engorda el manto de nieve de su lado
function acumularNieve(lado) {
  lado.nieve = Math.min(lado.nieve + CAIDA.nievePorCopo, CAIDA.nieveMaxima);
  lado.manto.style.height = `${lado.nieve.toFixed(1)}px`;
}

let ultimoTiempo = null;

// Bucle propio (siempre activo): mueve lo que cae y decide cuándo soltar más
function animarCaidas(tiempo) {
  const segundos = tiempo / 1000;
  const dt = ultimoTiempo === null ? 0 : Math.min(segundos - ultimoTiempo, 0.05);
  ultimoTiempo = segundos;

  const { feliz, triste } = lados;

  if (segundos >= feliz.proximo && feliz.posados.length + feliz.cayendo.length < CAIDA.maxApilados.feliz) {
    soltarRegalo(feliz);
    feliz.proximo = segundos + azar(...CAIDA.cadaFeliz);
  }
  if (estrellaEncendida && estadoCaravana === "alli" && segundos >= triste.proximo
      && triste.posados.length + triste.cayendo.length < CAIDA.maxApilados.triste) {
    soltarRegalo(triste);
    triste.proximo = segundos + CAIDA.cadaDonando;
  }

  moverRegalos(feliz, dt);
  if (!triste.congelado) moverRegalos(triste, dt);
  requestAnimationFrame(animarCaidas);
}

function prepararCaidas() {
  Object.values(lados).forEach((lado) => {
    lado.manto.style.height = "0px";
    lado.capaNieve.addEventListener("animationiteration", () => acumularNieve(lado));
  });
  if (!movimientoReducido) requestAnimationFrame(animarCaidas);
}

/* ---------- 8d. Confeti y fuegos artificiales ---------- */

// Partículas dibujadas en un <canvas> que cubre el cartel (coordenadas 848 × 1200).
// El bucle solo corre mientras quedan partículas vivas.
const fuegos = (() => {
  const canvas = document.getElementById("fuegos");
  const ctx = canvas.getContext("2d");
  const densidad = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CARTEL.ancho * densidad;
  canvas.height = CARTEL.alto * densidad;
  ctx.scale(densidad, densidad);

  const PALETA = ["#ffd166", "#ff3b30", "#ffb3d1", "#5aa9ff", "#fff1e6", "#2fbf63", "#c77dff"];
  const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];

  let particulas = [];
  let fotograma = null;
  let anterior = 0;

  // Papelitos de colores que salen disparados hacia arriba y caen dando vueltas
  function confeti(x, y, colores) {
    for (let i = 0; i < 120; i++) {
      const angulo = azar(-Math.PI * 0.95, -Math.PI * 0.05);
      const fuerza = azar(180, 620);
      particulas.push({
        tipo: "confeti", x, y,
        vx: Math.cos(angulo) * fuerza, vy: Math.sin(angulo) * fuerza,
        giro: azar(0, Math.PI * 2), vgiro: azar(-12, 12),
        ancho: azar(6, 11), alto: azar(4, 6),
        color: Math.random() < 0.4 ? elegir(colores) : elegir(PALETA),
        vida: azar(1.8, 2.8),
      });
    }
  }

  // Cohete que sube dejando estela y explota en una palmera de chispas
  function cohete(x, y) {
    particulas.push({
      tipo: "cohete", x, y,
      vx: azar(-90, 90), vy: azar(-640, -480),
      color: elegir(PALETA), vida: azar(0.55, 0.8),
    });
  }

  function palmera(x, y, color, lista) {
    const cantidad = 90;
    const segundo = elegir(PALETA);
    for (let i = 0; i < cantidad; i++) {
      const angulo = (Math.PI * 2 * i) / cantidad + azar(-0.05, 0.05);
      const fuerza = azar(110, 300);
      lista.push({
        tipo: "chispa", x, y,
        vx: Math.cos(angulo) * fuerza, vy: Math.sin(angulo) * fuerza,
        color: i % 3 === 0 ? segundo : color,
        radio: azar(1.8, 3.2), vida: azar(1.1, 1.8), max: 1.8,
      });
    }
    lista.push({ tipo: "destello", x, y, vida: 0.25, max: 0.25 });
  }

  function actualizar(dt) {
    const vivas = [];
    particulas.forEach((p) => {
      p.vida -= dt;
      if (p.tipo === "confeti") {
        p.vy += 520 * dt;
        p.vx *= 1 - 1.6 * dt;
        p.vy *= 1 - 1.2 * dt;
        p.giro += p.vgiro * dt;
      } else if (p.tipo === "cohete") {
        p.vy += 380 * dt;
        vivas.push({ tipo: "chispa", x: p.x, y: p.y, vx: azar(-20, 20), vy: azar(20, 60),
          color: "#ffd166", radio: 1.3, vida: 0.35, max: 0.35 });
        if (p.vida <= 0 || p.vy > -40) {
          palmera(p.x, p.y, p.color, vivas);
          return;
        }
      } else if (p.tipo === "chispa") {
        p.vy += 140 * dt;
        p.vx *= 1 - 1.4 * dt;
        p.vy *= 1 - 1.4 * dt;
      }
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      if (p.vida > 0 && p.y < CARTEL.alto + 20) vivas.push(p);
    });
    particulas = vivas;
  }

  function dibujar() {
    ctx.clearRect(0, 0, CARTEL.ancho, CARTEL.alto);
    particulas.forEach((p) => {
      if (p.tipo !== "confeti") return;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.vida / 0.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.scale(1, Math.cos(p.giro * 1.7)); // da la vuelta como un papelito
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho, p.alto);
      ctx.restore();
    });
    // Las luces se suman entre sí: brillan más donde se cruzan
    ctx.globalCompositeOperation = "lighter";
    particulas.forEach((p) => {
      if (p.tipo === "chispa" || p.tipo === "cohete") {
        const alfa = p.tipo === "cohete" ? 1 : Math.max(0, p.vida / p.max);
        ctx.globalAlpha = alfa * (0.75 + Math.random() * 0.25);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.tipo === "cohete" ? 2.6 : p.radio, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.tipo === "destello") {
        const t = 1 - p.vida / p.max;
        const radio = 20 + t * 70;
        const brillo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radio);
        brillo.addColorStop(0, "rgba(255, 255, 255, 0.9)");
        brillo.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = brillo;
        ctx.fillRect(p.x - radio, p.y - radio, radio * 2, radio * 2);
      }
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  function bucle(tiempo) {
    const dt = Math.min((tiempo - anterior) / 1000, 0.05);
    anterior = tiempo;
    actualizar(dt);
    dibujar();
    fotograma = particulas.length > 0 ? requestAnimationFrame(bucle) : null;
  }

  return {
    estallar(x, y, colores) {
      confeti(x, y, colores);
      particulas.push({ tipo: "destello", x, y, vida: 0.3, max: 0.3 });
      const cohetes = movimientoReducido ? 0 : 4;
      for (let i = 0; i < cohetes; i++) cohete(x, y);
      if (fotograma === null) {
        anterior = performance.now();
        fotograma = requestAnimationFrame(bucle);
      }
    },
  };
})();

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
  const puntosEstrella = crearPuntosEstrella(ESTRELLA.puntas, ESTRELLA.radioExterior, ESTRELLA.radioInterior);
  poligonoEstrella.setAttribute("points", puntosEstrella);
  cantoEstrella.setAttribute("points", puntosEstrella);

  // Interacción 3 · mousemove (y vuelta al reposo al salir del cartel)
  cartel.addEventListener("mousemove", seguirCursor);
  cartel.addEventListener("mouseleave", soltarCursor);

  // Interacciones 1 y 2 · mouseenter / mouseleave sobre la estrella
  estrella.addEventListener("mouseenter", encenderEstrella);
  estrella.addEventListener("mouseleave", apagarEstrella);

  prepararCaidas();

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

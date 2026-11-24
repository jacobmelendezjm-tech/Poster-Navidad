/* =========================================================
   ILUMINA SU NAVIDAD · versión 3D realista (Three.js + cannon-es)
   Cartel interactivo · 21 de diciembre · Associació Educativa Itaca

   Dos Navidades, una al lado de la otra, en un mundo 3D:
   a la izquierda, un pueblo navideño con su abeto y niños felices;
   a la derecha, el mismo pueblo a oscuras, un árbol seco y niños
   tristes. El cursor es una luz cálida; al donar, los niños felices
   cargan el árbol y los regalos y se los llevan a los tristes.

   Realismo:
   - Luz de entorno con un HDRI nocturno real (Poly Haven, CC0).
   - Texturas fotográficas PBR (Poly Haven, CC0): nieve, ladrillo,
     tejas y madera, con mapa de relieve y de rugosidad.
   - Modelos reales (Poly Haven, CC0): farolas, farol y caja de cartón.
   - Abetos hechos de ramas con agujas, nieve en las puntas y sombras.
   - Física real (cannon-es) para los regalos: caen, chocan y se apilan.
   - Brillo (bloom), niebla y sombras suaves.

   Índice
   1.  Configuración y utilidades
   2.  Referencias al DOM y estado
   3.  Motor 3D: renderizador, cámara, luces, brillo y entorno
   4.  Texturas: fotográficas (PBR) y dibujadas (cielo, agujas, tela…)
   5.  Materiales que se calientan al donar
   6.  Piezas: regalos, casas, abetos, árbol seco, farolas
   7.  Niños (felices y tristes que se levantan)
   8.  El mundo: cielo, suelo, pueblos, árboles, niños
   9.  Lema 3D y estrella de donar
   10. Santa Claus en su trineo
   11. Física: regalos que caen, se apilan, se congelan y estallan
   12. Nieve que cae y se acumula
   13. Confeti y fuegos artificiales
   14. Interacción: cursor, toque, donar, click
   15. Bucle de animación
   16. Escalado e inicio
   ========================================================= */

import * as THREE from "three";
import * as CANNON from "cannon-es";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/* ---------- 1. Configuración y utilidades ---------- */

const CARTEL = { ancho: 848, alto: 1200, margenVentana: 32 };
const MITAD = 424;
const FOV = 35;
const D = 6 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)); // el plano z=0 mide 848×1200 px
const SUELO = -4;

const RUTA = "assets/";
const FUENTE_3D = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json";

const C = {
  crema: "#fff1e6", rojo: "#c8102e", oro: "#ffd166", rosa: "#f4a6c0", azul: "#3f7fd9",
  verde: "#1f6b3a", teal: "#23867a", morado: "#9b5de5", naranja: "#f08a3c", fucsia: "#e8508f",
};

const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const esMovil = window.matchMedia("(hover: none) and (pointer: coarse)").matches || window.innerWidth < 600;

const azar = (min, max) => min + Math.random() * (max - min);
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];
const lerp = THREE.MathUtils.lerp;
const limitar = THREE.MathUtils.clamp;
const suave = (t) => t * t * (3 - 2 * t);

// Ruido suave (valor) para dunas de nieve y nubes
function ruido2(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function ruidoSuave(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = ruido2(ix, iy), b = ruido2(ix + 1, iy), c = ruido2(ix, iy + 1), d = ruido2(ix + 1, iy + 1);
  const ux = suave(fx), uy = suave(fy);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function fbm(x, y) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { v += a * ruidoSuave(x, y); x *= 2.03; y *= 2.03; a *= 0.5; }
  return v;
}

// Posición del mundo que, vista desde la cámara, cae en el píxel (px, py) a la profundidad z
function enPantalla(px, py, z = 0) {
  const k = (D - z) / D;
  return new THREE.Vector3(((px - MITAD) / 100) * k, ((600 - py) / 100) * k, z);
}

const _proyeccion = new THREE.Vector3();
function aPixeles(vector) {
  _proyeccion.copy(vector).project(camara);
  return { x: (_proyeccion.x + 1) * 0.5 * CARTEL.ancho, y: (1 - _proyeccion.y) * 0.5 * CARTEL.alto };
}

/* ---------- 2. Referencias al DOM y estado ---------- */

const escenario = document.getElementById("escenario");
const cartel = document.getElementById("cartel");
const lienzo = document.getElementById("mundo");
const botonDonar = document.getElementById("donar");

const raton = { x: MITAD, y: 600, dentro: false };
const luzCursor = { x: MITAD, y: 600, intensidad: 0, objetivo: 0 };

let estrellaEncendida = false;
let calidez = 0;
let estadoCaravana = "casa";
let progresoCaravana = 0;

/* ---------- 3. Motor 3D: renderizador, cámara, luces, brillo y entorno ---------- */

let renderizador;
try {
  renderizador = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, powerPreference: "high-performance" });
} catch (error) {
  document.body.insertAdjacentHTML("beforeend", "<p style=\"position:fixed;inset:auto 0 16px;text-align:center\">Tu navegador no puede mostrar el cartel en 3D.</p>");
  throw error;
}
renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, esMovil ? 1.25 : 2));
renderizador.setSize(CARTEL.ancho, CARTEL.alto, false);
renderizador.outputColorSpace = THREE.SRGBColorSpace;
renderizador.toneMapping = THREE.ACESFilmicToneMapping;
renderizador.toneMappingExposure = 1.0;
renderizador.shadowMap.enabled = !esMovil;
renderizador.shadowMap.type = THREE.PCFSoftShadowMap;
renderizador.shadowMap.autoUpdate = false; // el bucle decide cuándo recalcular las sombras

const escena = new THREE.Scene();
escena.fog = new THREE.FogExp2("#0b0f1c", 0.028);

const camara = new THREE.PerspectiveCamera(FOV, CARTEL.ancho / CARTEL.alto, 0.1, 80);
camara.position.set(0, 0, D);
camara.lookAt(0, 0, 0);
camara.updateMatrixWorld();

// Postprocesado: brillo en luces, ventanas y chispas
const compositor = new EffectComposer(renderizador);
compositor.setSize(CARTEL.ancho, CARTEL.alto);
compositor.addPass(new RenderPass(escena, camara));
const brillo = new UnrealBloomPass(new THREE.Vector2(CARTEL.ancho / 2, CARTEL.alto / 2), 0.42, 0.45, 0.92);
compositor.addPass(brillo);
compositor.addPass(new OutputPass());

// Entorno: un cielo nocturno real (HDRI) ilumina y se refleja en metales y bolas
const pmrem = new THREE.PMREMGenerator(renderizador);
function cargarEntorno(intento = 0) {
  encolar((listo) => new RGBELoader().load(`${RUTA}hdri/kloppenheim_02_puresky_1k.hdr`, (hdr) => {
    listo();
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    escena.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
  }, undefined, () => { listo(); if (intento < 4) setTimeout(() => cargarEntorno(intento + 1), 600); }));
}
// (se llama más abajo, cuando la cola de descargas ya existe)

// Luz de luna, fría y con sombras suaves
escena.add(new THREE.HemisphereLight("#9fb4ff", "#2a2030", 0.35));
const luna = new THREE.DirectionalLight("#cfdcff", 1.1);
luna.position.set(-4, 9, 10);
luna.castShadow = true;
luna.shadow.mapSize.set(1536, 1536);
Object.assign(luna.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
luna.shadow.camera.updateProjectionMatrix();
luna.shadow.bias = -0.0006;
luna.shadow.normalBias = 0.02;
luna.shadow.radius = 4;
escena.add(luna);

// Luces cálidas del lado feliz (ventanas, árbol, faroles)
[[-2.3, -0.6, 2.4, 6], [-3.6, -3.1, 2.2, 3], [-0.9, -3.1, 2.2, 3], [-2.2, -3.3, -3.2, 8]].forEach(([x, y, z, i]) => {
  const luz = new THREE.PointLight("#ffb46b", i, 8, 1.7);
  luz.position.set(x, y, z);
  escena.add(luz);
});

// Lado oscuro: luz fría y tenue; y la que llega al donar
const luzFria = new THREE.PointLight("#5f78b8", 5, 10, 1.6);
luzFria.position.set(2.2, 0, 3);
escena.add(luzFria);
const luzDonacion = new THREE.PointLight("#ffb46b", 0, 11, 1.4);
luzDonacion.position.set(2.2, -1.2, 2.4);
escena.add(luzDonacion);
const luzRaton = new THREE.PointLight("#ffc27a", 0, 4.2, 1.6);
escena.add(luzRaton);

/* ---------- 4. Texturas ---------- */

const cargador = new THREE.TextureLoader();
const anisotropia = Math.min(8, renderizador.capabilities.getMaxAnisotropy());
const basesPBR = new Map();

// Texturas fotográficas de Poly Haven (color, relieve y rugosidad), con reintentos:
// un servidor local sencillo a veces corta descargas cuando llegan muchas a la vez.
// Cola de descargas: como mucho 3 a la vez (los servidores locales sencillos cortan si llegan más)
const cola = { activas: 0, max: 6, pendientes: [] };
function encolar(tarea) {
  cola.pendientes.push(tarea);
  siguienteDescarga();
}
function siguienteDescarga() {
  while (cola.activas < cola.max && cola.pendientes.length) {
    cola.activas++;
    const tarea = cola.pendientes.shift();
    let terminada = false;
    tarea(() => {
      if (terminada) return;
      terminada = true;
      cola.activas--;
      siguienteDescarga();
    });
  }
}

const cargadorImagenes = new THREE.ImageLoader();
function cargarImagen(url, intento = 0) {
  return new Promise((resolver, rechazar) => {
    encolar((listo) => {
      let resuelto = false;
      const fallar = () => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(limite);
        listo();
        if (intento < 5) setTimeout(() => cargarImagen(`${url.split("?")[0]}?r=${intento + 1}`, intento + 1).then(resolver, rechazar), 400 * (intento + 1));
        else rechazar(new Error(url));
      };
      // si el servidor deja la descarga colgada, se reintenta a los 8 s
      const limite = setTimeout(fallar, 8000);
      cargadorImagenes.load(url, (imagen) => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(limite);
        listo();
        resolver(imagen);
      }, undefined, fallar);
    });
  });
}

// Se descargan todas las texturas fotográficas ANTES de construir la escena:
// así cada copia (con su propia repetición) nace ya con su imagen.
const TEXTURAS_PBR = ["snow_02", "castle_brick_02_white", "clay_roof_tiles_02", "dark_wooden_planks"];
// Se descargan las texturas fotográficas antes de construir la escena (sin pantalla de
// carga: mientras tanto el cartel simplemente aún no se dibuja).
// Barra de la pantalla de carga: avanza con cada archivo que llega
const barraCarga = document.getElementById("carga-progreso");
let pasosCarga = 0;
const PASOS_TOTALES = 14; // 12 texturas + fuente 3D + primer fotograma
function avanzarCarga() {
  pasosCarga++;
  if (barraCarga) barraCarga.style.width = `${Math.min(100, 4 + (pasosCarga / PASOS_TOTALES) * 96)}%`;
  if (pasosCarga >= PASOS_TOTALES) setTimeout(amainarTormenta, 400);
}
setTimeout(amainarTormenta, 20000); // por si algo no llega nunca

// Apertura: la tormenta de nieve amaina poco a poco y deja ver el cartel
let abierto = false;
function amainarTormenta() {
  if (abierto) return;
  abierto = true;
  const carga = document.getElementById("carga");
  if (!carga || movimientoReducido) { cartel.classList.add("esta-listo"); return; }
  carga.classList.add("amainando");
  setTimeout(() => cartel.classList.add("esta-listo"), 4400);
}

async function precargarTexturas() {
  const tareas = [];
  for (const nombre of TEXTURAS_PBR) {
    const base = {};
    basesPBR.set(nombre, base);
    for (const [clave, sufijo, color] of [["map", "diff", true], ["normalMap", "nor_gl", false], ["roughnessMap", "rough", false]]) {
      tareas.push(cargarImagen(`${RUTA}texturas/${nombre}_${sufijo}_512.jpg`).then((imagen) => {
        const t = new THREE.Texture(imagen);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = anisotropia;
        if (color) t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        base[clave] = t;
      }).catch(() => { base[clave] = null; }).finally(avanzarCarga));
    }
  }
  await Promise.all(tareas);
}

// Copia de una textura fotográfica repetida rx × ry veces (comparte la imagen: una sola subida a la GPU)
function texturaPBR(nombre, rx, ry) {
  const base = basesPBR.get(nombre) || {};
  const copia = (t) => {
    if (!t) return null;
    const c = t.clone();
    c.repeat.set(rx, ry);
    return c;
  };
  return { map: copia(base.map), normalMap: copia(base.normalMap), roughnessMap: copia(base.roughnessMap) };
}

function lienzoTextura(ancho, alto, dibujar) {
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  dibujar(c.getContext("2d"), ancho, alto);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropia;
  return t;
}

// Rama de abeto realista: eje leñoso, ramitas laterales cubiertas de agujas (más oscuras
// dentro y más claras en las puntas) y montoncitos de nieve encima. La textura va en
// blanco y negro de verde: el color fino lo ponen los colores de vértice de cada rama.
const texturaRama = lienzoTextura(512, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  const eje = h / 2;
  const aguja = (x, y, ang, largo, luz) => {
    const v = luz;
    ctx.strokeStyle = `rgb(${16 + v * 28}, ${84 + v * 92}, ${44 + v * 34})`;
    ctx.lineWidth = azar(1.1, 1.9);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * largo, y + Math.sin(ang) * largo);
    ctx.stroke();
  };
  // ramitas laterales: salen del eje hacia delante, a los dos lados
  const ramitas = 26;
  for (let k = 0; k < ramitas; k++) {
    const t = k / ramitas;
    const x0 = 14 + t * (w - 60);
    const lado = k % 2 ? -1 : 1;
    const largoRamita = (1 - t * 0.6) * azar(55, 85);
    const ang = lado * azar(0.55, 0.85);
    const x1 = x0 + Math.cos(ang) * largoRamita;
    const y1 = eje + Math.sin(ang) * largoRamita;
    // agujas a lo largo de la ramita
    for (let n = 0; n < 34; n++) {
      const u = n / 34;
      const x = x0 + (x1 - x0) * u;
      const y = eje + (y1 - eje) * u;
      for (const s2 of [-1, 1]) {
        aguja(x, y, ang + s2 * azar(0.7, 1.1), azar(9, 15) * (1 - u * 0.35), 0.25 + u * 0.75 * Math.random());
      }
    }
    ctx.strokeStyle = "#3a4526";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, eje);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // agujas sobre el propio eje y punta tierna (más clara)
  for (let n = 0; n < 160; n++) {
    const u = n / 160;
    const x = 10 + u * (w - 24);
    for (const s2 of [-1, 1]) aguja(x, eje, s2 * azar(0.9, 1.4) + 0.2, azar(10, 16), u > 0.85 ? 1 : 0.35 + Math.random() * 0.4);
  }
  ctx.strokeStyle = "#4a3a26";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, eje);
  ctx.lineTo(w - 22, eje);
  ctx.stroke();
  // nieve posada encima (en la mitad superior de la rama)
  for (let k = 0; k < 120; k++) {
    const x = azar(20, w - 50);
    const y = eje - azar(10, 70) * (1 - x / w * 0.5);
    const r = azar(6, 16) * (1 - x / w * 0.55);
    const g = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.97)");
    g.addColorStop(0.7, "rgba(236,242,250,0.9)");
    g.addColorStop(1, "rgba(220,230,245,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.5, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }
});
texturaRama.generateMipmaps = true;

// Tela de punto para abrigos, gorros y bufandas
const texturaPunto = lienzoTextura(128, 128, (ctx, w, h) => {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    for (let x = 0; x < w; x += 8) {
      const o = 0.78 + Math.random() * 0.18;
      ctx.fillStyle = `rgba(${255 * o}, ${255 * o}, ${255 * o}, 1)`;
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 4, 2.2, 4, -0.5, 0, Math.PI * 2);
      ctx.ellipse(x + 6, y + 4, 2.2, 4, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
});
texturaPunto.wrapS = texturaPunto.wrapT = THREE.RepeatWrapping;
texturaPunto.repeat.set(3, 3);

// Papel de regalo con distintos estampados
function papelRegalo(fondo, dibujo, estilo) {
  return lienzoTextura(128, 128, (ctx, w, h) => {
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = dibujo;
    ctx.strokeStyle = dibujo;
    if (estilo === 0) {
      for (let y = 8; y < h; y += 20) for (let x = (y / 20) % 2 ? 18 : 8; x < w; x += 20) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
    } else if (estilo === 1) {
      ctx.lineWidth = 7;
      for (let i = -h; i < w; i += 22) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); }
    } else {
      for (let y = 12; y < h; y += 28) for (let x = (y / 28) % 2 ? 26 : 12; x < w; x += 28) {
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const r = k % 2 ? 3 : 7.5;
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          k ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.fill();
      }
    }
  });
}

// Destello suave para nieve, chispas y halos
const texturaDestello = lienzoTextura(64, 64, (ctx, w) => {
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.65)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
});

// Cielo nocturno pintado: degradado, Vía Láctea, estrellas, nubes y resplandor del pueblo
function texturaCielo(feliz) {
  return lienzoTextura(512, 1024, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const paradas = feliz
      ? [[0, "#03051a"], [0.28, "#0d0f33"], [0.48, "#2a1440"], [0.6, "#5a1d42"], [0.68, "#a8413f"], [0.73, "#f08a52"], [0.8, "#4a1a2a"], [1, "#120a14"]]
      : [[0, "#010204"], [0.4, "#05070c"], [0.62, "#10141c"], [0.72, "#1e232d"], [1, "#0c0e13"]];
    paradas.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Vía Láctea
    if (feliz) {
      for (let i = 0; i < 2600; i++) {
        const t = Math.random();
        const x = t * w + azar(-60, 60) * (0.6 + fbm(t * 6, 1));
        const y = h * 0.05 + t * h * 0.45 + azar(-45, 45);
        ctx.fillStyle = `rgba(255, 240, 255, ${azar(0.03, 0.18)})`;
        ctx.fillRect(x, y, 1.2, 1.2);
      }
    }
    // estrellas
    const cuantas = feliz ? 900 : 120;
    for (let i = 0; i < cuantas; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h * 0.7;
      const r = Math.random() < 0.06 ? azar(1.2, 2) : azar(0.4, 1.1);
      ctx.fillStyle = `rgba(${feliz ? "255,246,225" : "140,150,170"}, ${feliz ? azar(0.5, 1) : azar(0.15, 0.4)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // nubes (suaves y teñidas en el feliz; densas y oscuras en el triste)
    const nubes = feliz ? 70 : 260;
    for (let i = 0; i < nubes; i++) {
      const x = Math.random() * w;
      const y = h * azar(feliz ? 0.45 : 0.3, 0.72);
      const r = azar(30, feliz ? 70 : 110);
      const c = ctx.createRadialGradient(x, y, 0, x, y, r);
      if (feliz) {
        c.addColorStop(0, "rgba(255, 170, 150, 0.08)");
        c.addColorStop(1, "rgba(255, 170, 150, 0)");
      } else {
        c.addColorStop(0, "rgba(28, 32, 42, 0.55)");
        c.addColorStop(1, "rgba(28, 32, 42, 0)");
      }
      ctx.fillStyle = c;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}


// Dentro de la web de pósters (iframe) el cartel solo empieza a descargar sus texturas
// cuando el usuario llega a él: así no compite con los demás pósters al cargar la página.
const incrustado = (() => { try { return window.self !== window.top; } catch { return true; } })();
document.documentElement.classList.toggle("incrustado", incrustado);
let enPantallaAhora = true;
let alReanudar = null; // se asigna al arrancar el bucle
await new Promise((listo) => {
  if (!("IntersectionObserver" in window)) { listo(); return; }
  let primera = true;
  new IntersectionObserver((entradas) => {
    enPantallaAhora = entradas[0].isIntersecting;
    if (enPantallaAhora && primera) { primera = false; listo(); }
    if (enPantallaAhora && alReanudar) alReanudar();
  }, { rootMargin: "300px" }).observe(cartel);
});

cargarEntorno();
await precargarTexturas();

/* ---------- 5. Materiales que se calientan al donar ---------- */

const materialesCalidos = [];

function mat(color, opciones = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, envMapIntensity: 0.6, ...opciones });
}

function matPar(frio, calido, opciones = {}) {
  const { emisivoFrio = 0, emisivoCalido = 0, opacidadFria = 1, opacidadCalida = 1, entornoFrio = 0.12, ...propias } = opciones;
  const m = mat(frio, propias);
  if (opacidadFria < 1 || opacidadCalida < 1) m.transparent = true;
  // en el lado oscuro el cielo apenas se refleja; al donar recupera el reflejo normal
  const entornoCalido = propias.envMapIntensity ?? 0.6;
  materialesCalidos.push({ material: m, frio: new THREE.Color(frio), calido: new THREE.Color(calido), emisivoFrio, emisivoCalido, opacidadFria, opacidadCalida, entornoFrio, entornoCalido });
  return m;
}

function aplicarCalidez() {
  materialesCalidos.forEach((p) => {
    p.material.color.lerpColors(p.frio, p.calido, calidez);
    p.material.emissiveIntensity = lerp(p.emisivoFrio, p.emisivoCalido, calidez);
    p.material.opacity = lerp(p.opacidadFria, p.opacidadCalida, calidez);
    p.material.envMapIntensity = lerp(p.entornoFrio, p.entornoCalido, calidez);
  });
}

// Cada lado construye sus piezas con su paleta: el triste guarda la versión cálida
const LADO_FELIZ = {
  feliz: true,
  m: (calido, frio, op) => mat(calido, op),
  luz: (color, i) => mat("#2a2018", { emissive: color, emissiveIntensity: i }),
};
const LADO_TRISTE = {
  feliz: false,
  m: (calido, frio, op) => matPar(frio, calido, op),
  luz: (color, i) => matPar("#0b0d12", "#2a2018", { emissive: color, emisivoFrio: 0, emisivoCalido: i }),
};

function sombras(objeto, proyecta = true) {
  objeto.traverse((h) => {
    if (h.isMesh) {
      h.castShadow = proyecta;
      h.receiveShadow = true;
    }
  });
  return objeto;
}

/* ---------- 6. Piezas ---------- */

const geoCaja = new THREE.BoxGeometry(1, 1, 1);
const geoEsfera = new THREE.SphereGeometry(1, 24, 16);
const geoEsferaBaja = new THREE.SphereGeometry(1, 10, 8);

function malla(geometria, material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geometria, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

// Material "plastilina": mate, suave, con un leve brillo de piel (estilo de las referencias)
function arcilla(color, opciones = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ffffff"), clearcoat: 0.08, envMapIntensity: 0.55, ...opciones });
}

// Regalo: caja de cantos redondeados, cinta en cruz y lazo de dos bucles con colas.
// Cada uno con una combinación distinta de caja y cinta. Centrado en su origen (para la física).
const COMBINACIONES = [
  ["#f4f4f6", "#d0202f"], ["#d0202f", "#f2c14e"], ["#1f8a4c", "#f4f4f6"], ["#2f6fd6", "#f2c14e"],
  ["#f2c14e", "#d0202f"], ["#f59ac0", "#f4f4f6"], ["#8a4fd6", "#f2c14e"], ["#1aa39a", "#d0202f"],
  ["#f6e6c8", "#1f8a4c"], ["#ff8a3d", "#f4f4f6"], ["#203a8f", "#e6e6ea"], ["#f4f4f6", "#1f8a4c"],
];
const geoCajaRegalo = new RoundedBoxGeometry(1, 1, 1, 4, 0.12);
const geoCintaV = new RoundedBoxGeometry(0.22, 1.03, 1.03, 2, 0.04);
const geoCintaH = new RoundedBoxGeometry(1.03, 1.03, 0.22, 2, 0.04);
const geoBucle = new THREE.TorusGeometry(0.2, 0.075, 12, 28);
const geoNudo = new RoundedBoxGeometry(0.24, 0.16, 0.24, 2, 0.06);
const geoCola = new RoundedBoxGeometry(0.11, 0.3, 0.03, 2, 0.012);
let siguienteCombinacion = 0;

function crearRegalo(indice) {
  const [colorCaja, colorCinta] = COMBINACIONES[(indice ?? siguienteCombinacion++) % COMBINACIONES.length];
  const g = new THREE.Group();
  const caja = arcilla(colorCaja);
  const cinta = arcilla(colorCinta, { roughness: 0.45, sheen: 0.6 });
  g.add(new THREE.Mesh(geoCajaRegalo, caja));
  g.add(new THREE.Mesh(geoCintaV, cinta), new THREE.Mesh(geoCintaH, cinta));
  // lazo: dos bucles inclinados, el nudo y dos colas
  for (const s2 of [-1, 1]) {
    const bucle = malla(geoBucle, cinta, s2 * 0.2, 0.66, 0, 1, 1, 0.55);
    bucle.rotation.set(0, 0, s2 * -0.45);
    g.add(bucle);
    const cola = malla(geoCola, cinta, s2 * 0.14, 0.5, 0.12);
    cola.rotation.set(-0.3, 0, s2 * 0.5);
    g.add(cola);
  }
  g.add(malla(geoNudo, cinta, 0, 0.56, 0));
  g.userData.materiales = [caja, cinta];
  return sombras(g);
}

// Casa realista: paredes de ladrillo o madera, tejado de tejas con nieve, ventanas con luz,
// carámbanos, chimenea con humo, puerta con corona y luces en el alero
const humos = [];
const geoCaramelo = new THREE.ConeGeometry(0.012, 1, 5);
const hielo = new THREE.MeshStandardMaterial({ color: "#dff1ff", roughness: 0.05, transparent: true, opacity: 0.75, envMapIntensity: 1.4 });

function crearCasa(lado, { ancho, alto, fondo, pared, tono, tonoFrio, techo = "#ffffff", plantas = alto > 1.3 ? 2 : 1 }) {
  const g = new THREE.Group();
  const feliz = lado.feliz;
  const zf = fondo / 2;                       // fachada delantera
  const zocalo = Math.min(0.22, alto * 0.12); // base de piedra
  const texPared = texturaPBR(pared, Math.max(1, ancho * 1.1), Math.max(1, alto * 1.1));
  const mPared = lado.m(tono, tonoFrio, { ...texPared, roughness: 1, normalScale: new THREE.Vector2(1.3, 1.3) });
  const mZocalo = lado.m("#8d8478", "#33363d", { ...texturaPBR("castle_brick_02_white", ancho * 1.4, 0.5), roughness: 1, normalScale: new THREE.Vector2(1.6, 1.6) });
  const texTeja = texturaPBR("clay_roof_tiles_02", ancho * 1.2, fondo * 1.0);
  const mTeja = lado.m(techo, "#55595f", { ...texTeja, roughness: 1, normalScale: new THREE.Vector2(1.4, 1.4) });
  const mNieve = lado.m("#ffffff", "#8d95a5", { ...texturaPBR("snow_02", ancho * 0.7, fondo * 0.6), roughness: 0.9 });
  const mMadera = lado.m("#f1ece4", "#2c2f36", { roughness: 0.65 });
  const mMaderaOscura = lado.m("#5a3a26", "#24262b", { ...texturaPBR("dark_wooden_planks", 0.6, 0.6), roughness: 0.8 });

  // base de piedra y paredes
  g.add(malla(geoCaja, mZocalo, 0, zocalo / 2, 0, ancho + 0.04, zocalo, fondo + 0.04));
  g.add(malla(geoCaja, mPared, 0, zocalo + (alto - zocalo) / 2, 0, ancho, alto - zocalo, fondo));
  // esquineras de madera y moldura entre plantas
  for (const s of [-1, 1]) g.add(malla(geoCaja, mMadera, s * (ancho / 2 - 0.02), alto / 2 + zocalo / 2, zf + 0.005, 0.05, alto - zocalo, 0.03));
  if (plantas === 2) g.add(malla(geoCaja, mMadera, 0, alto * 0.52, zf + 0.008, ancho, 0.045, 0.035));
  g.add(malla(geoCaja, mMadera, 0, alto - 0.025, zf + 0.008, ancho + 0.02, 0.05, 0.035));

  // hastial (triángulo de pared bajo el tejado) con su ventanita de buhardilla
  const pendiente = 0.68;
  const altoTejado = (ancho / 2) * pendiente;
  const tri = new THREE.Shape();
  tri.moveTo(-ancho / 2, 0); tri.lineTo(0, altoTejado); tri.lineTo(ancho / 2, 0); tri.lineTo(-ancho / 2, 0);
  const geoTri = new THREE.ExtrudeGeometry(tri, { depth: fondo * 0.98, bevelEnabled: false });
  geoTri.translate(0, alto, -fondo * 0.49);
  g.add(new THREE.Mesh(geoTri, mPared));
  const cristal = lado.luz("#ffb35c", 3.2);
  const rBuhardilla = Math.min(0.11, ancho * 0.07);
  g.add(malla(new THREE.CylinderGeometry(rBuhardilla + 0.03, rBuhardilla + 0.03, 0.03, 20), mMadera, 0, alto + altoTejado * 0.42, zf - 0.005).rotateX(Math.PI / 2));
  g.add(malla(new THREE.CylinderGeometry(rBuhardilla, rBuhardilla, 0.03, 20), cristal, 0, alto + altoTejado * 0.42, zf + 0.005).rotateX(Math.PI / 2));

  // tejado a dos aguas con alero, tablas de remate y una capa gruesa de nieve
  const vuelo = 0.16;
  const largo = Math.hypot(ancho / 2 + vuelo, altoTejado + vuelo * pendiente) + 0.02;
  const angulo = Math.atan2(altoTejado, ancho / 2);
  for (const s of [-1, 1]) {
    const cx = s * (ancho / 4 + vuelo / 2 - 0.02);
    const cy = alto + altoTejado / 2 - vuelo * pendiente / 2 + 0.05;
    const agua = malla(geoCaja, mTeja, cx, cy, 0, largo, 0.08, fondo + 0.34);
    agua.rotation.z = -s * angulo;
    g.add(agua);
    const remate = malla(geoCaja, mMaderaOscura, cx, cy - 0.01, zf + 0.17, largo, 0.11, 0.035);
    remate.rotation.z = -s * angulo;
    g.add(remate);
    const nieve = malla(geoCaja, mNieve, cx - s * 0.015, cy + 0.075, 0, largo * 0.98, 0.08, fondo + 0.36);
    nieve.rotation.z = -s * angulo;
    g.add(nieve);
    // borde redondeado de la nieve que cuelga del alero
    const borde = malla(new THREE.CylinderGeometry(0.045, 0.045, fondo + 0.36, 10), mNieve, s * (ancho / 2 + vuelo - 0.03), alto - vuelo * pendiente + 0.1, 0);
    borde.rotation.x = Math.PI / 2;
    g.add(borde);
  }

  // chimenea de ladrillo con remate y humo
  const mChimenea = lado.m("#a8533c", "#3a3d45", { ...texturaPBR("castle_brick_02_white", 0.5, 1.1), roughness: 1 });
  const chx = ancho * 0.26;
  const chAlto = altoTejado * 1.05;
  g.add(malla(geoCaja, mChimenea, chx, alto + altoTejado * 0.55 + chAlto / 2 - 0.1, -fondo * 0.12, ancho * 0.13, chAlto, ancho * 0.13));
  const chTop = alto + altoTejado * 0.55 + chAlto - 0.1;
  g.add(malla(geoCaja, mZocalo, chx, chTop + 0.02, -fondo * 0.12, ancho * 0.17, 0.05, ancho * 0.17));
  g.add(malla(geoCaja, mNieve, chx, chTop + 0.06, -fondo * 0.12, ancho * 0.16, 0.035, ancho * 0.16));
  const humo = new THREE.Group();
  humo.position.set(chx, chTop + 0.1, -fondo * 0.12);
  humo.scale.setScalar(Math.max(1, ancho * 0.9));
  for (let i = 0; i < 6; i++) {
    const nube = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaDestello, color: "#c9c4c0", transparent: true, opacity: 0, depthWrite: false }));
    nube.userData.fase = i / 6;
    humo.add(nube);
  }
  humo.userData.feliz = feliz;
  humos.push(humo);
  g.add(humo);

  // ventanas: marco, cuatro cristales con luz, cortinas, contraventanas y alféizar nevado
  const tabla = feliz ? null : matPar("#4a3a2b", "#4a3a2b", { opacidadFria: 1, opacidadCalida: 0 });
  const cortina = lado.m("#8f1d2c", "#1a1c22", { roughness: 0.9 });
  const contraventana = lado.m(elegir(["#2f5a3a", "#6e2a24", "#2d4a6b"]), "#25282e", { roughness: 0.7 });
  const columnas = ancho > 1.25 ? 3 : 2;
  const vw = Math.min(0.3, ancho * 0.15);
  const vh = vw * 1.45;
  const pw = Math.min(0.34, ancho * 0.2);
  const ph = Math.min(0.68, (plantas === 2 ? alto * 0.5 : alto * 0.62) - zocalo);
  const pisos = plantas === 2 ? [zocalo + (alto * 0.52 - zocalo) * 0.55, alto * 0.52 + (alto * 0.48) * 0.48] : [zocalo + (alto - zocalo) * 0.55];
  pisos.forEach((vy, f) => {
    for (let c = 0; c < columnas; c++) {
      const vx = (c - (columnas - 1) / 2) * (ancho / columnas);
      if (f === 0 && (columnas === 3 ? c === 1 : false)) continue; // ahí va la puerta
      const x = columnas === 2 && f === 0 ? vx * 1.25 : vx;          // deja sitio a la puerta
      g.add(malla(geoCaja, mMadera, x, vy, zf + 0.012, vw + 0.06, vh + 0.06, 0.035));
      g.add(malla(geoCaja, cristal, x, vy, zf + 0.026, vw, vh, 0.01));
      g.add(malla(geoCaja, mMadera, x, vy, zf + 0.034, 0.02, vh, 0.012));
      g.add(malla(geoCaja, mMadera, x, vy, zf + 0.034, vw, 0.02, 0.012));
      for (const s of [-1, 1]) {
        g.add(malla(geoCaja, cortina, x + s * vw * 0.36, vy + vh * 0.05, zf + 0.03, vw * 0.24, vh * 0.85, 0.008));
        const cv = malla(geoCaja, contraventana, x + s * (vw / 2 + vw * 0.27 + 0.03), vy, zf + 0.025, vw * 0.5, vh + 0.04, 0.025);
        if (!feliz && s > 0 && (c + f) % 2 === 0) { cv.rotation.z = 0.2; cv.position.y -= 0.03; }
        g.add(cv);
      }
      g.add(malla(geoCaja, mMadera, x, vy - vh / 2 - 0.04, zf + 0.04, vw + 0.14, 0.03, 0.08));
      g.add(malla(geoCaja, mNieve, x, vy - vh / 2 - 0.015, zf + 0.045, vw + 0.12, 0.03, 0.07));
      if (tabla && (f + c) % 2 === 0) {
        const t1 = malla(geoCaja, tabla, x, vy, zf + 0.055, vw * 1.4, 0.05, 0.02);
        t1.rotation.z = 0.55;
        const t2 = t1.clone();
        t2.rotation.z = -0.55;
        g.add(t1, t2);
      }
    }
  });

  // puerta de madera con marco, pomo, corona, escalones, tejadillo y aplique de luz
  const mPuerta = lado.m("#8a5a36", "#2a2b30", { ...texturaPBR("dark_wooden_planks", 0.5, 1), roughness: 0.85 });
  const piso = zocalo;
  g.add(malla(geoCaja, mZocalo, 0, 0.04, zf + 0.12, pw + 0.3, 0.08, 0.24));
  g.add(malla(geoCaja, mZocalo, 0, 0.1, zf + 0.06, pw + 0.18, 0.08, 0.14));
  g.add(malla(geoCaja, mNieve, 0, 0.085, zf + 0.2, pw + 0.32, 0.02, 0.1));
  g.add(malla(geoCaja, mMadera, 0, piso + ph / 2 + 0.02, zf + 0.012, pw + 0.08, ph + 0.05, 0.035));
  g.add(malla(geoCaja, mPuerta, 0, piso + ph / 2, zf + 0.028, pw, ph, 0.02));
  for (const yy of [0.3, 0.72]) g.add(malla(geoCaja, mMaderaOscura, 0, piso + ph * yy, zf + 0.04, pw * 0.8, ph * 0.3, 0.008));
  g.add(malla(geoEsferaBaja, lado.m("#d4af37", "#3a3c42", { metalness: 0.9, roughness: 0.3 }), pw * 0.34, piso + ph * 0.48, zf + 0.05, 0.018));
  g.add(malla(new THREE.TorusGeometry(pw * 0.22, pw * 0.08, 8, 20), lado.m("#1d5c32", "#262a24", { roughness: 0.9 }), 0, piso + ph * 0.75, zf + 0.055));
  g.add(malla(geoEsferaBaja, lado.m(C.rojo, "#2a2b30"), 0, piso + ph * 0.75 - pw * 0.22, zf + 0.065, 0.025));
  const tejadillo = malla(geoCaja, mTeja, 0, piso + ph + 0.12, zf + 0.12, pw + 0.36, 0.05, 0.3);
  tejadillo.rotation.x = 0.35;
  g.add(tejadillo);
  g.add(malla(geoCaja, mNieve, 0, piso + ph + 0.165, zf + 0.11, pw + 0.36, 0.035, 0.3).rotateX(0.35));
  for (const s of [-1, 1]) {
    const mensula = malla(geoCaja, mMaderaOscura, s * (pw / 2 + 0.12), piso + ph + 0.02, zf + 0.08, 0.03, 0.16, 0.03);
    mensula.rotation.x = -0.6;
    g.add(mensula);
  }
  g.add(malla(geoCaja, lado.m("#222", "#1a1b1f", { metalness: 0.6, roughness: 0.4 }), pw / 2 + 0.16, piso + ph * 0.75, zf + 0.04, 0.05, 0.08, 0.05));
  g.add(malla(geoEsferaBaja, lado.luz("#ffd27a", 5), pw / 2 + 0.16, piso + ph * 0.75, zf + 0.07, 0.03));

  // carámbanos colgando del alero
  const nCar = Math.round(ancho * 8);
  for (let k = 0; k < nCar; k++) {
    const l = azar(0.05, 0.2);
    const cono = malla(geoCaramelo, hielo, -ancho / 2 + (k + 0.5) * (ancho / nCar), alto - vuelo * pendiente + 0.04 - l / 2, zf + 0.16, 1.4, l, 1.4);
    cono.rotation.x = Math.PI;
    cono.castShadow = false;
    g.add(cono);
  }
  // guirnalda de luces de colores bajo el alero
  const bombillas = ["#ffd166", "#ff4d4d", "#5aa9ff", "#7dff9a"].map((c) => lado.luz(c, 4));
  const nLuces = Math.round(ancho * 9);
  for (let k = 0; k < nLuces; k++) {
    const x = -ancho / 2 + (k + 0.5) * (ancho / nLuces);
    g.add(malla(geoEsferaBaja, bombillas[k % 4], x, alto - 0.06 - Math.sin(((k % 6) / 6) * Math.PI) * 0.05, zf + 0.06, 0.022));
  }
  return sombras(g);
}

// Abeto realista: verticilos de ramas curvas (caen con el peso y levantan la punta),
// cada rama con tres planos de agujas para darle volumen, un núcleo oscuro que tapa
// los huecos y colores de vértice: más oscuro y frío por dentro, más claro en las puntas.
const materialRamas = new THREE.MeshStandardMaterial({ map: texturaRama, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.35 });
const profundidadRamas = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texturaRama, alphaTest: 0.42 });
const materialNucleo = new THREE.MeshStandardMaterial({ color: "#0b2614", roughness: 1, envMapIntensity: 0.2 });

function ramaCurva(largo, ancho, caida, punta, matriz, tono) {
  const geo = new THREE.PlaneGeometry(largo, ancho, 7, 1);
  geo.translate(largo / 2, 0, 0);
  const pos = geo.attributes.position;
  const colores = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / largo;
    // cae hacia la punta y la última parte se levanta un poco
    pos.setY(i, pos.getY(i) - caida * largo * u * u + punta * largo * Math.max(0, u - 0.75) * 2);
    const luz = tono * (0.72 + u * 0.4);
    colores.set([luz * 0.92, luz, luz * 0.9], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colores, 3));
  geo.computeVertexNormals();
  geo.applyMatrix4(matriz);
  return geo;
}

function geometriaAbeto(alto, radio, densidad = 1) {
  const piezas = [];
  const verticilos = Math.round(alto * 14 * densidad);
  const eje = new THREE.Vector3(1, 0, 0);
  for (let v = 0; v < verticilos; v++) {
    const t = v / verticilos;
    const y = alto * (0.1 + t * 0.87) + azar(-0.03, 0.03);
    const r = radio * Math.pow(1 - t, 1.05) + 0.07;
    const ramas = Math.max(5, Math.round(8 + r * 7));
    const giro = v * 2.4; // ángulo áureo: las ramas no se alinean entre pisos
    const tono = lerp(0.82, 1.12, t) * azar(0.9, 1.08); // abajo más oscuro, arriba más claro
    for (let b = 0; b < ramas; b++) {
      const a = giro + (b / ramas) * Math.PI * 2 + azar(-0.15, 0.15);
      const largo = r * azar(0.9, 1.12);
      const subida = azar(0.08, 0.22) - t * 0.12;         // ángulo de salida
      const caida = azar(0.18, 0.32) * (1 - t * 0.5);      // peso de la nieve
      const qDir = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, subida, "YXZ"));
      for (const giroPlano of [-0.6, 0, 0.6]) {
        const qPlano = new THREE.Quaternion().setFromAxisAngle(eje, -Math.PI / 2 + giroPlano);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), qDir.clone().multiply(qPlano), new THREE.Vector3(1, 1, 1));
        piezas.push(ramaCurva(largo, largo * 0.5, caida, 0.12, m, tono * (giroPlano === 0 ? 1 : 0.85)));
      }
    }
  }
  // copa: brote terminal vertical
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, alto * 0.97, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, Math.PI / 2)), new THREE.Vector3(1, 1, 1));
    piezas.push(ramaCurva(alto * 0.12, alto * 0.07, 0, 0, m, 1.1));
  }
  return mergeGeometries(piezas);
}

const texTronco = texturaPBR("dark_wooden_planks", 0.4, 2);
const materialTronco = mat("#6b4a35", { ...texTronco, roughness: 1 });

const cacheAbetos = new Map();
function crearAbeto(alto, radio, densidad = 1, proyectaSombra = true) {
  const g = new THREE.Group();
  g.add(malla(new THREE.CylinderGeometry(0.035 * alto, 0.07 * alto, alto * 0.35, 8), materialTronco, 0, alto * 0.17, 0));
  const clave = `${alto}|${radio}|${densidad}`;
  if (!cacheAbetos.has(clave)) cacheAbetos.set(clave, geometriaAbeto(alto, radio, densidad));
  const ramas = new THREE.Mesh(cacheAbetos.get(clave), materialRamas);
  ramas.customDepthMaterial = profundidadRamas;
  g.add(ramas);
  // núcleo: un cono oscuro dentro de la copa, para que no se vea el cielo a través
  const nucleo = malla(new THREE.ConeGeometry(radio * 0.55, alto * 0.86, 12), materialNucleo, 0, alto * 0.53, 0);
  nucleo.castShadow = false;
  g.add(nucleo);
  return sombras(g, proyectaSombra);
}

// El gran árbol de Navidad: abeto + bolas que reflejan, luces con brillo y estrella
const lucesArbol = ["#ffd27a", "#ff5a4d", "#7ab8ff", "#fff3d6"].map((c) => mat("#221a10", { emissive: c, emissiveIntensity: 3 }));

function crearArbolNavidad() {
  const g = crearAbeto(4.4, 1.85, 1.15);
  const radioEn = (y) => 1.85 * Math.pow(1 - limitar((y - 0.5) / 3.9, 0, 1), 0.95) * 0.86 + 0.05;
  const coloresBolas = ["#b3121f", "#c9a227", "#1d4e89", "#e8e8e8", "#7a1f5c", "#1f6b3a"];
  for (let i = 0; i < 44; i++) {
    const y = azar(0.7, 3.9);
    const r = radioEn(y);
    const a = azar(-1.4, 1.4);
    const m = new THREE.MeshStandardMaterial({ color: elegir(coloresBolas), metalness: 1, roughness: azar(0.08, 0.35), envMapIntensity: 1.6 });
    g.add(malla(geoEsfera, m, Math.sin(a) * r, y, Math.cos(a) * r, azar(0.07, 0.1)));
  }
  for (let i = 0; i < 140; i++) {
    const t = i / 140;
    const y = 0.6 + t * 3.5;
    const a = t * Math.PI * 12;
    if (Math.cos(a) < -0.35) continue;
    const r = radioEn(y) * 1.02;
    g.add(malla(geoEsferaBaja, lucesArbol[i % 4], Math.sin(a) * r, y, Math.cos(a) * r, 0.032));
  }
  // cadena de cuentas doradas
  const oro = new THREE.MeshStandardMaterial({ color: "#d4a93a", metalness: 1, roughness: 0.25, envMapIntensity: 1.5 });
  for (let i = 0; i < 260; i++) {
    const t = i / 260;
    const y = 0.75 + t * 3.2;
    const a = t * Math.PI * 8 + 1;
    if (Math.cos(a) < -0.3) continue;
    const r = radioEn(y) * 1.03;
    g.add(malla(geoEsferaBaja, oro, Math.sin(a) * r, y - Math.abs(Math.sin(a * 2)) * 0.05, Math.cos(a) * r, 0.018));
  }
  // estrella dorada
  const forma = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.13 : 0.3;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    i ? forma.lineTo(Math.cos(a) * r, Math.sin(a) * r) : forma.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const estrella = malla(new THREE.ExtrudeGeometry(forma, { depth: 0.06, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 3 }),
    new THREE.MeshStandardMaterial({ color: "#ffd166", metalness: 1, roughness: 0.2, emissive: "#ffb000", emissiveIntensity: 2.2, envMapIntensity: 1.5 }), 0, 4.75, -0.03);
  g.add(estrella);
  g.userData.estrella = estrella;
  const luz = new THREE.PointLight("#ffc96b", 3, 4, 1.8);
  luz.position.set(0, 2.2, 1.6);
  g.add(luz);
  // falda de terciopelo rojo con ribete dorado bajo el árbol
  const falda = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.04, 40, 1, false), new THREE.MeshPhysicalMaterial({ color: "#7a0d18", roughness: 0.8, sheen: 1, sheenColor: new THREE.Color("#ff6a6a"), envMapIntensity: 0.4 }));
  falda.position.y = 0.02;
  falda.receiveShadow = true;
  g.add(falda);
  g.add(malla(new THREE.TorusGeometry(1.22, 0.025, 6, 48), new THREE.MeshStandardMaterial({ color: "#d4a93a", metalness: 1, roughness: 0.3 }), 0, 0.04, 0).rotateX(Math.PI / 2));
  // regalos bajo el árbol (viajan con él)
  [[-0.8, 0.5, 0.42], [-0.25, 0.75, 0.55], [0.4, 0.62, 0.45], [0.95, 0.45, 0.34], [-0.3, 0.75, 0.3, 0.55]].forEach(([x, z, t, y = 0], i) => {
    const r = crearRegalo(i);
    r.scale.setScalar(t);
    r.position.set(x, y + t / 2, z);
    r.rotation.y = azar(-0.5, 0.5);
    g.add(r);
  });
  return g;
}

// Corteza de madera muerta: vetas largas y retorcidas, gris azulado con cantos más claros
const texturaCorteza = lienzoTextura(256, 512, (ctx, w, h) => {
  ctx.fillStyle = "#5a6272";
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 260; k++) {
    let x = azar(0, w);
    const claro = Math.random() < 0.35;
    ctx.strokeStyle = claro ? `rgba(200, 208, 220, ${azar(0.15, 0.45)})` : `rgba(18, 22, 30, ${azar(0.3, 0.7)})`;
    ctx.lineWidth = claro ? azar(0.8, 2.2) : azar(1.5, 4.5);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= h; y += 16) {
      x += Math.sin(y * 0.02 + k) * 1.6 + azar(-1.2, 1.2);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
});
texturaCorteza.wrapS = texturaCorteza.wrapT = THREE.RepeatWrapping;

// Tubo que se afina a lo largo de una curva, con la sección algo irregular (madera nudosa)
function tuboAfinado(curva, r0, r1, segmentos = 24, lados = 9, giro = 0) {
  const marcos = curva.computeFrenetFrames(segmentos, false);
  const posiciones = [], uvs = [], indices = [];
  for (let i = 0; i <= segmentos; i++) {
    const t = i / segmentos;
    const centro = curva.getPointAt(t);
    const r = lerp(r0, r1, Math.pow(t, 0.8)) * (1 + Math.sin(t * 19 + r0 * 40) * 0.06);
    for (let j = 0; j <= lados; j++) {
      const a = (j / lados) * Math.PI * 2 + t * giro;
      const bulto = 1 + Math.sin(a * 3 + t * 7) * 0.1 + Math.sin(a * 5 - t * 11) * 0.05; // vetas en relieve
      const n = marcos.normals[i].clone().multiplyScalar(Math.cos(a)).add(marcos.binormals[i].clone().multiplyScalar(Math.sin(a)));
      const v = centro.clone().addScaledVector(n, r * bulto);
      posiciones.push(v.x, v.y, v.z);
      uvs.push(j / lados, t * curva.getLength() * 1.2);
    }
  }
  for (let i = 0; i < segmentos; i++) {
    for (let j = 0; j < lados; j++) {
      const a = i * (lados + 1) + j, b = a + lados + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Árbol seco: un pino muerto. Tronco recto que se afina hasta la punta, pisos de ramas
// desnudas que salen en círculo, caen por su peso y se acortan hacia arriba (silueta de
// abeto), con ramitas secas en las puntas, algunas ramas partidas y raíces en el suelo.
function crearArbolSeco() {
  const g = new THREE.Group();
  const madera = matPar("#e2e7ef", "#e2e7ef", { map: texturaCorteza, opacidadFria: 1, opacidadCalida: 0, roughness: 0.85, entornoFrio: 1.6, emissive: "#2a3448", emisivoFrio: 0.9, emisivoCalido: 0 });
  const piezas = [];
  const ALTO = 4.6, BASE = 0.24;

  // tronco: casi recto, con una ligera ondulación
  const puntosTronco = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    puntosTronco.push(new THREE.Vector3(Math.sin(t * 5) * 0.03, t * ALTO, Math.cos(t * 4) * 0.02));
  }
  const tronco = new THREE.CatmullRomCurve3(puntosTronco);
  piezas.push(tuboAfinado(tronco, BASE, 0.012, 40, 10, 2));

  // una rama: sale casi horizontal, se curva hacia abajo y deja ramitas secas
  function rama(origen, angulo, largo, grosor, caida) {
    const dir = new THREE.Vector3(Math.cos(angulo), azar(0.05, 0.2), Math.sin(angulo) * 0.75);
    const pts = [origen.clone()];
    let p = origen.clone();
    for (let k = 1; k <= 4; k++) {
      dir.y -= caida * 0.45;
      p = p.clone().addScaledVector(dir.clone().normalize(), largo / 4);
      pts.push(p);
    }
    const curva = new THREE.CatmullRomCurve3(pts);
    piezas.push(tuboAfinado(curva, grosor, 0.006, 10, 6, 0.5));
    // ramitas secas a lo largo de la rama
    const ramitas = Math.max(2, Math.round(largo * 5));
    for (let k = 0; k < ramitas; k++) {
      const t = azar(0.35, 0.95);
      const ini = curva.getPointAt(t);
      const tg = curva.getTangentAt(t);
      const lado = new THREE.Vector3(-tg.z, 0, tg.x).multiplyScalar(k % 2 ? 1 : -1);
      const fin = ini.clone().addScaledVector(tg, largo * 0.12).addScaledVector(lado, largo * azar(0.1, 0.2)).add(new THREE.Vector3(0, azar(-0.08, 0.04), 0));
      piezas.push(tuboAfinado(new THREE.CatmullRomCurve3([ini, ini.clone().lerp(fin, 0.5).add(new THREE.Vector3(0, 0.02, 0)), fin]), grosor * 0.45, 0.003, 4, 4, 0));
    }
  }

  // pisos de ramas (verticilos), más cortos cuanto más arriba
  const pisos = 13;
  for (let v = 0; v < pisos; v++) {
    const t = v / pisos;
    const y = ALTO * (0.2 + t * 0.74);
    const largo = (1 - t) * 1.65 + 0.18;
    const cuantas = Math.max(3, Math.round(6 - t * 2));
    const giro = v * 2.4;
    for (let b = 0; b < cuantas; b++) {
      if (Math.random() < 0.15) continue; // huecos: ramas que se cayeron
      const partida = Math.random() < 0.2; // ramas partidas, más cortas
      const origen = tronco.getPointAt(y / ALTO);
      rama(origen, giro + (b / cuantas) * Math.PI * 2 + azar(-0.25, 0.25), largo * (partida ? 0.4 : azar(0.8, 1.1)), BASE * (1 - t) * 0.45 + 0.022, azar(0.25, 0.45) * (1 - t * 0.5));
    }
  }

  // raíces que asoman en el suelo
  for (let r = 0; r < 6; r++) {
    const a = (r / 6) * Math.PI * 2 + azar(-0.2, 0.2);
    const largo = azar(0.45, 0.8);
    const pts = [];
    for (let k = 0; k <= 3; k++) {
      const t = k / 3, d = 0.12 + t * largo;
      pts.push(new THREE.Vector3(Math.cos(a) * d, 0.16 * (1 - t) * (1 - t) - 0.02, Math.sin(a) * d * 0.7));
    }
    piezas.push(tuboAfinado(new THREE.CatmullRomCurve3(pts), 0.085, 0.006, 10, 6, 0.5));
  }

  const geo = mergeGeometries(piezas.map((p) => {
    const g2 = p.index ? p.toNonIndexed() : p;
    if (!g2.attributes.uv) g2.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2));
    return g2;
  }));
  g.add(new THREE.Mesh(geo, madera));
  return sombras(g);
}

// Modelos reales de Poly Haven (farolas, farol, caja de cartón)
const gltf = new GLTFLoader();
const PROPIEDADES_TEXTURA = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"];
function cargarModelo(nombre, alListo, intento = 0) {
  encolar((listo) => gltf.load(`${RUTA}modelos/${nombre}/${nombre}_1k.gltf`, (r) => {
    listo();
    // si alguna textura del modelo no llegó, se quita (en vez de avisar en cada fotograma)
    r.scene.traverse((m) => {
      if (!m.isMesh) return;
      PROPIEDADES_TEXTURA.forEach((clave) => {
        const t = m.material[clave];
        if (t && !t.image) { m.material[clave] = null; m.material.needsUpdate = true; }
      });
    });
    alListo(sombras(r.scene));
  }, undefined, () => { listo(); if (intento < 3) setTimeout(() => cargarModelo(nombre, alListo, intento + 1), 800); }));
}

/* ---------- 7. Niños ---------- */

const geoPierna = new THREE.CapsuleGeometry(0.07, 0.32, 4, 10);
const geoBrazo = new THREE.CapsuleGeometry(0.06, 0.3, 4, 10);
const geoAbrigo = new THREE.CylinderGeometry(0.19, 0.3, 0.62, 22);
const geoGorro = new THREE.SphereGeometry(0.265, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2);
const geoBoca = new THREE.TorusGeometry(0.07, 0.016, 8, 18, Math.PI);

function telaMat(color) {
  return new THREE.MeshStandardMaterial({ color, map: texturaPunto, roughness: 1, envMapIntensity: 0.4 });
}

function crearNino({ feliz, triste, regalo = 0, mejillas = "#e07b8f", lagrima = false, inclinacion = 0.15 }, siempreFeliz) {
  const mats = {};
  const tonos = {};
  for (const clave of ["abrigo", "piel", "gorro", "banda", "bufanda"]) {
    const inicial = siempreFeliz ? feliz[clave] : triste[clave];
    mats[clave] = clave === "piel"
      ? new THREE.MeshPhysicalMaterial({ color: inicial, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color("#ffd9c4"), envMapIntensity: 0.4 })
      : telaMat(inicial);
    tonos[clave] = [new THREE.Color(triste ? triste[clave] : feliz[clave]), new THREE.Color(feliz[clave])];
  }
  const ojos = new THREE.MeshPhysicalMaterial({ color: "#14110f", roughness: 0.1, clearcoat: 1 });
  const pantalon = telaMat("#2a2d36");
  const botas = mat("#3a2418", { roughness: 0.5 });

  const raiz = new THREE.Group();
  const cuerpo = new THREE.Group();
  raiz.add(cuerpo);
  const piernas = [-1, 1].map((s) => {
    const b = new THREE.Group();
    b.position.set(s * 0.1, 0.45, 0);
    b.add(malla(geoPierna, pantalon, 0, -0.22, 0));
    b.add(malla(geoEsfera, botas, 0, -0.44, 0.04, 0.095, 0.075, 0.13));
    cuerpo.add(b);
    return b;
  });
  cuerpo.add(malla(geoAbrigo, mats.abrigo, 0, 0.76, 0));
  for (let i = 0; i < 3; i++) cuerpo.add(malla(geoEsferaBaja, mat("#e9e2d3", { roughness: 0.4 }), 0, 0.92 - i * 0.14, 0.215 + i * 0.022, 0.022));
  cuerpo.add(malla(new THREE.TorusGeometry(0.17, 0.06, 10, 20), mats.bufanda, 0, 1.06, 0).rotateX(Math.PI / 2));
  cuerpo.add(malla(geoCaja, mats.bufanda, 0.08, 0.92, 0.2, 0.09, 0.22, 0.04).rotateZ(0.15));
  const brazos = [-1, 1].map((s) => {
    const b = new THREE.Group();
    b.position.set(s * 0.25, 1.0, 0);
    b.add(malla(geoBrazo, mats.abrigo, 0, -0.2, 0));
    b.add(malla(geoEsfera, mats.bufanda, 0, -0.42, 0, 0.075));
    cuerpo.add(b);
    return b;
  });
  const regaloMano = crearRegalo(regalo);
  regaloMano.scale.setScalar(0.32);
  regaloMano.position.set(0, 0.86, 0.34);
  cuerpo.add(regaloMano);

  const cuello = new THREE.Group();
  cuello.position.set(0, 1.08, 0);
  cuerpo.add(cuello);
  cuello.add(malla(geoEsfera, mats.piel, 0, 0.26, 0, 0.25));
  for (const s of [-1, 1]) cuello.add(malla(geoEsfera, mats.piel, s * 0.245, 0.25, 0, 0.05, 0.07, 0.04));
  cuello.add(malla(geoEsferaBaja, mats.piel, 0, 0.23, 0.245, 0.035, 0.03, 0.03));
  cuello.add(malla(geoGorro, mats.gorro, 0, 0.34, -0.01, 1, 1.18, 1).rotateX(-0.1));
  cuello.add(malla(new THREE.TorusGeometry(0.25, 0.06, 10, 24), mats.banda, 0, 0.37, 0).rotateX(Math.PI / 2 - 0.1));
  cuello.add(malla(geoEsfera, mats.banda, 0, 0.69, -0.06, 0.085));
  for (const s of [-1, 1]) {
    cuello.add(malla(geoEsfera, mat("#ffffff", { roughness: 0.2 }), s * 0.085, 0.3, 0.215, 0.04, 0.045, 0.02));
    cuello.add(malla(geoEsfera, ojos, s * 0.085, 0.3, 0.232, 0.026));
    cuello.add(malla(geoEsferaBaja, mat("#ffffff", { emissive: "#ffffff", emissiveIntensity: 0.4 }), s * 0.085 + 0.009, 0.31, 0.255, 0.008));
  }
  cuello.add(malla(geoEsfera, mat("#e8907a", { roughness: 0.5 }), 0, 0.235, 0.25, 0.032, 0.026, 0.026));
  const boca = malla(geoBoca, mat("#5a1f22"), 0, 0.15, 0.235);
  cuello.add(boca);
  const mejilla = mat(mejillas, { transparent: true, opacity: 0 });
  for (const s of [-1, 1]) cuello.add(malla(geoEsferaBaja, mejilla, s * 0.15, 0.19, 0.2, 0.045, 0.032, 0.015));
  const ceja = mat("#3a2a20", { transparent: true, opacity: 0 });
  for (const s of [-1, 1]) {
    const c = malla(geoCaja, ceja, s * 0.09, 0.385, 0.228, 0.08, 0.016, 0.01);
    c.rotation.z = s * -0.35;
    cuello.add(c);
  }
  const lagrimas = [-1, 1, -1, 1].map((s, i) => {
    const l = malla(geoEsferaBaja, new THREE.MeshPhysicalMaterial({ color: "#bfe3ff", roughness: 0, clearcoat: 1, transparent: true, opacity: 0, emissive: "#5a8fc8", emissiveIntensity: 0.6 }), s * 0.085, 0.26, 0.235, 0.022, 0.032, 0.018);
    l.userData.fase = i * 0.28;
    cuello.add(l);
    return l;
  });
  sombras(raiz);

  const n = { raiz, cuerpo, piernas, brazos, cuello, boca, mejilla, ceja, lagrimas, regaloMano, mats, tonos, alegria: siempreFeliz ? 1 : 0, objetivo: siempreFeliz ? 1 : 0, siempreFeliz, inclinacion, lagrima, muyTriste: false, salto: 0, temporizador: null };
  poseNino(n, 0);
  return n;
}

function poseNino(n, tiempo) {
  const p = suave(n.alegria);
  n.cuerpo.position.y = lerp(-0.36, 0, p);
  n.piernas.forEach((b) => { b.rotation.x = lerp(-1.35, 0, p); });
  n.brazos.forEach((b, i) => {
    const s = i === 0 ? -1 : 1;
    b.rotation.x = lerp(-0.75, -1.05, p);
    b.rotation.z = lerp(-s * 0.35, -s * 0.12, p);
  });
  const llanto = n.muyTriste && p < 0.3 ? 1 : 0;
  n.cuello.rotation.x = lerp(0.3 + llanto * 0.1, 0, p);
  n.cuello.rotation.z = lerp(n.inclinacion * (1 + llanto), 0, p);
  n.boca.rotation.z = p > 0.5 ? Math.PI : 0;
  n.boca.scale.set(1, llanto ? 1.6 : 1, 1);
  n.mejilla.opacity = limitar((p - 0.5) * 2, 0, 0.8);
  n.ceja.opacity = limitar(1 - p * 2, 0, 1);
  n.lagrimas.forEach((l, i) => {
    const visible = (llanto || (n.lagrima && i < 1)) && p < 0.3;
    const ciclo = llanto ? ((tiempo * 0.9 + l.userData.fase) % 1) : 0.3;
    l.position.y = 0.26 - ciclo * 0.17;
    l.material.opacity = visible ? (llanto ? 1 - ciclo : 0.9) : 0;
  });
  if (!n.siempreFeliz) n.regaloMano.scale.setScalar(0.32 * limitar((p - 0.4) / 0.6, 0, 1));
  for (const clave in n.mats) n.mats[clave].color.lerpColors(n.tonos[clave][0], n.tonos[clave][1], p);
  n.cuerpo.position.y += llanto ? Math.abs(Math.sin(tiempo * 9)) * 0.022 : 0;
  if (n.salto > 0) {
    const t = 1 - n.salto / 1.1;
    n.cuerpo.position.y += t < 0.5 ? Math.max(0, Math.sin(t * 2 * Math.PI) * 0.35) : 0;
    const vuelo = t > 0.2 && t < 0.85 ? Math.sin(((t - 0.2) / 0.65) * Math.PI) * 1.1 : 0;
    n.regaloMano.position.y = 0.86 + vuelo;
    n.regaloMano.rotation.x = vuelo * 3;
    n.brazos.forEach((b) => { b.rotation.x = lerp(-1.05, -2.7, Math.min(1, vuelo * 2)); });
  } else {
    n.regaloMano.position.y = 0.86;
    n.regaloMano.rotation.x = 0;
  }
}

/* ---------- 8. El mundo ---------- */

// Cielo pintado, muy al fondo (no le afecta la niebla)
const ZCIELO = -14;
const kCielo = (D - ZCIELO) / D;
function planoCielo(textura, x0, x1, opacidad = 1) {
  const plano = new THREE.Mesh(
    new THREE.PlaneGeometry((x1 - x0) * kCielo, 12 * kCielo * 1.04),
    new THREE.MeshBasicMaterial({ map: textura, transparent: opacidad < 1, opacity: opacidad, depthWrite: false, fog: false })
  );
  plano.position.set(((x0 + x1) / 2) * kCielo, 0, ZCIELO);
  return plano;
}
const texCieloFeliz = texturaCielo(true);
const cieloFeliz = planoCielo(texCieloFeliz, -4.24, 0);
const cieloTriste = planoCielo(texturaCielo(false), 0, 4.24);
const cieloTristeCalido = planoCielo(texCieloFeliz, 0, 4.24, 0.0001);
cieloTristeCalido.position.z += 0.01;
escena.add(cieloFeliz, cieloTriste, cieloTristeCalido);

// Lunas con cráteres y halo
// Luna: esfera 3D con el mapa real de la superficie lunar (NASA, LRO · dominio público),
// iluminada desde arriba a la izquierda: la cara derecha queda en sombra, como en una foto.
function crearLuna(px, py) {
  const g = new THREE.Group();
  g.position.copy(enPantalla(px, py, -12));
  const k = (D + 12) / D;
  const radio = 0.6 * k; // unos 120 px de diámetro en el cartel
  const halo = (escala, color, opacidad) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaDestello, color, transparent: true, opacity: opacidad, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(radio * escala);
    sp.position.z = -radio * 1.2;
    return sp;
  };
  g.add(halo(4.2, "#ffe9c2", 0.16), halo(2.5, "#fff6e4", 0.28));
  const mapa = new THREE.Texture();
  mapa.colorSpace = THREE.SRGBColorSpace;
  mapa.anisotropy = anisotropia;
  cargarImagen(`${RUTA}texturas/luna_nasa_color.jpg`).then((imagen) => { mapa.image = imagen; mapa.needsUpdate = true; }).catch(() => {});
  const material = new THREE.ShaderMaterial({
    uniforms: { mapa: { value: mapa }, uLuz: { value: new THREE.Vector3(-0.62, 0.42, 0.66).normalize() }, uBrillo: { value: 0.88 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D mapa;
      uniform vec3 uLuz;
      uniform float uBrillo;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vec3 color = texture2D(mapa, vUv).rgb;
        float ndl = dot(normalize(vNormal), uLuz);
        float luz = smoothstep(-0.25, 0.55, ndl);       // terminador suave
        float borde = pow(max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 0.35);
        vec3 sombra = color * 0.07;                     // la cara oscura apenas se intuye
        gl_FragColor = vec4(mix(sombra, color * uBrillo * (0.75 + 0.25 * borde), luz), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
  const esfera = new THREE.Mesh(new THREE.SphereGeometry(radio, 64, 48), material);
  esfera.rotation.set(0.1, -Math.PI / 2, 0.3); // la cara visible de la Luna, algo inclinada
  g.add(esfera);
  return g;
}
// Una sola luna, en el cielo de la Navidad feliz
escena.add(crearLuna(300, 545));

// Suelo nevado con dunas suaves (textura fotográfica); el del lado oscuro es gris y se aclara al donar.
// Es mucho más ancho y profundo de lo que se ve, para que su borde nunca asome en los laterales.
const SUELO_ANCHO = 10;  // por cada lado (de 0 a ±10)
const SUELO_FONDO = 26;  // de z = +4 a z = -22
function crearSuelo(lado, x0) {
  const geo = new THREE.PlaneGeometry(SUELO_ANCHO, SUELO_FONDO, 120, 200);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + x0, z = pos.getZ(i) - 9;
    const plano = limitar((z + 1.5) / 3, 0, 1); // delante (donde están los niños) casi plano
    pos.setY(i, fbm(x * 0.8, z * 0.8) * 0.25 * (1 - plano) + fbm(x * 3, z * 3) * 0.02);
  }
  geo.computeVertexNormals();
  const tex = texturaPBR("snow_02", 9, 24);
  const m = lado.m("#ffffff", "#6f7787", { ...tex, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
  const suelo = new THREE.Mesh(geo, m);
  suelo.position.set(x0, SUELO, -9);
  suelo.receiveShadow = true;
  return suelo;
}
escena.add(crearSuelo(LADO_FELIZ, -SUELO_ANCHO / 2), crearSuelo(LADO_TRISTE, SUELO_ANCHO / 2));

// Pueblos
function construirPueblo(lado, dx) {
  const g = new THREE.Group();
  const espejo = (x) => (dx > 0 ? -x : x);
  // colina del fondo
  const colina = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), lado.m("#f2f0f4", "#5a6070", { ...texturaPBR("snow_02", 6, 3), roughness: 1 }));
  colina.scale.set(4.2, 1.25, 1.8);
  colina.position.set(dx * 2.4, -3.5, -8.4);
  colina.receiveShadow = true;
  g.add(colina);
  // loma más ancha detrás, que llega hasta más allá de los bordes del cartel
  const loma = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 20), colina.material);
  loma.scale.set(8, 1.0, 2.2);
  loma.position.set(dx * 5, -3.6, -11.5);
  loma.receiveShadow = true;
  g.add(loma);

  const paredes = [
    { pared: "castle_brick_02_white", tono: "#f4ead8" }, { pared: "dark_wooden_planks", tono: "#c98f62" },
    { pared: "castle_brick_02_white", tono: "#d9a48a" }, { pared: "dark_wooden_planks", tono: "#a8c4a0" },
    { pared: "castle_brick_02_white", tono: "#ffffff" },
  ];
  // casas lejanas en la colina
  [[-3.75, -2.45, 1.0, 0.95], [-2.6, -2.4, 0.9, 0.85], [-1.6, -2.45, 0.85, 1.0]].forEach(([x, y, ancho, alto], i) => {
    const p = paredes[i % paredes.length];
    const casa = crearCasa(lado, { ancho, alto, fondo: 0.8, pared: p.pared, tono: p.tono, tonoFrio: "#3a3e48", plantas: 1 });
    casa.position.set(espejo(x), y, -7.6);
    casa.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    g.add(casa);
  });
  // iglesia con torre
  const iglesia = new THREE.Group();
  const piedra = lado.m("#efe6d6", "#3a3e48", { ...texturaPBR("castle_brick_02_white", 1, 3), roughness: 1 });
  iglesia.add(malla(geoCaja, piedra, 0, 1.0, 0, 0.5, 2.0, 0.5));
  iglesia.add(malla(new THREE.ConeGeometry(0.4, 0.9, 4), lado.m("#5a2a22", "#23262e", { ...texturaPBR("clay_roof_tiles_02", 1, 1) }), 0, 2.45, 0).rotateY(Math.PI / 4));
  iglesia.add(malla(geoCaja, lado.luz("#ffc46b", 3), 0, 1.35, 0.255, 0.14, 0.26, 0.01));
  iglesia.add(malla(geoCaja, lado.luz("#ffc46b", 3), 0, 0.7, 0.255, 0.14, 0.26, 0.01));
  iglesia.add(malla(new THREE.OctahedronGeometry(0.1), lado.luz("#ffd166", 6), 0, 3.05, 0));
  sombras(iglesia);
  iglesia.position.set(espejo(-0.6), -2.6, -8.1);
  g.add(iglesia);
  // casas del pueblo, en primer término
  [[-4.35, 1.6, 1.75, -4.8], [-2.6, 1.45, 1.5, -5.4], [-0.95, 1.5, 1.85, -4.8]].forEach(([x, ancho, alto, z], i) => {
    const p = paredes[(i * 2 + 1) % paredes.length];
    const casa = crearCasa(lado, { ancho, alto, fondo: 1.2, pared: p.pared, tono: p.tono, tonoFrio: "#3b3f4a" });
    casa.position.set(espejo(x), SUELO, z);
    g.add(casa);
  });
  // abetos alrededor del pueblo
  [[-3.1, -2.42, -7.3, 0.8], [-2.1, -2.45, -7.4, 0.7], [-3.45, SUELO, -3.6, 1.4], [-1.75, SUELO, -3.7, 1.2], [-4.6, SUELO, -2.9, 1.3]].forEach(([x, y, z, h]) => {
    const abeto = crearAbeto(h, h * 0.38, 0.5, false);
    abeto.position.set(espejo(x), y, z);
    if (!lado.feliz) abeto.traverse((m) => { if (m.isMesh && m.material === materialRamas) m.material = materialRamasFrias; });
    g.add(abeto);
  });
  // farolas reales (Poly Haven)
  [[-2.85, -3.4], [-0.3, -3.3]].forEach(([x, z]) => {
    cargarModelo("street_lamp_01", (lamp) => {
      lamp.scale.setScalar(0.5);
      lamp.position.set(espejo(x), SUELO, z);
      if (!lado.feliz) lamp.rotation.z = -0.08;
      lamp.traverse((m) => {
        if (m.isMesh && /bulb|glass/.test(m.material.name)) {
          m.material = lado.feliz
            ? mat("#ffe2a8", { emissive: "#ffc46b", emissiveIntensity: 6 })
            : matPar("#1a1c22", "#ffe2a8", { emissive: "#ffc46b", emisivoFrio: 0, emisivoCalido: 6 });
        }
      });
      g.add(lamp);
    });
  });
  // vecinos del pueblo
  [["#c8102e", "#f2c6a0", -3.3, -2.9], ["#1d4e89", "#8d5524", -2.9, -3.1], ["#1f6b3a", "#e0ac69", -1.75, -2.8], ["#c9a227", "#b97a56", -0.95, -3.0], ["#7a1f5c", "#f2c6a0", -0.3, -2.7]].forEach(([color, piel, x, z]) => {
    const v = crearVecino(lado, color, piel);
    v.position.set(espejo(x), SUELO, z);
    g.add(v);
  });
  return g;
}

// Ramas apagadas y nevadas para los abetos del lado oscuro
const materialRamasFrias = matPar("#5a6866", "#ffffff", { map: texturaRama, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.95, envMapIntensity: 0.3 });

function crearVecino(lado, color, piel) {
  const g = new THREE.Group();
  const ropa = lado.feliz ? telaMat(color) : matPar("#2e3139", color, { map: texturaPunto, roughness: 1 });
  const cara = lado.m(piel, "#5e554d");
  g.add(malla(new THREE.CylinderGeometry(0.075, 0.11, 0.3, 12), ropa, 0, 0.22, 0));
  g.add(malla(geoEsfera, cara, 0, 0.44, lado.feliz ? 0 : 0.04, 0.08));
  g.add(malla(new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), ropa, 0, 0.47, lado.feliz ? 0 : 0.04));
  for (const s of [-1, 1]) {
    const b = malla(new THREE.CapsuleGeometry(0.022, 0.15, 3, 6), ropa, s * 0.11, lado.feliz ? 0.4 : 0.22, 0);
    b.rotation.z = lado.feliz ? s * -0.5 : s * 0.15;
    g.add(b);
  }
  if (!lado.feliz) g.rotation.x = 0.35;
  g.scale.setScalar(1.15);
  return sombras(g);
}

escena.add(construirPueblo(LADO_FELIZ, -1));
escena.add(construirPueblo(LADO_TRISTE, 1));

// Árboles protagonistas
const ARBOL_X = enPantalla(212, 0, -0.8).x;
const arbolFeliz = crearArbolNavidad();
arbolFeliz.position.set(ARBOL_X, SUELO, -0.8);
escena.add(arbolFeliz);
const arbolSeco = crearArbolSeco();
arbolSeco.position.set(-ARBOL_X, SUELO, -0.8);
escena.add(arbolSeco);

// Caja de cartón vacía (modelo real de Poly Haven)
const cajaVacia = new THREE.Group();
cajaVacia.position.set(enPantalla(640, 0, 0.9).x, SUELO + 0.22, 0.9);
cajaVacia.rotation.y = 0.5;
escena.add(cajaVacia);
const materialesCaja = [];
cargarModelo("cardboard_box_01", (caja) => {
  caja.scale.setScalar(1.25);
  caja.traverse((m) => {
    if (m.isMesh) {
      m.material = m.material.clone();
      m.material.transparent = true;
      materialesCaja.push(m.material);
    }
  });
  cajaVacia.add(caja);
});

// Faroles de latón (Poly Haven) junto a la puerta de las casas cercanas del lado feliz
[[-4.35, -3.9], [-0.95, -3.9]].forEach(([x, z]) => {
  cargarModelo("Lantern_01", (farol) => {
    farol.scale.setScalar(1.3);
    farol.position.set(x + 0.42, SUELO, z);
    farol.traverse((m) => { if (m.isMesh && /glass/i.test(m.material.name)) m.material = mat("#ffe2a8", { emissive: "#ffb35c", emissiveIntensity: 5, transparent: true, opacity: 0.85 }); });
    escena.add(farol);
  });
});

// Niños
const FELICES = [
  { px: 70, z: 0.2, e: 1, feliz: { abrigo: "#b3121f", piel: "#f2c6a0", gorro: "#f2e6c9", banda: "#b3121f", bufanda: "#f2e6c9" }, regalo: 0, destino: 448 },
  { px: 360, z: 0.2, e: 1, feliz: { abrigo: "#c9a227", piel: "#b97a56", gorro: "#1f6b3a", banda: "#f2e6c9", bufanda: "#1f6b3a" }, regalo: 1, destino: 650 },
  { px: 140, z: 0.95, e: 0.86, feliz: { abrigo: "#1d4e89", piel: "#8d5524", gorro: "#c9a227", banda: "#f2e6c9", bufanda: "#b3121f" }, regalo: 2, mejillas: "#b0566a", destino: 640 },
  { px: 300, z: 0.95, e: 0.86, feliz: { abrigo: "#23867a", piel: "#e0ac69", gorro: "#b3121f", banda: "#f2e6c9", bufanda: "#c9a227" }, regalo: 3, destino: 818 },
];
const TRISTES = [
  { px: 494, z: 0.2, e: 1, triste: { abrigo: "#4a3a40", piel: "#a88a73", gorro: "#4a4f5a", banda: "#4a3a40", bufanda: "#3a3f4a" }, feliz: { abrigo: "#7b4bb5", piel: "#f2c6a0", gorro: "#c9a227", banda: "#b3121f", bufanda: "#1f6b3a" }, regalo: 4, lagrima: true, inclinacion: 0.15 },
  { px: 784, z: 0.2, e: 1, triste: { abrigo: "#45412f", piel: "#7a5c48", gorro: "#26352c", banda: "#4a4f5a", bufanda: "#26352c" }, feliz: { abrigo: "#b3121f", piel: "#b97a56", gorro: "#1d4e89", banda: "#f2e6c9", bufanda: "#c9a227" }, regalo: 5, inclinacion: -0.15 },
  { px: 564, z: 0.95, e: 0.86, triste: { abrigo: "#2e3a50", piel: "#5e4637", gorro: "#3a3f4a", banda: "#2e3a50", bufanda: "#45412f" }, feliz: { abrigo: "#e0702c", piel: "#8d5524", gorro: "#1f6b3a", banda: "#f2e6c9", bufanda: "#1d4e89" }, regalo: 2, mejillas: "#b0566a", lagrima: true, inclinacion: -0.12 },
  { px: 724, z: 0.95, e: 0.86, triste: { abrigo: "#243b38", piel: "#9c8068", gorro: "#4a3a40", banda: "#3a3f4a", bufanda: "#2e3a50" }, feliz: { abrigo: "#d64a86", piel: "#e0ac69", gorro: "#c9a227", banda: "#f2e6c9", bufanda: "#23867a" }, regalo: 1, inclinacion: 0.12 },
];

const ninosFelices = FELICES.map((d) => {
  const n = crearNino({ feliz: d.feliz, regalo: d.regalo, mejillas: d.mejillas }, true);
  n.casa = enPantalla(d.px, 0, d.z).x;
  n.destino = enPantalla(d.destino, 0, d.z).x;
  n.raiz.position.set(n.casa, SUELO, d.z);
  n.raiz.scale.setScalar(d.e);
  n.escala = d.e;
  escena.add(n.raiz);
  return n;
});
const ninosTristes = TRISTES.map((d) => {
  const n = crearNino(d, false);
  n.raiz.position.set(enPantalla(d.px, 0, d.z).x, SUELO, d.z);
  n.raiz.scale.setScalar(d.e);
  n.escala = d.e;
  escena.add(n.raiz);
  return n;
});

/* ---------- 9. Lema 3D y estrella de donar ---------- */

const letras = [];
const LEMA_Z = 0.8;
const matLetraCanto = new THREE.MeshStandardMaterial({ color: "#6a0f1c", roughness: 0.35, metalness: 0.2, envMapIntensity: 0.8 });

// Las letras que cruzan la línea central se parten en dos: lo que queda a la derecha
// (x > 0 en el mundo, que es justo el centro del cartel) se pinta apagado, píxel a píxel.
// uEncendido: 0 = apagado · 1 = como en el lado feliz (al donar o bajo la luz del cursor).
const encendidoCanto = { value: 0 };
function partirPorLado(material, colorApagado, uniformeEncendido) {
  const apagado = { value: new THREE.Color(colorApagado) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uApagado = apagado;
    shader.uniforms.uEncendido = uniformeEncendido;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
varying float vMundoX;`)
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
vMundoX = (modelMatrix * vec4(transformed, 1.0)).x;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying float vMundoX;
uniform vec3 uApagado;
uniform float uEncendido;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float ladoOscuro = smoothstep(-0.004, 0.004, vMundoX) * (1.0 - uEncendido);
        diffuseColor.rgb = mix(diffuseColor.rgb, uApagado, ladoOscuro);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 1.0 - ladoOscuro;`);
  };
  material.customProgramCacheKey = () => "partido-" + colorApagado;
}
partirPorLado(matLetraCanto, "#1a1d24", encendidoCanto);

function crearLema(fuente) {
  const kz = (D - LEMA_Z) / D;
  const anchoObjetivo = 7.68 * kz;
  [{ texto: "ILUMINA", arriba: 4.42 }, { texto: "SU NAVIDAD.", arriba: 2.72 }].forEach(({ texto, arriba }) => {
    const grupo = new THREE.Group();
    let cursorX = 0;
    const piezas = [];
    for (const ch of texto) {
      if (ch === " ") { cursorX += 0.35; continue; }
      const geo = new TextGeometry(ch, { font: fuente, size: 1, height: 0.32, depth: 0.32, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.028, bevelSegments: 4 });
      geo.computeBoundingBox();
      const ancho = geo.boundingBox.max.x - geo.boundingBox.min.x;
      geo.translate(-geo.boundingBox.min.x - ancho / 2, 0, 0);
      const cara = new THREE.MeshPhysicalMaterial({ color: C.crema, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1, emissive: "#000000" });
      const encendido = { value: 0 };
      partirPorLado(cara, "#4a505c", encendido);
      const letra = new THREE.Mesh(geo, [cara, matLetraCanto]);
      letra.userData.encendido = encendido;
      letra.position.x = cursorX + ancho / 2;
      piezas.push({ letra, ancho });
      cursorX += ancho + 0.06;
      grupo.add(letra);
    }
    const total = cursorX - 0.06;
    const escala = anchoObjetivo / total;
    grupo.scale.setScalar(escala);
    piezas.forEach((p) => { p.letra.position.x -= total / 2; });
    const altoLinea = 0.72 * escala;
    grupo.position.set(0, arriba * kz - altoLinea, LEMA_Z);
    escena.add(grupo);
    grupo.updateMatrixWorld(true);
    piezas.forEach(({ letra }) => {
      const centro = new THREE.Vector3();
      letra.getWorldPosition(centro);
      centro.y += altoLinea / 2;
      letras.push({ letra, material: letra.material[0], encendido: letra.userData.encendido, lado: centro.x < 0 ? "feliz" : "triste", base: letra.position.z, influencia: 0, centro: aPixeles(centro) });
    });
  });
  avanzarCarga();
}
new FontLoader().load(FUENTE_3D, crearLema, undefined, () => {
  // si la fuente 3D no carga, el lema queda en el título accesible (h1)
  avanzarCarga();
});

const COLOR_LETRA = { feliz: new THREE.Color(C.crema), apagada: new THREE.Color("#5d6370"), dorada: new THREE.Color("#ffcf6b") };
const _base = new THREE.Color();
// Cada letra es un pequeño muelle: se adelanta y se gira poco a poco hacia la luz del
// cursor (como si la mirara) y, al irse la luz, vuelve a su sitio con un rebote suave.
const MUELLE = { rigidez: 70, amortiguacion: 11, alcance: 280, adelanto: 0.2, giro: 0.38 };

function muelle(estado, clave, objetivo, dt) {
  const v = `v${clave}`;
  const aceleracion = MUELLE.rigidez * (objetivo - estado[clave]) - MUELLE.amortiguacion * (estado[v] || 0);
  estado[v] = (estado[v] || 0) + aceleracion * dt;
  estado[clave] += estado[v] * dt;
}

function pintarLetras(dt) {
  const paso = Math.min(dt, 1 / 30); // estable aunque un fotograma tarde
  letras.forEach((l) => {
    if (l.z === undefined) Object.assign(l, { z: 0, rx: 0, ry: 0 });
    const dx = luzCursor.x - l.centro.x;
    const dy = luzCursor.y - l.centro.y;
    const cerca = raton.dentro ? suave(limitar(1 - Math.hypot(dx, dy) / MUELLE.alcance, 0, 1)) * luzCursor.intensidad : 0;
    // la influencia (color) sube y baja suave; la forma la mueve el muelle
    l.influencia = lerp(l.influencia, cerca, Math.min(1, dt * 6));
    const ox = limitar(dx / MUELLE.alcance, -1, 1);
    const oy = limitar(dy / MUELLE.alcance, -1, 1);
    muelle(l, "z", cerca * MUELLE.adelanto, paso);
    muelle(l, "ry", ox * cerca * MUELLE.giro, paso);  // gira la cara hacia el cursor (izquierda/derecha)
    muelle(l, "rx", oy * cerca * MUELLE.giro, paso);  // y la inclina hacia arriba o abajo
    l.letra.position.z = l.base + l.z;
    l.letra.rotation.set(l.rx, l.ry, 0);

    // el color base es el del lado feliz; el shader apaga la parte que cae en el lado oscuro
    _base.copy(COLOR_LETRA.feliz);
    l.encendido.value = Math.max(calidez, l.influencia);
    // la luz solo entibia la letra: un toque dorado, sin volverla de metal
    l.material.color.lerpColors(_base, COLOR_LETRA.dorada, l.influencia * 0.55);
    l.material.metalness = l.influencia * 0.25;
    l.material.roughness = lerp(0.28, 0.22, l.influencia);
    l.material.emissive.copy(COLOR_LETRA.dorada).multiplyScalar(l.influencia * 0.18);
  });
}

// Estrella de donar: oro pulido que refleja el entorno
const estrellaDonar = (() => {
  const forma = new THREE.Shape();
  for (let i = 0; i < 28; i++) {
    const r = i % 2 ? 0.66 : 0.82;
    const a = (i * Math.PI) / 14 - Math.PI / 2;
    i ? forma.lineTo(Math.cos(a) * r, Math.sin(a) * r) : forma.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const material = new THREE.MeshPhysicalMaterial({ color: "#ffcf5a", metalness: 1, roughness: 0.22, clearcoat: 0.6, envMapIntensity: 1.1, emissive: "#ffb43a", emissiveIntensity: 0.12 });
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 4 }), material);
  m.position.copy(enPantalla(636, 503, 1));
  m.position.z -= 0.1;
  m.castShadow = true;
  escena.add(m);
  return { malla: m, material, escala: 1 };
})();

/* ---------- 10. Santa Claus en su trineo ---------- */

// Reno simpático, en postura de vuelo: cabeza grande, ojos con brillo, nariz negra, sonrisa,
// astas ramificadas, gorro con pompón, bufanda de cuadros, lunares y pezuñas con puño de lana.
const texturaCuadros = lienzoTextura(64, 64, (ctx, w) => {
  ctx.fillStyle = "#e8562a";
  ctx.fillRect(0, 0, w, w);
  ctx.fillStyle = "rgba(255, 196, 80, 0.75)";
  for (let k = 0; k < w; k += 16) { ctx.fillRect(k, 0, 6, w); ctx.fillRect(0, k, w, 6); }
  ctx.fillStyle = "rgba(160, 30, 20, 0.45)";
  for (let k = 8; k < w; k += 16) { ctx.fillRect(k, 0, 3, w); ctx.fillRect(0, k, w, 3); }
});
texturaCuadros.wrapS = texturaCuadros.wrapT = THREE.RepeatWrapping;
texturaCuadros.repeat.set(3, 1);

function crearReno() {
  const r = new THREE.Group();
  const pelaje = arcilla("#c9773a");
  const claro = arcilla("#f1d2a4");
  const asta = arcilla("#c9a77a", { roughness: 0.7 });
  const negro = arcilla("#1b1412", { roughness: 0.3, clearcoat: 0.6 });
  const blanco = arcilla("#fbf3e6");
  const rojo = arcilla("#d83a24");
  // cuerpo, barriga y lunares
  r.add(malla(geoEsfera, pelaje, 0, 0, 0, 0.26, 0.15, 0.15));
  r.add(malla(geoEsfera, claro, 0.02, -0.05, 0, 0.2, 0.1, 0.13));
  for (const [x, y, z] of [[-0.08, 0.11, 0.08], [0.04, 0.12, 0.09], [-0.15, 0.07, 0.11], [0.1, 0.08, 0.12], [-0.02, 0.1, -0.1]]) r.add(malla(geoEsferaBaja, blanco, x, y, z, 0.018, 0.012, 0.012));
  // patas en vuelo (dobladas) con puño de lana y pezuña
  for (const [x, z, d] of [[-0.15, 0.07, 1], [-0.15, -0.07, 1], [0.15, 0.07, -1], [0.15, -0.07, -1]]) {
    const pata = new THREE.Group();
    pata.position.set(x, -0.08, z);
    pata.rotation.z = d * 0.9;
    pata.add(malla(new THREE.CapsuleGeometry(0.035, 0.13, 4, 10), pelaje, 0, -0.1, 0));
    pata.add(malla(new THREE.TorusGeometry(0.038, 0.018, 8, 16), claro, 0, -0.19, 0).rotateX(Math.PI / 2));
    pata.add(malla(geoEsfera, negro, 0, -0.225, 0, 0.038, 0.028, 0.038));
    r.add(pata);
  }
  // cola
  r.add(malla(geoEsfera, pelaje, -0.27, 0.06, 0, 0.06, 0.04, 0.05).rotateZ(0.6));
  r.add(malla(geoEsfera, claro, -0.31, 0.09, 0, 0.03));
  // cuello y bufanda de cuadros con su caída
  r.add(malla(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10), pelaje, 0.2, 0.12, 0).rotateZ(-0.7));
  const bufanda = arcilla("#ffffff", { map: texturaCuadros, roughness: 0.9, sheen: 0.8 });
  r.add(malla(new THREE.TorusGeometry(0.07, 0.03, 10, 20), bufanda, 0.22, 0.13, 0).rotateY(Math.PI / 2).rotateX(0.5));
  r.add(malla(new RoundedBoxGeometry(0.05, 0.15, 0.025, 2, 0.01), bufanda, 0.24, 0.06, 0.07).rotateZ(0.3));
  // cabeza grande
  const cabeza = new THREE.Group();
  cabeza.position.set(0.32, 0.27, 0);
  r.add(cabeza);
  cabeza.add(malla(geoEsfera, pelaje, 0, 0, 0, 0.13, 0.12, 0.12));
  cabeza.add(malla(geoEsfera, claro, 0.06, -0.035, 0, 0.09, 0.07, 0.09)); // hocico
  cabeza.add(malla(geoEsfera, negro, 0.145, -0.01, 0, 0.032, 0.026, 0.03)); // nariz
  cabeza.add(malla(new THREE.TorusGeometry(0.03, 0.006, 6, 14, Math.PI), negro, 0.12, -0.065, 0).rotateY(Math.PI / 2).rotateZ(Math.PI)); // sonrisa
  for (const z of [-0.06, 0.06]) {
    // ojos grandes con brillo y mejillas sonrosadas
    cabeza.add(malla(geoEsfera, blanco, 0.085, 0.035, z, 0.035, 0.04, 0.03));
    cabeza.add(malla(geoEsfera, arcilla("#3a1e12", { roughness: 0.15, clearcoat: 1 }), 0.105, 0.035, z, 0.024));
    cabeza.add(malla(geoEsferaBaja, mat("#ffffff", { emissive: "#ffffff", emissiveIntensity: 0.6 }), 0.125, 0.045, z * 0.92, 0.007));
    cabeza.add(malla(geoEsfera, arcilla("#f08a8a", { transparent: true, opacity: 0.75 }), 0.07, -0.03, z * 1.55, 0.03, 0.02, 0.012));
    // orejas
    const oreja = malla(geoEsfera, pelaje, -0.02, 0.06, z * 2.1, 0.05, 0.022, 0.03);
    oreja.rotation.set(z > 0 ? 0.6 : -0.6, 0, 0.3);
    cabeza.add(oreja);
    // astas ramificadas
    const s2 = z > 0 ? 1 : -1;
    const base = new THREE.Group();
    base.position.set(-0.02, 0.1, z * 0.9);
    base.rotation.set(s2 * 0.35, 0, 0.25);
    base.add(malla(new THREE.CapsuleGeometry(0.014, 0.16, 4, 8), asta, 0, 0.09, 0));
    for (const [y, a] of [[0.07, 0.9], [0.13, -0.8]]) {
      const rama = malla(new THREE.CapsuleGeometry(0.011, 0.07, 4, 8), asta, Math.sin(a) * 0.035, y + 0.03, 0);
      rama.rotation.z = -a;
      base.add(rama);
    }
    cabeza.add(base);
  }
  // gorro con ribete y pompón
  const gorro = new THREE.Group();
  gorro.position.set(-0.01, 0.09, 0);
  gorro.rotation.z = 0.25;
  gorro.add(malla(new THREE.SphereGeometry(0.105, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), rojo, 0, 0, 0, 1, 1.05, 1));
  gorro.add(malla(new THREE.TorusGeometry(0.1, 0.026, 10, 22), blanco, 0, 0.005, 0).rotateX(Math.PI / 2));
  gorro.add(malla(geoEsfera, blanco, -0.01, 0.115, 0, 0.035));
  cabeza.add(gorro);
  return r;
}

let santa_brazo = null;
const santa = (() => {
  const g = new THREE.Group();
  const rojo = arcilla("#d61f26");
  const blanco = arcilla("#fbfaf7", { roughness: 0.75, sheen: 0.8 });
  const piel = arcilla("#f6c9a8");
  const negro = arcilla("#1c1a1c", { roughness: 0.35, clearcoat: 0.5 });
  const oro = arcilla("#f2b928", { roughness: 0.35, metalness: 0.3 });
  const amarillo = arcilla("#f6c431");
  const marron = arcilla("#6e3f2a");
  const madera = new THREE.MeshPhysicalMaterial({ color: "#9b1420", roughness: 0.35, clearcoat: 1, envMapIntensity: 0.8 });
  // trineo lacado con filo dorado y patines curvos
  g.add(malla(new RoundedBoxGeometry(0.92, 0.3, 0.5, 3, 0.06), madera, 0, 0.22, 0));
  g.add(malla(new RoundedBoxGeometry(0.2, 0.36, 0.5, 3, 0.06), madera, -0.37, 0.44, 0));
  g.add(malla(new RoundedBoxGeometry(0.96, 0.04, 0.52, 2, 0.015), oro, 0, 0.385, 0));
  for (const z of [-0.21, 0.21]) {
    g.add(malla(new RoundedBoxGeometry(1.04, 0.035, 0.04, 2, 0.012), oro, 0, 0.02, z));
    const curva = malla(new THREE.TorusGeometry(0.13, 0.02, 8, 16, Math.PI), oro, 0.52, 0.15, z);
    curva.rotation.z = -Math.PI / 2;
    g.add(curva);
    g.add(malla(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), oro, 0.25, 0.1, z), malla(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), oro, -0.25, 0.1, z));
  }
  // saco rojo lleno de regalos
  g.add(malla(geoEsfera, rojo, -0.3, 0.58, 0, 0.2, 0.23, 0.19));
  g.add(malla(new THREE.TorusGeometry(0.07, 0.025, 8, 16), rojo, -0.3, 0.8, 0).rotateX(Math.PI / 2));
  [[-0.36, 0.86, 0.04, 0.12, 3], [-0.24, 0.88, -0.04, 0.11, 1], [-0.31, 0.92, -0.02, 0.09, 5]].forEach(([x, y, z, t, k]) => {
    const r = crearRegalo(k);
    r.scale.setScalar(t);
    r.position.set(x, y, z);
    r.rotation.set(azar(-0.3, 0.3), azar(0, 1), azar(-0.3, 0.3));
    g.add(r);
  });
  // Santa: barriga redonda, ribetes blancos, cinturón con hebilla dorada
  const santaG = new THREE.Group();
  santaG.position.set(0.08, 0.36, 0);
  g.add(santaG);
  santaG.add(malla(geoEsfera, rojo, 0, 0.22, 0, 0.21, 0.24, 0.2));
  santaG.add(malla(new RoundedBoxGeometry(0.05, 0.36, 0.02, 2, 0.01), blanco, 0.0, 0.22, 0.198));
  santaG.add(malla(new THREE.TorusGeometry(0.205, 0.035, 10, 28), negro, 0, 0.16, 0).rotateX(Math.PI / 2));
  santaG.add(malla(new RoundedBoxGeometry(0.09, 0.08, 0.03, 2, 0.01), oro, 0, 0.16, 0.215));
  santaG.add(malla(new RoundedBoxGeometry(0.05, 0.04, 0.035, 2, 0.008), negro, 0, 0.16, 0.218));
  santaG.add(malla(new THREE.TorusGeometry(0.16, 0.04, 10, 24), blanco, 0, 0.42, 0).rotateX(Math.PI / 2));
  // piernas sentado y botas negras con hebilla
  for (const z of [-0.08, 0.08]) {
    santaG.add(malla(new THREE.CapsuleGeometry(0.055, 0.14, 4, 10), rojo, 0.14, 0.04, z).rotateZ(Math.PI / 2));
    santaG.add(malla(new THREE.TorusGeometry(0.05, 0.02, 8, 16), blanco, 0.25, 0.04, z).rotateY(Math.PI / 2));
    santaG.add(malla(new RoundedBoxGeometry(0.1, 0.09, 0.08, 2, 0.03), negro, 0.3, 0.02, z));
    santaG.add(malla(new RoundedBoxGeometry(0.02, 0.04, 0.05, 1, 0.005), oro, 0.35, 0.03, z));
  }
  // cabeza: cara, nariz sonrosada, ojos con brillo, barba y bigote, gorro con pompón
  const cabeza = new THREE.Group();
  cabeza.position.set(0.02, 0.56, 0);
  santaG.add(cabeza);
  cabeza.add(malla(geoEsfera, piel, 0, 0, 0, 0.12));
  cabeza.add(malla(geoEsfera, blanco, 0.03, -0.075, 0, 0.12, 0.11, 0.12)); // barba
  for (const z of [-0.035, 0.035]) {
    cabeza.add(malla(geoEsfera, blanco, 0.105, -0.025, z * 1.3, 0.04, 0.025, 0.04)); // bigote
    cabeza.add(malla(geoEsfera, negro, 0.105, 0.03, z, 0.016, 0.02, 0.014));
    cabeza.add(malla(geoEsferaBaja, mat("#ffffff", { emissive: "#ffffff", emissiveIntensity: 0.6 }), 0.118, 0.036, z * 0.9, 0.005));
    cabeza.add(malla(geoEsfera, blanco, 0.09, 0.065, z * 1.3, 0.02, 0.008, 0.025)); // cejas
    cabeza.add(malla(geoEsfera, arcilla("#f08a8a", { transparent: true, opacity: 0.7 }), 0.09, 0.0, z * 2.2, 0.022, 0.016, 0.012));
  }
  cabeza.add(malla(geoEsfera, arcilla("#f09a86"), 0.12, 0.005, 0, 0.026)); // nariz
  cabeza.add(malla(geoEsfera, arcilla("#b8323a"), 0.11, -0.05, 0, 0.018, 0.012, 0.028)); // boca
  const gorro = new THREE.Group();
  gorro.position.set(-0.01, 0.06, 0);
  gorro.add(malla(new THREE.ConeGeometry(0.115, 0.2, 18), rojo, -0.04, 0.1, 0).rotateZ(0.7));
  gorro.add(malla(new THREE.TorusGeometry(0.11, 0.035, 10, 24), blanco, 0, 0.01, 0).rotateX(Math.PI / 2));
  gorro.add(malla(geoEsfera, blanco, -0.14, 0.14, 0, 0.04));
  cabeza.add(gorro);
  // brazo saludando con manopla amarilla y el otro sujetando las riendas
  const brazo = new THREE.Group();
  brazo.position.set(0.05, 0.36, 0.17);
  brazo.rotation.set(0.3, 0, -2.2);
  brazo.add(malla(new THREE.CapsuleGeometry(0.045, 0.16, 4, 10), rojo, 0, 0.1, 0));
  brazo.add(malla(new THREE.TorusGeometry(0.045, 0.018, 8, 16), blanco, 0, 0.19, 0).rotateX(Math.PI / 2));
  brazo.add(malla(geoEsfera, amarillo, 0, 0.25, 0, 0.05, 0.06, 0.04));
  brazo.add(malla(geoEsfera, amarillo, 0.03, 0.23, 0.02, 0.02, 0.03, 0.02));
  santaG.add(brazo);
  santa_brazo = brazo;
  const brazo2 = new THREE.Group();
  brazo2.position.set(0.08, 0.32, -0.17);
  brazo2.rotation.set(0, 0, -1.2);
  brazo2.add(malla(new THREE.CapsuleGeometry(0.045, 0.16, 4, 10), rojo, 0, 0.1, 0));
  brazo2.add(malla(geoEsfera, amarillo, 0, 0.21, 0, 0.05));
  santaG.add(brazo2);
  // renos
  for (const [x, y] of [[1.05, 0.3], [1.72, 0.38]]) {
    const r = crearReno();
    r.position.set(x, y, 0);
    r.scale.setScalar(1.15);
    g.add(r);
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.3, 0.68, -0.1), new THREE.Vector3(1.0, 0.42, 0), new THREE.Vector3(1.6, 0.5, 0)]), new THREE.LineBasicMaterial({ color: "#6e3f2a" })));
  // estela de polvo dorado
  const estela = [];
  for (let i = 0; i < 18; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaDestello, color: "#ffd27a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(azar(0.06, 0.14));
    estela.push(sp);
    escena.add(sp);
  }
  sombras(g);
  g.visible = false;
  escena.add(g);
  void marron;
  return { grupo: g, estela, ultimaSuelta: 0 };
})();

// Santa vuela de ida y vuelta sin parar: cruza por delante, al llegar a un extremo gira
// en una curva hacia el fondo, vuelve por detrás del árbol y gira otra vez al otro lado.
// El recorrido es un "estadio" (dos rectas unidas por dos semicírculos) para su centro.
const SANTA = { z: 0.3, radio: 0.9, velocidad: 1.5, mitad: 3.0, saco: -0.3, centro: 0.8, cada: 0.85 };
// el dibujo de Santa empieza en el trineo y acaba en los renos: se centra en su origen
santa.grupo.children.forEach((hijo) => { hijo.position.x -= SANTA.centro; });

function posicionSanta(recorrido) {
  const k = (D - SANTA.z) / D;
  const izq = -SANTA.mitad * k, der = SANTA.mitad * k, r = SANTA.radio;
  const recta = der - izq, curva = Math.PI * r;
  const s = recorrido % (2 * recta + 2 * curva);
  const zFrente = SANTA.z;
  if (s < recta) return { x: izq + s, z: zFrente, rumbo: 0 };
  if (s < recta + curva) {
    const th = ((s - recta) / curva) * Math.PI;
    return { x: der + r * Math.sin(th), z: zFrente - r + r * Math.cos(th), rumbo: th };
  }
  if (s < 2 * recta + curva) return { x: der - (s - recta - curva), z: zFrente - 2 * r, rumbo: Math.PI };
  const th = Math.PI + ((s - 2 * recta - curva) / curva) * Math.PI;
  return { x: izq + r * Math.sin(th), z: zFrente - r + r * Math.cos(th), rumbo: th };
}

let recorridoSanta = 0;
function moverSanta(segundos, dt) {
  if (movimientoReducido) {
    santa.grupo.visible = false;
    santa.estela.forEach((sp) => { sp.visible = false; });
    return;
  }
  recorridoSanta += SANTA.velocidad * dt;
  const { x, z, rumbo } = posicionSanta(recorridoSanta);
  const dirX = Math.cos(rumbo), dirZ = -Math.sin(rumbo); // hacia dónde mira
  const y = 0.25 + Math.sin(segundos * 3) * 0.1;
  santa.grupo.visible = true;
  santa.grupo.position.set(x, y, z);
  santa.grupo.rotation.set(0, rumbo, Math.cos(segundos * 3) * 0.04);
  // se inclina hacia dentro al girar
  const girando = Math.abs(Math.sin(rumbo)) > 0.01;
  santa.grupo.rotation.x = girando ? -Math.sin(rumbo) * 0.18 : 0;
  if (santa_brazo) santa_brazo.rotation.x = 0.3 + Math.sin(segundos * 7) * 0.35; // saluda
  santa.estela.forEach((sp, i) => {
    sp.visible = true;
    const atras = 1.3 + i * 0.12;
    sp.position.set(x - dirX * atras, y + 0.2 + Math.sin(segundos * 6 + i) * 0.06, z - dirZ * atras);
    sp.material.opacity = (1 - i / santa.estela.length) * (0.6 + Math.random() * 0.4);
  });
  // regalos desde el saco, solo en los tramos rectos
  if (girando || recorridoSanta - santa.ultimaSuelta < SANTA.cada) return;
  santa.ultimaSuelta = recorridoSanta;
  const saco = x + dirX * (SANTA.saco - SANTA.centro);
  const pantalla = aPixeles(new THREE.Vector3(saco, y, z));
  if (pantalla.x < 12 || pantalla.x > CARTEL.ancho - 12) return;
  const lado = pantalla.x < MITAD ? lados.feliz : lados.triste;
  if (lado === lados.triste && !estrellaEncendida) return;
  soltarRegalo(lado, { x: saco, y: y + 0.35, vx: 2.5 * dirX });
}

/* ---------- 11. Física: regalos que caen, se apilan, se congelan y estallan ---------- */

const fisica = new CANNON.World({ gravity: new CANNON.Vec3(0, -13, 0) });
fisica.broadphase = new CANNON.SAPBroadphase(fisica);
fisica.allowSleep = true;
fisica.defaultContactMaterial.friction = 0.45;
fisica.defaultContactMaterial.restitution = 0.22;

// Suelo y paredes invisibles que mantienen los regalos en primer plano y cada uno en su lado
const ZFRENTE = { atras: 1.05, delante: 1.75 };
function cuerpoPlano(normal, punto) {
  const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  b.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(...normal));
  b.position.set(...punto);
  fisica.addBody(b);
  return b;
}
cuerpoPlano([0, 1, 0], [0, SUELO, 0]);
cuerpoPlano([0, 0, 1], [0, 0, ZFRENTE.atras]);
cuerpoPlano([0, 0, -1], [0, 0, ZFRENTE.delante]);
cuerpoPlano([1, 0, 0], [-3.85, 0, 0]);
cuerpoPlano([-1, 0, 0], [3.85, 0, 0]);
const muro = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.01, 4, 2)) });
muro.position.set(0, SUELO + 4, 1.4);
fisica.addBody(muro);

const CAIDA = { maxApilados: { feliz: 16, triste: 22 }, cadaFeliz: [3.5, 6], cadaDonando: 0.24, tamano: [0.24, 0.38] };
const materialHielo = new THREE.MeshPhysicalMaterial({ color: "#d8efff", roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.8, envMapIntensity: 1.1, emissive: "#2d4f7a", emissiveIntensity: 0.08 });

function crearLado(nombre) { return { nombre, regalos: [], proximo: 0, congelado: false }; }
const lados = { feliz: crearLado("feliz"), triste: crearLado("triste") };
const regalosClicables = [];

function soltarRegalo(lado, opciones = {}) {
  if (lado.regalos.length >= CAIDA.maxApilados[lado.nombre]) return;
  const t = azar(...CAIDA.tamano);
  const signo = lado.nombre === "feliz" ? -1 : 1;
  const x = opciones.x !== undefined ? limitar(opciones.x, signo < 0 ? -3.6 : 0.15, signo < 0 ? -0.15 : 3.6) : signo * azar(0.3, 3.5);
  const grupo = crearRegalo();
  grupo.scale.set(t, t * azar(0.8, 1.1), t * azar(0.85, 1.15));
  escena.add(grupo);
  const cuerpo = new CANNON.Body({
    mass: 1 + t * 3,
    shape: new CANNON.Box(new CANNON.Vec3(grupo.scale.x / 2, grupo.scale.y / 2, grupo.scale.z / 2)),
    position: new CANNON.Vec3(x, opciones.y ?? 6.5, azar(ZFRENTE.atras + t, ZFRENTE.delante - t)),
    angularDamping: 0.2,
    linearDamping: 0.05,
    sleepSpeedLimit: 0.15,
  });
  cuerpo.quaternion.setFromEuler(azar(0, 6), azar(0, 6), azar(0, 6));
  cuerpo.angularVelocity.set(azar(-4, 4), azar(-4, 4), azar(-4, 4));
  if (opciones.vx) cuerpo.velocity.x = opciones.vx;
  fisica.addBody(cuerpo);
  const regalo = { grupo, cuerpo, lado, materiales: grupo.userData.materiales };
  grupo.userData.regalo = regalo;
  lado.regalos.push(regalo);
  regalosClicables.push(grupo);
}

function sincronizarRegalos() {
  for (const lado of [lados.feliz, lados.triste]) {
    lado.regalos.forEach((r) => {
      r.grupo.position.copy(r.cuerpo.position);
      r.grupo.quaternion.copy(r.cuerpo.quaternion);
    });
  }
}

function estallarRegalo(regalo) {
  if (regalo.lado.congelado) return;
  particulas.estallar(regalo.grupo.position.clone(), regalo.materiales.map((m) => "#" + m.color.getHexString()));
  escena.remove(regalo.grupo);
  fisica.removeBody(regalo.cuerpo);
  regalosClicables.splice(regalosClicables.indexOf(regalo.grupo), 1);
  regalo.lado.regalos = regalo.lado.regalos.filter((r) => r !== regalo);
  // los de alrededor se despiertan y caen al hueco
  regalo.lado.regalos.forEach((r) => r.cuerpo.wakeUp());
}

function congelarRegalos(congelar) {
  lados.triste.congelado = congelar;
  lados.triste.regalos.forEach((r) => {
    // Helados siguen cayendo por su peso: dejan de girar, rebotan poco y se quedan en el suelo
    const b = r.cuerpo;
    b.angularVelocity.scale(congelar ? 0.15 : 1, b.angularVelocity);
    b.angularDamping = congelar ? 0.9 : 0.2;
    b.wakeUp();
    r.grupo.traverse((h) => {
      if (!h.isMesh) return;
      if (congelar) {
        h.userData.original = h.userData.original || h.material;
        h.material = materialHielo;
      } else if (h.userData.original) {
        h.material = h.userData.original;
      }
    });
  });
}

/* ---------- 12. Nieve que cae y se acumula ---------- */

const nieve = (() => {
  const cantidad = esMovil ? 600 : 1100;
  const posiciones = new Float32Array(cantidad * 3);
  const velocidades = new Float32Array(cantidad);
  const colores = new Float32Array(cantidad * 3);
  for (let i = 0; i < cantidad; i++) {
    const z = azar(-6, 2);
    const k = (D - z) / D;
    posiciones.set([azar(-4.3, 4.3) * k, azar(SUELO, 7), z], i * 3);
    velocidades[i] = azar(0.35, 0.9);
    const c = posiciones[i * 3] < 0 ? [1, 1, 1] : [0.62, 0.66, 0.74];
    colores.set(c, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colores, 3));
  const puntos = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.075, map: texturaDestello, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  escena.add(puntos);
  const mantos = {};
  for (const [nombre, x] of [["feliz", -2.7], ["triste", 2.7]]) {
    const m = nombre === "feliz" ? mat("#ffffff", { ...texturaPBR("snow_02", 5, 4), roughness: 1 }) : matPar("#8a92a2", "#ffffff", { ...texturaPBR("snow_02", 5, 4), roughness: 1 });
    const manto = malla(geoCaja, m, x, SUELO, 0.4, 5.4, 0.001, 3.2);
    manto.receiveShadow = true;
    escena.add(manto);
    mantos[nombre] = manto;
  }
  return { puntos, posiciones, velocidades, cantidad, mantos, acumulado: { feliz: 0, triste: 0 } };
})();

function moverNieve(dt, tiempo) {
  const { posiciones, velocidades, cantidad } = nieve;
  const viento = Math.sin(tiempo * 0.3) * 0.15;
  for (let i = 0; i < cantidad; i++) {
    posiciones[i * 3 + 1] -= velocidades[i] * dt;
    posiciones[i * 3] += (Math.sin(tiempo * 1.3 + i) * 0.12 + viento) * dt;
    if (posiciones[i * 3 + 1] < SUELO) {
      const lado = posiciones[i * 3] < 0 ? "feliz" : "triste";
      nieve.acumulado[lado] = Math.min(nieve.acumulado[lado] + 0.00012, 0.06);
      posiciones[i * 3 + 1] = 7;
    }
  }
  nieve.puntos.geometry.attributes.position.needsUpdate = true;
  for (const lado of ["feliz", "triste"]) {
    const alto = Math.max(0.001, nieve.acumulado[lado]);
    nieve.mantos[lado].scale.y = alto;
    nieve.mantos[lado].position.y = SUELO + alto / 2;
  }
}

/* ---------- 13. Confeti y fuegos artificiales ---------- */

const particulas = (() => {
  // Confeti: papelitos de verdad (planos que giran y revolotean al caer)
  const MAX_CONFETI = 700;
  const confeti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.035), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3, envMapIntensity: 1 }), MAX_CONFETI);
  confeti.count = 0;
  confeti.frustumCulled = false;
  escena.add(confeti);
  const papelitos = [];

  // Chispas de los fuegos: puntos que brillan (bloom)
  const MAX_CHISPAS = 4000;
  const posChispas = new Float32Array(MAX_CHISPAS * 3);
  const colChispas = new Float32Array(MAX_CHISPAS * 3);
  const geoChispas = new THREE.BufferGeometry();
  geoChispas.setAttribute("position", new THREE.BufferAttribute(posChispas, 3));
  geoChispas.setAttribute("color", new THREE.BufferAttribute(colChispas, 3));
  geoChispas.setDrawRange(0, 0);
  const puntosChispas = new THREE.Points(geoChispas, new THREE.PointsMaterial({ size: 0.12, map: texturaDestello, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  puntosChispas.frustumCulled = false;
  escena.add(puntosChispas);
  let chispas = [];
  const PALETA = ["#ffd166", "#ff4d4d", "#ff9de2", "#6ab0ff", "#fff1e6", "#5cff8a", "#c77dff"];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

  function palmera(origen, color, lista) {
    const segundo = elegir(PALETA);
    for (let i = 0; i < 140; i++) {
      const dir = new THREE.Vector3(azar(-1, 1), azar(-1, 1), azar(-1, 1)).normalize().multiplyScalar(azar(1.6, 3.2));
      lista.push({ pos: origen.clone(), vel: dir, color: new THREE.Color(i % 3 ? color : segundo).multiplyScalar(3), vida: azar(1.1, 1.9), max: 1.9, gravedad: 1.6, roce: 1.2 });
    }
  }

  return {
    estallar(origen, colores) {
      for (let i = 0; i < 160 && papelitos.length < MAX_CONFETI; i++) {
        papelitos.push({
          pos: origen.clone(), vel: new THREE.Vector3(azar(-2.6, 2.6), azar(2.5, 7), azar(-1.5, 2.5)),
          rot: new THREE.Euler(azar(0, 6), azar(0, 6), azar(0, 6)), giro: new THREE.Vector3(azar(-12, 12), azar(-12, 12), azar(-12, 12)),
          color: new THREE.Color(Math.random() < 0.35 ? elegir(colores) : elegir(PALETA)), vida: azar(3, 4.5),
        });
      }
      if (!movimientoReducido) {
        for (let i = 0; i < 4; i++) chispas.push({ pos: origen.clone(), vel: new THREE.Vector3(azar(-1, 1), azar(5.5, 7.5), azar(-0.5, 0.5)), color: new THREE.Color(elegir(PALETA)), vida: azar(0.55, 0.8), max: 1, cohete: true, gravedad: 4, roce: 0 });
      }
    },
    actualizar(dt) {
      // confeti: gravedad, rozamiento del aire y aleteo
      for (let i = papelitos.length - 1; i >= 0; i--) {
        const p = papelitos[i];
        p.vida -= dt;
        p.vel.y -= 7 * dt;
        p.vel.multiplyScalar(1 - 2.2 * dt);
        if (p.vel.y < -1.2) p.vel.y = -1.2; // cae despacio como papel
        p.vel.x += Math.sin(p.vida * 6 + i) * 0.6 * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.giro.x * dt; p.rot.y += p.giro.y * dt; p.rot.z += p.giro.z * dt;
        if (p.pos.y < SUELO + 0.01) { p.pos.y = SUELO + 0.01; p.vel.set(0, 0, 0); p.giro.multiplyScalar(0); p.rot.x = -Math.PI / 2; }
        if (p.vida <= 0) papelitos.splice(i, 1);
      }
      papelitos.forEach((p, i) => {
        _q.setFromEuler(_e.copy(p.rot));
        _m.compose(p.pos, _q, _s);
        confeti.setMatrixAt(i, _m);
        confeti.setColorAt(i, _c.copy(p.color));
      });
      confeti.count = papelitos.length;
      confeti.instanceMatrix.needsUpdate = true;
      if (confeti.instanceColor) confeti.instanceColor.needsUpdate = true;

      // chispas y cohetes
      const siguientes = [];
      chispas.forEach((p) => {
        p.vida -= dt;
        p.vel.y -= p.gravedad * dt;
        p.vel.multiplyScalar(1 - p.roce * dt);
        p.pos.addScaledVector(p.vel, dt);
        if (p.cohete) {
          siguientes.push({ pos: p.pos.clone(), vel: new THREE.Vector3(azar(-0.2, 0.2), -0.4, 0), color: new THREE.Color("#ffb347").multiplyScalar(2), vida: 0.35, max: 0.35, gravedad: 0, roce: 0 });
          if (p.vida <= 0 || p.vel.y < 0.4) { palmera(p.pos, p.color, siguientes); return; }
        }
        if (p.vida > 0) siguientes.push(p);
      });
      chispas = siguientes.slice(0, MAX_CHISPAS);
      chispas.forEach((p, i) => {
        posChispas[i * 3] = p.pos.x; posChispas[i * 3 + 1] = p.pos.y; posChispas[i * 3 + 2] = p.pos.z;
        const b = Math.max(0, p.vida / p.max) * (0.7 + Math.random() * 0.3);
        colChispas[i * 3] = p.color.r * b; colChispas[i * 3 + 1] = p.color.g * b; colChispas[i * 3 + 2] = p.color.b * b;
      });
      geoChispas.setDrawRange(0, chispas.length);
      geoChispas.attributes.position.needsUpdate = true;
      geoChispas.attributes.color.needsUpdate = true;
    },
  };
})();

/* ---------- 14. Interacción ---------- */

function obtenerPosicionEnCartel(evento) {
  const marco = cartel.getBoundingClientRect();
  return { x: ((evento.clientX - marco.left) / marco.width) * CARTEL.ancho, y: ((evento.clientY - marco.top) / marco.height) * CARTEL.alto };
}

// mousemove: la luz cálida sigue al cursor; los niños reaccionan
function seguirCursor(evento) {
  const p = obtenerPosicionEnCartel(evento);
  raton.x = p.x;
  raton.y = p.y;
  raton.dentro = true;
  luzCursor.objetivo = 1;
  comprobarNinos(p.x, p.y);
}
// mouseleave
function soltarCursor() {
  raton.dentro = false;
  luzCursor.objetivo = 0;
}

function encima(n, x, y) {
  const pies = aPixeles(n.raiz.position);
  const alto = 165 * n.escala * (n.siempreFeliz ? 1 : 0.8);
  return Math.abs(x - pies.x) < 36 * n.escala && y < pies.y && y > pies.y - alto;
}

function comprobarNinos(x, y) {
  if (estadoCaravana === "casa") ninosFelices.forEach((n) => { if (n.salto <= 0 && encima(n, x, y)) n.salto = 1.1; });
  ninosTristes.forEach((n) => { if (encima(n, x, y)) alegrar(n); });
}

function alegrar(n) {
  clearTimeout(n.temporizador);
  n.muyTriste = false;
  n.objetivo = 1;
  n.temporizador = setTimeout(() => entristecer(n), 2600);
}
function entristecer(n) {
  if (estrellaEncendida) return;
  n.objetivo = 0;
  if (lados.triste.congelado) n.muyTriste = true;
}

let esperasCadena = [];
function levantarEnCadena() {
  esperasCadena.forEach(clearTimeout);
  const estrella = enPantalla(636, 503, 0);
  esperasCadena = [...ninosTristes]
    .sort((a, b) => a.raiz.position.distanceTo(estrella) - b.raiz.position.distanceTo(estrella))
    .map((n, i) => setTimeout(() => alegrar(n), 350 + i * 260));
}
function entristecerTodos() {
  esperasCadena.forEach(clearTimeout);
  esperasCadena = ninosTristes.map((n, i) => setTimeout(() => { clearTimeout(n.temporizador); n.objetivo = 0; n.muyTriste = true; }, i * 140));
}

const CARAVANA = { viaje: 2.4 };
let esperaCaravana = null;
function enviarCaravana() {
  clearTimeout(esperaCaravana);
  estadoCaravana = "yendo";
  esperaCaravana = setTimeout(() => { estadoCaravana = "alli"; levantarEnCadena(); }, movimientoReducido ? 0 : CARAVANA.viaje * 1000);
}
function volverCaravana() {
  clearTimeout(esperaCaravana);
  estadoCaravana = "volviendo";
  esperaCaravana = setTimeout(() => { estadoCaravana = "casa"; }, movimientoReducido ? 0 : CARAVANA.viaje * 1000);
}

// mouseenter en el botón: donar
// Estados visuales del botón de donar (dos propiedades: transform y color)
const BOTON_DONAR = {
  reposo: { transform: "scale(1) rotate(0deg)", color: "#111111" },
  encendido: { transform: "scale(1.08) rotate(-8deg)", color: "#8a0b1f" },
};
function aplicarEstadoBoton(estado) {
  botonDonar.style.transform = estado.transform;
  botonDonar.style.color = estado.color;
}

function encenderEstrella() {
  if (estrellaEncendida) return;
  estrellaEncendida = true;
  aplicarEstadoBoton(BOTON_DONAR.encendido);
  cartel.classList.add("esta-donando");
  congelarRegalos(false);
  enviarCaravana();
}
// mouseleave del botón: sin donación todo se congela
function apagarEstrella() {
  if (!estrellaEncendida) return;
  estrellaEncendida = false;
  aplicarEstadoBoton(BOTON_DONAR.reposo);
  cartel.classList.remove("esta-donando");
  congelarRegalos(true);
  entristecerTodos();
  volverCaravana();
}

const rayo = new THREE.Raycaster();
function pulsarCartel(evento) {
  if (evento.target.closest && evento.target.closest("#donar")) return;
  const p = obtenerPosicionEnCartel(evento);
  rayo.setFromCamera(new THREE.Vector2((p.x / CARTEL.ancho) * 2 - 1, -(p.y / CARTEL.alto) * 2 + 1), camara);
  const tocado = rayo.intersectObjects(regalosClicables, true)[0];
  if (!tocado) return;
  let o = tocado.object;
  while (o && !o.userData.regalo) o = o.parent;
  if (o) estallarRegalo(o.userData.regalo);
}

// Pantallas táctiles
const TACTIL = { imitacion: 800, luzTrasSoltar: 1800 };
let ultimoToque = 0, esperaSoltar = null, estrellaYaEncendida = false;
const vieneDeToque = () => Date.now() - ultimoToque < TACTIL.imitacion;
const soloRaton = (f) => (e) => { if (!vieneDeToque()) f(e); };
function puntoDelDedo(e) { const d = e.touches[0] || e.changedTouches[0]; return { clientX: d.clientX, clientY: d.clientY }; }
function tocarCartel(e) {
  ultimoToque = Date.now();
  clearTimeout(esperaSoltar);
  if (e.target.closest("#donar")) return;
  if (estrellaEncendida) apagarEstrella();
  seguirCursor(puntoDelDedo(e));
}
function deslizarDedo(e) { ultimoToque = Date.now(); seguirCursor(puntoDelDedo(e)); }
function levantarDedo() { ultimoToque = Date.now(); clearTimeout(esperaSoltar); esperaSoltar = setTimeout(soltarCursor, TACTIL.luzTrasSoltar); }
function tocarEstrella() { ultimoToque = Date.now(); estrellaYaEncendida = estrellaEncendida; encenderEstrella(); }
function pulsarEstrella(e) { if (vieneDeToque() && !estrellaYaEncendida) e.preventDefault(); estrellaYaEncendida = estrellaEncendida; }

/* ---------- 15. Bucle de animación ---------- */

const reloj = new THREE.Clock();
let cuadro = 0;
let bucleActivo = false;
let mediaFotograma = 16;
let ultimoAjuste = 0;

function reanudar() {
  if (bucleActivo || !arrancado) return;
  bucleActivo = true;
  reloj.getDelta(); // no contar el tiempo que estuvo parado
  requestAnimationFrame(animar);
}
let arrancado = false;
let tiempoTotal = 0;
const _crema = new THREE.Color("#f3d58e"), _oro = new THREE.Color("#e9b949"); // estrella: oro y oro claro al donar

function animar() {
  // fuera de pantalla o con la pestaña oculta no se dibuja nada
  if (!enPantallaAhora || document.hidden) { bucleActivo = false; return; }
  const inicio = performance.now();
  const dt = Math.min(reloj.getDelta(), 0.05);
  tiempoTotal += dt;
  const t = tiempoTotal;

  // Luz del cursor
  luzCursor.x = lerp(luzCursor.x, raton.x, Math.min(1, dt * 10));
  luzCursor.y = lerp(luzCursor.y, raton.y, Math.min(1, dt * 10));
  luzCursor.intensidad = lerp(luzCursor.intensidad, luzCursor.objetivo, Math.min(1, dt * 6));
  luzRaton.position.copy(enPantalla(luzCursor.x, luzCursor.y, 1.6));
  // sobre el botón de donar la luz del cursor se atenúa: si no, deslumbra en la estrella metálica
  luzRaton.intensity = luzCursor.intensidad * (luzCursor.x > MITAD ? 30 : 12) * (estrellaEncendida ? 0.15 : 1);

  // Calidez del lado oscuro (amanecer al donar)
  const objetivoCalidez = estrellaEncendida && estadoCaravana === "alli" ? 1 : estrellaEncendida ? 0.35 : 0;
  calidez = lerp(calidez, objetivoCalidez, Math.min(1, dt * (objetivoCalidez > calidez ? 0.9 : 1.6)));
  aplicarCalidez();
  cieloTristeCalido.material.opacity = calidez;
  encendidoCanto.value = calidez;
  luzDonacion.intensity = calidez * 34;
  luzFria.intensity = 5 * (1 - calidez);
  arbolSeco.visible = calidez < 0.98;
  materialesCaja.forEach((m) => { m.opacity = 1 - calidez; });
  cajaVacia.visible = calidez < 0.98;

  // Humo de las chimeneas (en el lado oscuro aparece al donar)
  humos.forEach((h) => {
    const fuerza = h.userData.feliz ? 1 : calidez;
    h.children.forEach((s) => {
      const f = (t * 0.25 + s.userData.fase) % 1;
      s.position.set(Math.sin(f * 5 + s.userData.fase * 9) * 0.06 + f * 0.12, f * 0.8, 0);
      s.scale.setScalar(0.12 + f * 0.35);
      s.material.opacity = Math.sin(f * Math.PI) * 0.35 * fuerza;
    });
  });

  // Luces del árbol que titilan
  lucesArbol.forEach((m, i) => { m.emissiveIntensity = 2.2 + Math.sin(t * 2.6 + i * 1.7) * 1.4; });
  arbolFeliz.userData.estrella.rotation.y = Math.sin(t * 1.1) * 0.35;

  // Caravana
  const objetivoCaravana = estadoCaravana === "yendo" || estadoCaravana === "alli" ? 1 : 0;
  const paso = dt / CARAVANA.viaje;
  progresoCaravana = limitar(progresoCaravana + (objetivoCaravana ? paso : -paso), 0, 1);
  const avance = suave(progresoCaravana);
  const corriendo = progresoCaravana > 0 && progresoCaravana < 1;
  const bote = corriendo ? Math.abs(Math.sin(t * 11)) : 0;
  arbolFeliz.position.x = lerp(ARBOL_X, -ARBOL_X, avance);
  arbolFeliz.position.y = SUELO + (corriendo ? 0.25 + bote * 0.08 : 0);
  arbolFeliz.rotation.z = corriendo ? Math.sin(t * 11) * 0.03 : 0;
  ninosFelices.forEach((n, i) => {
    n.raiz.position.x = lerp(n.casa, n.destino, avance);
    n.raiz.position.y = SUELO + (corriendo ? Math.abs(Math.sin(t * 11 + i)) * 0.12 : 0);
    n.raiz.rotation.y = corriendo ? (objetivoCaravana ? 0.6 : -0.6) : 0;
    if (n.salto > 0) n.salto = Math.max(0, n.salto - dt);
    poseNino(n, t);
  });
  ninosTristes.forEach((n) => {
    n.alegria = lerp(n.alegria, n.objetivo, Math.min(1, dt * 3.2));
    poseNino(n, t);
  });

  // Estrella de donar
  estrellaDonar.escala = lerp(estrellaDonar.escala, estrellaEncendida ? 1.14 : 1, Math.min(1, dt * 8));
  estrellaDonar.malla.scale.setScalar(estrellaDonar.escala);
  estrellaDonar.malla.rotation.z += dt * (estrellaEncendida ? 0.6 : 0.15);
  estrellaDonar.malla.rotation.y = Math.sin(t * 1.3) * 0.25;
  estrellaDonar.material.color.lerp(estrellaEncendida ? _crema : _oro, Math.min(1, dt * 5));
  estrellaDonar.material.emissiveIntensity = lerp(estrellaDonar.material.emissiveIntensity, estrellaEncendida ? 0.04 : 0.12, Math.min(1, dt * 5));

  pintarLetras(dt);

  // Santa, regalos (física), nieve y partículas
  moverSanta(t, dt);
  if (t >= lados.feliz.proximo) {
    soltarRegalo(lados.feliz);
    lados.feliz.proximo = t + azar(...CAIDA.cadaFeliz);
  }
  if (estrellaEncendida && estadoCaravana === "alli" && t >= lados.triste.proximo) {
    soltarRegalo(lados.triste);
    lados.triste.proximo = t + CAIDA.cadaDonando;
  }
  fisica.step(1 / 60, dt, 3);
  sincronizarRegalos();
  moverNieve(dt, t);
  particulas.actualizar(dt);

  // las sombras se recalculan cada 2 fotogramas (cada 3 en la tarjeta pequeña)
  renderizador.shadowMap.needsUpdate = (cuadro++ % (escalaPantalla < 0.5 ? 3 : 2)) === 0;
  compositor.render(dt);

  // calidad adaptativa: si los fotogramas tardan, menos resolución; si sobra, más
  mediaFotograma = lerp(mediaFotograma, performance.now() - inicio, 0.1);
  // (los 4 primeros segundos no cuentan: ahí se compilan sombreadores y llegan texturas)
  if (tiempoTotal > 4 && tiempoTotal - ultimoAjuste > 1.5) {
    ultimoAjuste = tiempoTotal;
    if (mediaFotograma > 24 && calidad > 0.8) { calidad *= 0.9; aplicarResolucion(); }
    else if (mediaFotograma < 9 && calidad < 1) { calidad = Math.min(1, calidad / 0.85); aplicarResolucion(); }
  }
  requestAnimationFrame(animar);
}

/* ---------- 16. Escalado e inicio ---------- */

function calcularEscala(anchoVentana, altoVentana) {
  // en la web de pósters el cartel llena su tarjeta (y crece al ampliarlo)
  const margen = incrustado ? 0 : anchoVentana < 600 ? 12 : CARTEL.margenVentana;
  const maximo = incrustado ? 3 : 1;
  return Math.max(Math.min((anchoVentana - margen) / CARTEL.ancho, (altoVentana - margen) / CARTEL.alto, maximo), 0.1);
}

// Resolución: se dibujan solo los píxeles que el cartel ocupa de verdad en pantalla
// (en una tarjeta de 300 px, unas 8 veces menos que a tamaño completo), y si el equipo
// va justo se baja un poco más sobre la marcha.
let escalaPantalla = 1;
let calidad = 1;
let densidadActual = 0;
function aplicarResolucion() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const densidad = Math.max(0.25, Math.min(escalaPantalla * Math.max(dpr * calidad, 1), esMovil ? 1.25 : 2));
  if (Math.abs(densidad - densidadActual) < 0.02) return;
  densidadActual = densidad;
  renderizador.setPixelRatio(densidad);
  compositor.setPixelRatio(densidad);
  compositor.setSize(CARTEL.ancho, CARTEL.alto);
}

function ajustarEscala() {
  const escala = calcularEscala(window.innerWidth, window.innerHeight);
  escenario.style.width = `${CARTEL.ancho * escala}px`;
  escenario.style.height = `${CARTEL.alto * escala}px`;
  cartel.style.transform = `scale(${escala})`;
  escalaPantalla = escala;
  aplicarResolucion();
}

function iniciarCartel() {
  cartel.addEventListener("mousemove", soloRaton(seguirCursor));
  cartel.addEventListener("mouseleave", soloRaton(soltarCursor));
  botonDonar.addEventListener("mouseenter", soloRaton(encenderEstrella));
  botonDonar.addEventListener("mouseleave", soloRaton(apagarEstrella));
  cartel.addEventListener("click", pulsarCartel);
  cartel.addEventListener("touchstart", tocarCartel, { passive: true });
  cartel.addEventListener("touchmove", deslizarDedo, { passive: true });
  cartel.addEventListener("touchend", levantarDedo);
  cartel.addEventListener("touchcancel", levantarDedo);
  botonDonar.addEventListener("touchstart", tocarEstrella, { passive: true });
  botonDonar.addEventListener("click", pulsarEstrella);
  window.addEventListener("resize", ajustarEscala);
  ajustarEscala();

  // unos regalos ya en el suelo para empezar
  for (let i = 0; i < 6; i++) soltarRegalo(lados.feliz, { y: SUELO + 0.3 + i * 0.45 });

  arrancado = true;
  alReanudar = reanudar;
  requestAnimationFrame(() => requestAnimationFrame(avanzarCarga)); // primer fotograma dibujado
  // cuando el 3D ya ha dibujado un par de fotogramas, se funde la vista previa

  document.addEventListener("visibilitychange", () => { if (!document.hidden) reanudar(); });
  reanudar();
}

iniciarCartel();

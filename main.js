/* =========================================================
   CARTEL INTERACTIVO · 21 DE DICIEMBRE · FUNDACIÓN ITACA
   React (vía CDN + Babel)
   ========================================================= */

const { useState, useEffect, useMemo } = React;

/* ---------- Configuración ---------- */

const POSTER_ANCHO = 848;
const POSTER_ALTO = 1200;

// Cada regalo esconde un deseo
const REGALOS = [
  { id: 1, color: "#d7263d", lazo: "#f5b942", ancho: 170, alto: 140, icono: "📚", deseo: "un cuento" },
  { id: 2, color: "#2a9d8f", lazo: "#fff4e0", ancho: 210, alto: 175, icono: "🧸", deseo: "un peluche" },
  { id: 3, color: "#f5b942", lazo: "#d7263d", ancho: 160, alto: 120, icono: "⚽", deseo: "una pelota" },
];

// Tres capas de nieve: cuanto más "cerca", más se mueve con el ratón
const CAPAS_NIEVE = [
  { id: "lejos", cantidad: 45, min: 2, max: 4, profundidad: 10 },
  { id: "medio", cantidad: 25, min: 4, max: 7, profundidad: 25 },
  { id: "cerca", cantidad: 10, min: 8, max: 14, profundidad: 55 },
];

/* ---------- Utilidades ---------- */

function crearCopos(cantidad, tamMin, tamMax) {
  return Array.from({ length: cantidad }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: tamMin + Math.random() * (tamMax - tamMin),
    duracion: 8 + Math.random() * 10,
    retraso: -Math.random() * 18, // negativo: los copos empiezan ya repartidos
    opacidad: 0.4 + Math.random() * 0.6,
  }));
}

// Escala el cartel para que quepa en pantalla sin deformarse.
// Usa addEventListener("resize") sobre window.
function useEscala() {
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    function ajustarEscala() {
      const margen = 32;
      const s = Math.min(
        (window.innerWidth - margen) / POSTER_ANCHO,
        (window.innerHeight - margen) / POSTER_ALTO,
        1
      );
      setEscala(Math.max(s, 0.1));
    }

    ajustarEscala();
    window.addEventListener("resize", ajustarEscala);
    return () => window.removeEventListener("resize", ajustarEscala);
  }, []);

  return escala;
}

/* ---------- Componentes ---------- */

function CapaNieve({ capa, dx, dy }) {
  const copos = useMemo(() => crearCopos(capa.cantidad, capa.min, capa.max), [capa]);

  return (
    <div
      className={`nieve nieve--${capa.id}`}
      style={{ transform: `translate(${dx * capa.profundidad}px, ${dy * capa.profundidad}px)` }}
    >
      {copos.map((c) => (
        <span
          key={c.id}
          className="copo"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size,
            opacity: c.opacidad,
            animationDuration: `${c.duracion}s`,
            animationDelay: `${c.retraso}s`,
          }}
        />
      ))}
    </div>
  );
}

function Regalo({ regalo }) {
  const [abierto, setAbierto] = useState(false);

  // INTERACCIÓN 1 · mouseenter → el regalo se abre
  function abrirRegalo() {
    setAbierto(true);
  }

  // INTERACCIÓN 2 · mouseleave → el regalo se cierra
  function cerrarRegalo() {
    setAbierto(false);
  }

  return (
    <div
      className="regalo"
      onMouseEnter={abrirRegalo}
      onMouseLeave={cerrarRegalo}
      style={{
        "--color": regalo.color,
        "--lazo": regalo.lazo,
        width: regalo.ancho,
        transform: abierto ? "translateY(-8px) scale(1.06)" : "translateY(0) scale(1)",
      }}
    >
      <div
        className="regalo__contenido"
        style={{
          opacity: abierto ? 1 : 0,
          transform: abierto
            ? "translate(-50%, -110px) scale(1)"
            : "translate(-50%, 0) scale(0.4)",
        }}
      >
        <span className="regalo__icono">{regalo.icono}</span>
        <span className="regalo__deseo">{regalo.deseo}</span>
      </div>

      <div
        className="regalo__luz"
        style={{ bottom: regalo.alto - 10, opacity: abierto ? 1 : 0 }}
      />

      <div
        className="regalo__tapa"
        style={{
          width: regalo.ancho + 20,
          transform: abierto ? "translate(-30px, -60px) rotate(-18deg)" : "none",
        }}
      />

      <div
        className="regalo__caja"
        style={{
          width: regalo.ancho,
          height: regalo.alto,
          filter: abierto ? "brightness(1.15)" : "brightness(1)",
          boxShadow: abierto
            ? "0 0 70px 12px rgba(255, 205, 120, 0.55)"
            : "0 18px 30px rgba(0, 0, 0, 0.35)",
        }}
      />
    </div>
  );
}

function BotonDonar() {
  const [activo, setActivo] = useState(false);

  return (
    <div className="donar-bloque">
      <button
        className="donar"
        onMouseEnter={() => setActivo(true)}
        onMouseLeave={() => setActivo(false)}
        style={{
          background: activo ? "var(--rojo)" : "var(--oro)",
          color: activo ? "var(--crema)" : "var(--noche)",
          transform: activo ? "scale(1.06) rotate(-2deg)" : "none",
        }}
      >
        {activo ? "¡Gracias por sumar! ♥" : "Dona un regalo →"}
      </button>
      <p className="donar-bloque__info">Desde 10 € · [Bizum / web de donación]</p>
    </div>
  );
}

function Poster() {
  // Posición del ratón dentro del cartel, de 0 a 1 (centro = 0.5)
  const [raton, setRaton] = useState({ x: 0.5, y: 0.4 });

  // INTERACCIÓN 3 · mousemove → nieve con profundidad, "21" en 3D y luz que sigue al cursor
  function moverRaton(evento) {
    const rect = evento.currentTarget.getBoundingClientRect();
    setRaton({
      x: (evento.clientX - rect.left) / rect.width,
      y: (evento.clientY - rect.top) / rect.height,
    });
  }

  // Al salir del cartel, todo vuelve al centro
  function centrarRaton() {
    setRaton({ x: 0.5, y: 0.4 });
  }

  // Desplazamiento respecto al centro (-0.5 … 0.5)
  const dx = raton.x - 0.5;
  const dy = raton.y - 0.5;

  return (
    <div className="poster" onMouseMove={moverRaton} onMouseLeave={centrarRaton}>
      <div
        className="luz-calida"
        style={{
          background: `radial-gradient(circle 280px at ${raton.x * 100}% ${raton.y * 100}%, rgba(255, 190, 110, 0.28), transparent 70%)`,
        }}
      />

      <CapaNieve capa={CAPAS_NIEVE[0]} dx={dx} dy={dy} />
      <CapaNieve capa={CAPAS_NIEVE[1]} dx={dx} dy={dy} />

      <header className="cabecera">
        <span>Fundación ITACA · L'Hospitalet</span>
        <span>Navidad solidaria</span>
      </header>

      <div className="fecha">
        <span
          className="fecha__numero fecha__numero--sombra"
          style={{ transform: `translate(${dx * 40}px, ${dy * 40}px)` }}
        >
          21
        </span>
        <span
          className="fecha__numero"
          style={{ transform: `translate(${dx * -15}px, ${dy * -15}px)` }}
        >
          21
        </span>
      </div>

      <div className="fecha-texto">
        <span className="fecha-texto__de">de</span>
        <span className="fecha-texto__mes">diciembre</span>
        <span className="fecha-texto__extra">Recogida de regalos</span>
      </div>

      <h1 className="titulo">
        <span>Ningún niño</span>
        <span className="titulo__destacado">sin regalo</span>
      </h1>

      <p className="pista">pasa el ratón<br />y abre una ilusión ↓</p>

      <div className="colina" />

      <div className="regalos">
        {REGALOS.map((regalo) => (
          <Regalo key={regalo.id} regalo={regalo} />
        ))}
      </div>

      <p className="mensaje">
        Con tu donación, un niño o una niña en riesgo de exclusión
        <strong> abrirá un regalo esta Navidad</strong>. Un pequeño gesto, una gran ilusión.
      </p>

      <BotonDonar />

      <footer className="pie">
        <div className="logos">
          <div className="logo-hueco">Logo<br />Fundación ITACA</div>
          <div className="logo-hueco">Logo<br />colaborador</div>
          <div className="logo-hueco">Logo<br />colaborador</div>
        </div>
        <p className="pie__info">21.12 · L'Hospitalet de Llobregat</p>
      </footer>

      <CapaNieve capa={CAPAS_NIEVE[2]} dx={dx} dy={dy} />
    </div>
  );
}

function App() {
  const escala = useEscala();

  return (
    <div
      className="escenario"
      style={{ width: POSTER_ANCHO * escala, height: POSTER_ALTO * escala }}
    >
      <div className="escalador" style={{ transform: `scale(${escala})` }}>
        <Poster />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

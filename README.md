# Foco de Esperanza

Cartel digital interactivo (848 × 1200 px) para la campaña de Navidad de la **Fundación ITACA** (L'Hospitalet):
donaciones para comprar regalos a niños y niñas en riesgo de exclusión social. **21 de diciembre.**

Actividad 0612 · THE INTERACTIVE POSTER · Desarrollo web en entorno cliente.
Hecho con HTML, CSS y JavaScript, sin librerías ni frameworks.

![Captura del cartel con el regalo encendido](captura/cartel.png)

## Concepto

El cartel está a oscuras y **el cursor es una linterna**. Quien lo mira lleva la luz: al moverla descubre,
escritos a mano, los deseos que hay escondidos en la oscuridad («una bici», «un cuento», «un peluche»…).
Cuando la luz llega al regalo del centro, este se enciende, se abre y su resplandor alcanza todos los deseos a la vez.

Es el mensaje de la campaña convertido en gesto: _Ilumina su Navidad. Dona hoy._
La información obligatoria (fecha, tema, mensaje y entidad) es siempre legible, con o sin luz.

Paleta: negro, blanco y un único acento naranja (`#FF5722`), reservado para la luz y la llamada a donar.
Tipografías: Montserrat (titulares), JetBrains Mono (datos) y Caveat (los deseos, con letra de niño).

## Estructura

```
├── index.html      Estructura semántica del cartel y SVG del regalo
├── style.css       Variables, reset, composición y transiciones
├── main.js         Eventos e interacciones
├── img/logos/      Logos oficiales de las entidades
└── captura/        Capturas del cartel
```

El cartel se construye en tres capas apiladas:

1. `.foco`: el resplandor naranja.
2. `.revelado`: la trama de puntos, los deseos y el eco del «21». Tiene una máscara CSS con la forma del foco, así que solo se ve donde llega la luz.
3. El contenido: fecha, regalo, lema, botón y pie.

`main.js` está ordenado en nueve bloques: configuración, referencias al DOM, estado, cálculos, pintado,
`mousemove`, `mouseenter`/`mouseleave`, escalado e inicio. Todos los `addEventListener` están juntos en `iniciarCartel()`.

**No hay ninguna regla `:hover` en el CSS.** Las transiciones están en `style.css`, pero quien las dispara es siempre JavaScript.

## Eventos de JavaScript

| Evento | Elemento | Función | Qué hace |
| --- | --- | --- | --- |
| `mousemove` | `#cartel` | `seguirCursor` | La luz sigue al cursor y la tipografía se desplaza en sentido contrario |
| `mouseenter` | `#regalo` | `encenderRegalo` | El regalo crece, brilla y se abre; la luz se expande |
| `mouseleave` | `#regalo` | `apagarRegalo` | El regalo vuelve a su tamaño y brillo iniciales |
| `mouseenter` / `mouseleave` | `#boton-donar` | `encenderElemento` / `apagarElemento` | El botón reutiliza las mismas funciones que el regalo |
| `mouseleave` | `#cartel` | `devolverFocoAlReposo` | La luz vuelve al regalo cuando el cursor sale del cartel |
| `resize` | `window` | `ajustarEscala` | Reduce el cartel entero si la ventana es más pequeña, sin deformarlo |

## Las tres interacciones

### 1 · `mouseenter`: el regalo se enciende

Al entrar el cursor en el regalo, `encenderElemento()` modifica desde JavaScript **dos propiedades visuales**:

```js
elemento.style.transform = `scale(${elemento.dataset.escala})`;   // crece un 8 %
elemento.style.filter = BRILLO.encendido;                         // resplandor naranja
```

Además añade la clase `esta-encendido`, que levanta la tapa y hace aparecer la estrella, los rayos y los destellos.
`encenderRegalo()` amplía también el radio del foco de 300 a 520 px y cambia el texto de la pista
por «Tu donación enciende su Navidad». La entrada es rápida y con un pequeño rebote.

### 2 · `mouseleave`: vuelve al estado inicial

Al salir, `apagarElemento()` devuelve `transform` a `scale(1)` y `filter` a un brillo transparente, y quita la clase.
`apagarRegalo()` restaura el radio del foco y el texto de la pista. La salida es distinta a la entrada:
más lenta y sin rebote, como una luz que se apaga poco a poco.

### 3 · `mousemove`: linterna y parallax

`seguirCursor()` hace tres cosas con las coordenadas del ratón:

1. **Las convierte a coordenadas del cartel.** `obtenerPosicionEnCartel()` usa `clientX`/`clientY` y
   `getBoundingClientRect()` para obtener un punto entre (0, 0) y (848, 1200), aunque el cartel esté escalado.
2. **Mueve la luz.** El punto se guarda como _objetivo_. Un bucle con `requestAnimationFrame` acerca la luz
   un 14 % en cada fotograma (`interpolar()`), lo que le da inercia, y escribe la posición en las variables CSS
   `--foco-x`, `--foco-y` y `--foco-radio`. El resplandor y la máscara de la capa revelada se dibujan con ellas.
3. **Desplaza la tipografía.** `calcularDesplazamientoParallax()` mide cuánto se ha alejado la luz de su punto de
   reposo, lo multiplica por el `data-profundidad` de cada capa e invierte el signo:

   ```js
   const desvioX = (posicion.x - FOCO.reposo.x) / (CARTEL.ancho / 2);
   return { x: -desvioX * profundidad, ... };
   ```

   La fecha y el lema (profundidad positiva) se alejan del cursor. El eco naranja del «21» y los deseos
   (profundidad negativa) lo acompañan. Al moverse en sentidos opuestos aparece la sensación de profundidad.

El lector de la cabecera (`FOCO X 0424 · Y 0670`) muestra en directo las coordenadas que usa el cartel.

Si el sistema tiene activada la opción de reducir movimiento (`prefers-reduced-motion`), el parallax se desactiva.

## Cómo ejecutarlo

Abrir `index.html` en el navegador. No necesita servidor ni instalación; solo conexión para cargar las fuentes de Google Fonts.

## Branding

El pie usa un símbolo y unos sellos tipográficos propios. Para poner los logos oficiales, guardar los archivos en
`img/logos/` y sustituir los bloques del `<footer>` de `index.html` por etiquetas `<img>`.

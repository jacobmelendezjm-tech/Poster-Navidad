# Ilumina su Navidad · 3D

Cartel digital interactivo (848 × 1200 px) en **3D** para la campaña de Navidad de la **Associació Educativa Itaca**
(L'Hospitalet): donaciones para comprar regalos a niños y niñas en riesgo de exclusión social. **21 de diciembre.**

Actividad 0612 · THE INTERACTIVE POSTER · Desarrollo web en entorno cliente.
Diseño y desarrollo: **Jacob Meléndez** · DAW 2 · PlanetaFP.

**Web:** https://posternavidad.vercel.app

![El cartel en reposo](captura/dos-navidades-reposo.png)

## Concepto

**Dos Navidades, una al lado de la otra.** A la izquierda, un pueblo navideño iluminado, un árbol verde lleno de
luces y niños felices con sus regalos. A la derecha, el mismo pueblo a oscuras, tapiado, con un árbol seco y los
mismos niños sentados en el suelo, tristes y sin regalos.

- **El cursor es una luz cálida** que alumbra el lado oscuro. Al pasar por un niño triste, se levanta feliz y le cae
  un regalo en las manos; al pasar por uno feliz, salta y lanza su regalo al aire.
- **Al donar** (cursor sobre la estrella), los niños felices cargan el árbol y los regalos y cruzan corriendo al lado
  oscuro. El lado oscuro se calienta como un amanecer: cambia el cielo, se encienden las ventanas, desaparecen las
  tablas, la nieve se vuelve blanca, los niños tristes se levantan uno a uno y llueven regalos.
- **Al dejar de donar**, la caravana vuelve a casa y el lado oscuro se congela: los regalos se quedan helados donde
  estén (también en el aire) y los niños se sientan y lloran.
- **Santa Claus** cruza el cielo en su trineo cada 15 s soltando regalos (en el lado oscuro, solo mientras se dona).
- **Los regalos 3D** caen, se apilan y, al hacer click, estallan en confeti y fuegos artificiales.
- **La nieve** cae y se va acumulando en el suelo.

## Cómo está hecho

Todo el cartel es una escena **3D en tiempo real con Three.js (WebGL)** y física con **cannon-es**, cargados desde
CDN con un `importmap`.

**Realismo:**

- **Luz de entorno real**: un HDRI nocturno de Poly Haven ilumina la escena y se refleja en bolas, oro y letras.
- **Texturas fotográficas PBR** (Poly Haven, CC0): nieve, ladrillo, tejas y madera, con mapa de relieve y rugosidad.
- **Modelos reales** (Poly Haven, CC0): farolas, faroles de latón y la caja de cartón vacía.
- **Abetos hechos de ramas con agujas** y nieve en las puntas; el árbol seco es un tronco con ramas recursivas.
- **Casas** con hastiales, tejas, nieve en el tejado, carámbanos, chimenea con humo, ventanas con cortinas y luz.
- **Física de verdad**: los regalos caen con gravedad, chocan, ruedan y se apilan; al hacer click en uno, los de
  encima caen al hueco. Al dejar de donar se congelan (se vuelven estáticos y de hielo).
- **Brillo (bloom)**, niebla, sombras suaves, suelo nevado con dunas y confeti de papelitos que revolotean.
Por encima del lienzo solo hay HTML para los textos pequeños (cabecera, etiquetas, pie con logos, créditos) y el
enlace del botón de donar, para que se lean nítidos y el botón funcione con teclado.

```
├── index.html      Lienzo 3D, textos y enlaces por encima
├── style.css       Posición de los textos, escalado del cartel
├── main.js         Toda la escena 3D y la interacción (módulo ES)
├── servidor.js     Servidor local para verlo (node servidor.js)
├── assets/         HDRI, texturas PBR y modelos 3D (Poly Haven, CC0)
├── img/logos/      Logos de Itaca y PlanetaFP
└── captura/        Capturas del cartel
```

`main.js` está ordenado en quince bloques: configuración, DOM y estado, motor 3D (renderizador, cámara y luces),
materiales que se calientan al donar, piezas (regalos, casas, árboles, gente), niños, el mundo, lema 3D y estrella,
Santa, regalos que caen, nieve, partículas, interacción, bucle de animación e inicio.

Claves técnicas:

- **Cámara calculada** para que el plano z = 0 mida exactamente 848 × 1200 px: `enPantalla(px, py, z)` coloca cada
  objeto en el píxel del cartel que le corresponde a cualquier profundidad.
- **Materiales con dos colores** (`matPar`): cada material del lado oscuro guarda su color frío y su color cálido, y
  se mezclan según la `calidez` (0 → 1) al donar.
- **Niños articulados**: piernas, brazos y cabeza con bisagras; un valor de alegría (0 sentado y triste → 1 de pie y
  feliz) mueve la pose, la cara, los colores y el regalo.
- **Regalos apilados** con un mapa de alturas por columnas; cada regalo reserva su hueco al empezar a caer.
- **Click en regalos** con `Raycaster`; confeti y chispas con `Points` (las chispas con mezcla aditiva).
- **Lema extruido** con `TextGeometry`: las letras cercanas al cursor se acercan, giran y se vuelven doradas.

## Eventos

| Evento | Elemento | Qué hace |
| --- | --- | --- |
| `mousemove` | `#cartel` | La luz cálida sigue al cursor; letras, niños tristes y felices reaccionan |
| `mouseleave` | `#cartel` | La luz se apaga y las letras vuelven a su sitio |
| `mouseenter` | `#donar` | Donar: la estrella crece y gira, sale la caravana, el lado oscuro se calienta |
| `mouseleave` | `#donar` | Dejar de donar: vuelve la caravana, todo se congela y los niños lloran |
| `click` | `#cartel` | El regalo 3D pulsado estalla en confeti y fuegos artificiales |
| `touchstart` / `touchmove` / `touchend` | `#cartel`, `#donar` | En móviles el dedo hace de cursor; la estrella se enciende con el primer toque y abre la página de donativos con el segundo |
| `resize` | `window` | Reduce el cartel entero si la ventana es más pequeña, sin deformarlo |

No hay ninguna regla `:hover` en el CSS: los cambios los dispara JavaScript.

## Móviles y rendimiento

- El dedo hace de cursor; el cartel no hace scroll ni zoom al deslizar (`touch-action: none`).
- En móviles se reduce la resolución, se quitan las sombras y cae la mitad de nieve.
- `index.html` enlaza `style.css` y `main.js` con `?v=…`, para que el navegador no mezcle archivos viejos guardados.

## Cómo ejecutarlo

Necesita un servidor local (los módulos ES no se cargan desde `file://`) y conexión para Three.js y las fuentes:

```
node servidor.js
```

y abrir http://localhost:8765. (Mejor que `python -m http.server`, que en Windows a veces corta a medias las
descargas de las texturas.) En Vercel funciona tal cual.

## Créditos de recursos

HDRI, texturas y modelos de [Poly Haven](https://polyhaven.com) (licencia CC0): `kloppenheim_02_puresky`,
`snow_02`, `castle_brick_02_white`, `clay_roof_tiles_02`, `dark_wooden_planks`, `street_lamp_01`, `Lantern_01`,
`cardboard_box_01`.

La versión anterior en 2D (SVG, sin librerías) está guardada fuera de esta carpeta, en `version-2d/`.

## La entidad y el branding

El nombre oficial es **Associació Educativa Itaca**: asociación sin ánimo de lucro de Collblanc-La Torrassa
(L’Hospitalet de Llobregat), declarada de utilidad pública por la Generalitat de Catalunya, que desde 1977 trabaja
en la educación en el tiempo libre de niños, niñas, jóvenes y familias.

El pie incluye el logotipo oficial (de aeitaca.org), la declaración de utilidad pública y los datos de contacto:
C/ Montseny, 22 · 08903 L’Hospitalet · aeitaca.org · 934 036 997 · @aeitaca. El botón de donar enlaza a
https://aeitaca.org/haz-un-donativo/. El logo de PlanetaFP se descargó de planetafp.es.

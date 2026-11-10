# The Interactive Poster · 21 de diciembre · Fundación ITACA

Cartel digital interactivo (848 × 1200 px) para la campaña de Navidad de la Fundación ITACA (L'Hospitalet):
donaciones para comprar regalos a niños y niñas en riesgo de exclusión.

Actividad 0612 · Desarrollo web en entorno cliente.

## Concepto

_(Pendiente: explicar la idea del cartel cuando esté cerrado el diseño.)_

## Estructura

```
cartel-itaca/
├── index.html      Estructura y carga de React
├── style.css       Estilos del cartel
├── main.js         Componentes React e interacciones
├── img/            Imágenes e ilustraciones
│   └── logos/      Logos de Fundación ITACA y colaboradores
└── captura/        Captura de pantalla final para la entrega
```

## Eventos de JavaScript utilizados

| Evento | Elemento | Qué hace |
| --- | --- | --- |
| `mouseenter` | _(pendiente)_ | _(pendiente)_ |
| `mouseleave` | _(pendiente)_ | _(pendiente)_ |
| `mousemove` | _(pendiente)_ | _(pendiente)_ |
| `resize` (`addEventListener`) | `window` | Escala el cartel para que quepa en pantalla sin deformarse |

## Cómo ejecutarlo

Abrir `index.html` con **Live Server** en VS Code (clic derecho → "Open with Live Server").
No funciona con doble clic porque Babel necesita un servidor para leer `main.js`.

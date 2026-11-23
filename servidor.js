// Servidor local sencillo para ver el cartel: node servidor.js  →  http://localhost:8765
// (python -m http.server en Windows corta a veces descargas de imágenes grandes;
//  este sirve los archivos enteros y en paralelo, sin instalar nada.)
const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = __dirname;
const PUERTO = Number(process.env.PORT) || 8765;
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".hdr": "application/octet-stream",
};

http.createServer((peticion, respuesta) => {
  let ruta = decodeURIComponent(new URL(peticion.url, "http://x").pathname);
  if (ruta.endsWith("/")) ruta += "index.html";
  const archivo = path.join(RAIZ, path.normalize(ruta));
  if (!archivo.startsWith(RAIZ)) { respuesta.writeHead(403).end(); return; }
  fs.readFile(archivo, (error, datos) => {
    if (error) { respuesta.writeHead(404).end("No encontrado"); return; }
    respuesta.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream", "Content-Length": datos.length, "Cache-Control": "no-cache" });
    respuesta.end(datos);
  });
}).listen(PUERTO, "127.0.0.1", () => console.log(`Cartel en http://localhost:${PUERTO}`));

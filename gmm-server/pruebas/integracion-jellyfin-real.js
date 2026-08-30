"use strict";

/* Prueba manual contra el Jellyfin configurado en PRIVADO/configuracion.json.
   No imprime claves, rutas de archivos ni enlaces temporales. */

const { once } = require("node:events");
const { cargarConfiguracion } = require("../src/configuracion");
const { GestorJellyfin } = require("../src/jellyfin");
const { crearServidorApi } = require("../src/api");

(async function () {
  const configuracion = cargarConfiguracion();
  if (!configuracion.jellyfin.activo) throw new Error("Jellyfin no está configurado.");
  const gestor = new GestorJellyfin(configuracion);
  const catalogo = await gestor.iniciar();
  const servidor = crearServidorApi(configuracion, gestor, { error: console.error });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  try {
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const pelicula = catalogo.peliculas.find(function (item) { return item.extension === ".mkv"; }) ||
      catalogo.peliculas[0];
    const autorizacion = { Authorization: "Bearer " + configuracion.claveAdministracion };
    const enlace = await fetch(base + "/api/medios/" + encodeURIComponent(pelicula.id), {
      headers: autorizacion
    });
    if (!enlace.ok) throw new Error("GMM Server no emitió el enlace: " + enlace.status);
    const datos = await enlace.json();
    const video = await fetch(base + datos.ruta);
    if (!video.ok) throw new Error("Jellyfin no entregó el vídeo: " + video.status);
    const tipo = video.headers.get("content-type") || "";
    if (!tipo.startsWith("video/")) throw new Error("Jellyfin devolvió un tipo inesperado: " + tipo);
    if (video.body) await video.body.cancel();
    console.log(JSON.stringify({
      estado: "ok",
      peliculas: catalogo.resumen.total,
      prueba: { titulo: pelicula.tituloDetectado, origen: pelicula.extension, salida: tipo }
    }, null, 2));
  } finally {
    servidor.close();
  }
})().catch(function (error) {
  console.error("INTEGRACION_JELLYFIN_FALLO:", error.message);
  process.exitCode = 1;
});

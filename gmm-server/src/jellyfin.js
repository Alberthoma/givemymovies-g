"use strict";

const path = require("node:path");
const { Readable } = require("node:stream");

function limpiarBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function extensionDeFuente(fuente) {
  const contenedor = String(fuente && fuente.Container || "").split(",")[0].trim().toLowerCase();
  if (contenedor) return "." + contenedor;
  const ruta = String(fuente && fuente.Path || "");
  return path.extname(ruta).toLowerCase() || ".mkv";
}

function nombreArchivo(item, fuente) {
  const ruta = String(fuente && fuente.Path || "");
  return path.basename(ruta) || `${item.Name || "Película"}${extensionDeFuente(fuente)}`;
}

class GestorJellyfin {
  constructor(configuracion, opciones) {
    this.configuracion = configuracion;
    this.base = limpiarBase(configuracion.jellyfin.url);
    this.clave = configuracion.jellyfin.claveApi;
    this.fetch = opciones && opciones.fetch || fetch;
    this.esperar = opciones && opciones.esperar || function (ms) {
      return new Promise(function (resolver) { setTimeout(resolver, ms); });
    };
    this.catalogo = {
      version: 2,
      actualizadoEn: null,
      resumen: { total: 0, disponibles: 0, copiandose: 0, carpetas: 1 },
      carpetas: [{ nombre: "Jellyfin", disponible: true, peliculas: 0 }],
      peliculas: []
    };
    this.porId = new Map();
  }

  async pedir(ruta, opciones) {
    const respuesta = await this.fetch(this.base + ruta, Object.assign({}, opciones, {
      headers: Object.assign({}, opciones && opciones.headers, { "X-Emby-Token": this.clave })
    }));
    if (!respuesta.ok) throw new Error(`Jellyfin respondió ${respuesta.status} al pedir ${ruta}.`);
    return respuesta;
  }

  async iniciar() {
    return this.actualizar();
  }

  obtenerPublico() {
    return this.catalogo;
  }

  async escanearConfirmando() {
    await this.pedir("/Library/Refresh", { method: "POST" });
    await this.esperarEscaneoBiblioteca();
    return this.actualizar();
  }

  async esperarEscaneoBiblioteca() {
    /* Jellyfin responde 204 apenas ENCOLA el escaneo. Esperamos a que su tarea
       RefreshLibrary termine para no devolver a GMM el catálogo anterior. */
    let vistoEnMarcha = false;
    for (let intento = 0; intento < 180; intento += 1) {
      await this.esperar(intento === 0 ? 500 : 1000);
      const respuesta = await this.pedir("/ScheduledTasks");
      const tareas = await respuesta.json();
      const tarea = (tareas || []).find(function (item) {
        return item.Key === "RefreshLibrary" || /library|biblioteca/i.test(item.Name || "");
      });
      if (!tarea) return;
      if (tarea.State === "Running") {
        vistoEnMarcha = true;
        continue;
      }
      if (vistoEnMarcha || intento > 0) return;
    }
    throw new Error("Jellyfin tardó demasiado en escanear la biblioteca.");
  }

  async actualizar() {
    const campos = "ProviderIds,MediaSources,ProductionYear,DateCreated";
    const respuesta = await this.pedir("/Items?Recursive=true&IncludeItemTypes=Movie&Fields=" +
      encodeURIComponent(campos) + "&Limit=100000");
    const datos = await respuesta.json();
    const ahora = new Date().toISOString();
    const internas = (datos.Items || []).map(function (item) {
      const fuente = item.MediaSources && item.MediaSources[0] || {};
      const tmdb = item.ProviderIds && Number(item.ProviderIds.Tmdb);
      const extension = extensionDeFuente(fuente);
      return {
        id: "jellyfin:" + item.Id,
        jellyfinId: item.Id,
        mediaSourceId: fuente.Id || null,
        origen: "jellyfin",
        carpeta: "Jellyfin",
        nombreArchivo: nombreArchivo(item, fuente),
        tituloDetectado: item.Name || "Sin título",
        anioDetectado: item.ProductionYear || null,
        extension,
        tamanoBytes: Number(fuente.Size) || 0,
        modificadoEn: item.DateCreated || ahora,
        disponible: true,
        estadoArchivo: "disponible",
        tmdb: Number.isInteger(tmdb) && tmdb > 0 ? { id: tmdb } : null,
        compatibilidad: "jellyfin"
      };
    });
    internas.sort(function (a, b) {
      return a.tituloDetectado.localeCompare(b.tituloDetectado, "es", { sensitivity: "base" });
    });
    this.porId = new Map(internas.map(function (item) { return [item.id, item]; }));
    this.catalogo = {
      version: 2,
      actualizadoEn: ahora,
      resumen: { total: internas.length, disponibles: internas.length, copiandose: 0, carpetas: 1 },
      carpetas: [{ nombre: "Jellyfin", disponible: true, peliculas: internas.length, revisadaEn: ahora, mensaje: "Disponible" }],
      peliculas: internas.map(function (item) {
        const copia = Object.assign({}, item);
        delete copia.jellyfinId;
        delete copia.mediaSourceId;
        delete copia.origen;
        return copia;
      })
    };
    return this.catalogo;
  }

  obtenerArchivo(id) {
    return this.porId.get(id) || null;
  }

  async responderMedio(solicitud, respuesta, pelicula, opciones) {
    const original = Boolean(opciones && (opciones.original || opciones.descarga));
    const extension = original ? pelicula.extension : ".mp4";
    const parametros = new URLSearchParams();
    parametros.set("static", original ? "true" : "false");
    if (pelicula.mediaSourceId) parametros.set("mediaSourceId", pelicula.mediaSourceId);
    if (!original) {
      parametros.set("videoCodec", "h264");
      parametros.set("audioCodec", "aac");
      parametros.set("maxWidth", "1920");
      parametros.set("maxHeight", "1080");
      parametros.set("videoBitRate", "12000000");
      parametros.set("audioBitRate", "256000");
      parametros.set("maxAudioChannels", "6");
    }
    const cabeceras = {};
    if (original && solicitud.headers.range) cabeceras.Range = solicitud.headers.range;
    const ruta = `/Videos/${encodeURIComponent(pelicula.jellyfinId)}/stream${extension}?${parametros}`;
    const origen = await this.pedir(ruta, { headers: cabeceras });
    const salida = {};
    ["content-type", "content-length", "content-range", "accept-ranges"].forEach(function (nombre) {
      const valor = origen.headers.get(nombre);
      if (valor) salida[nombre] = valor;
    });
    salida["Cache-Control"] = "no-store";
    salida["X-Content-Type-Options"] = "nosniff";
    salida["Referrer-Policy"] = "no-referrer";
    if (opciones && opciones.descarga) {
      salida["Content-Disposition"] = "attachment; filename*=UTF-8''" + encodeURIComponent(pelicula.nombreArchivo);
    }
    respuesta.writeHead(origen.status, salida);
    if (!origen.body) {
      respuesta.end();
      return;
    }
    Readable.fromWeb(origen.body).on("error", function () { respuesta.destroy(); }).pipe(respuesta);
  }
}

module.exports = { GestorJellyfin, extensionDeFuente, limpiarBase };

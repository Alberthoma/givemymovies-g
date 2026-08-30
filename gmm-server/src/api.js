"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const { rutaCache } = require("./transcodificar");

const fsPromesas = fs.promises;
const VERSION_SERVIDOR = "0.3.0";

const TIPOS_VIDEO = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".ts": "video/mp2t",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg"
};

function responderJson(respuesta, estado, contenido) {
  const cuerpo = JSON.stringify(contenido);
  respuesta.writeHead(estado, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(cuerpo),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer"
  });
  respuesta.end(cuerpo);
}

function cabeceraArchivo(nombre, descarga) {
  const seguro = String(nombre || "pelicula").replace(/[\r\n]/g, " ");
  const tipo = descarga ? "attachment" : "inline";
  return tipo + "; filename*=UTF-8''" + encodeURIComponent(seguro);
}

function rangoSolicitado(cabecera, tamano) {
  if (!cabecera) return null;
  const coincidencia = /^bytes=(\d*)-(\d*)$/i.exec(String(cabecera).trim());
  if (!coincidencia) return false;
  let inicio = coincidencia[1] === "" ? null : Number(coincidencia[1]);
  let fin = coincidencia[2] === "" ? null : Number(coincidencia[2]);
  if ((inicio !== null && (!Number.isInteger(inicio) || inicio < 0)) ||
      (fin !== null && (!Number.isInteger(fin) || fin < 0))) return false;
  if (inicio === null && fin === null) return false;
  if (inicio === null) {
    const longitud = Math.min(fin, tamano);
    inicio = Math.max(0, tamano - longitud);
    fin = tamano - 1;
  } else {
    if (inicio >= tamano) return false;
    fin = fin === null ? tamano - 1 : Math.min(fin, tamano - 1);
  }
  if (fin < inicio) return false;
  return { inicio, fin };
}

async function responderArchivo(solicitud, respuesta, pelicula, descarga) {
  let estadisticas;
  try {
    estadisticas = await fsPromesas.stat(pelicula.ruta);
  } catch (error) {
    responderJson(respuesta, 404, { error: "El archivo ya no est\u00e1 disponible" });
    return;
  }
  if (!estadisticas.isFile() || estadisticas.size < 1) {
    responderJson(respuesta, 404, { error: "El archivo ya no est\u00e1 disponible" });
    return;
  }

  const rango = rangoSolicitado(solicitud.headers.range, estadisticas.size);
  if (rango === false) {
    respuesta.writeHead(416, {
      "Content-Range": `bytes */${estadisticas.size}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    respuesta.end();
    return;
  }

  const extension = String(pelicula.extension || "").toLowerCase();
  const inicio = rango ? rango.inicio : 0;
  const fin = rango ? rango.fin : estadisticas.size - 1;
  const cabeceras = {
    "Content-Type": TIPOS_VIDEO[extension] || "application/octet-stream",
    "Content-Length": String(fin - inicio + 1),
    "Content-Disposition": cabeceraArchivo(pelicula.nombreArchivo, descarga),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
  if (rango) cabeceras["Content-Range"] = `bytes ${inicio}-${fin}/${estadisticas.size}`;
  respuesta.writeHead(rango ? 206 : 200, cabeceras);

  const lectura = fs.createReadStream(pelicula.ruta, { start: inicio, end: fin });
  lectura.on("error", function () {
    if (!respuesta.headersSent) responderJson(respuesta, 500, { error: "No se pudo leer el archivo" });
    else respuesta.destroy();
  });
  lectura.pipe(respuesta);
}

function crearTickets(configuracion) {
  const tickets = new Map();
  const duracion = Math.max(1, Number(configuracion.duracionEnlaceMinutos) || 10) * 60 * 1000;

  function limpiar() {
    const ahora = Date.now();
    tickets.forEach(function (entrada, token) {
      if (entrada.expiraEn <= ahora) tickets.delete(token);
    });
  }

  function emitir(id, descarga, transcodificado, original) {
    limpiar();
    const token = crypto.randomBytes(32).toString("base64url");
    const expiraEn = Date.now() + duracion;
    tickets.set(token, { id, descarga: Boolean(descarga), transcodificado: Boolean(transcodificado), original: Boolean(original), expiraEn });
    return { token, expiraEn };
  }

  function consumir(token) {
    limpiar();
    const entrada = tickets.get(token);
    return entrada || null;
  }

  return { emitir, consumir };
}

function origenPermitido(origen, configuracion) {
  if (!origen) return true;
  if (configuracion.origenesPermitidos.includes(origen)) return true;
  try {
    const url = new URL(origen);
    return (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      (url.protocol === "http:" || url.protocol === "https:");
  } catch (error) {
    return false;
  }
}

function aplicarCors(solicitud, respuesta, configuracion) {
  const origen = solicitud.headers.origin;
  if (!origen) return true;
  if (!origenPermitido(origen, configuracion)) return false;
  respuesta.setHeader("Access-Control-Allow-Origin", origen);
  respuesta.setHeader("Vary", "Origin");
  respuesta.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  respuesta.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-GMM-Clave");
  respuesta.setHeader("Access-Control-Max-Age", "600");
  if (solicitud.headers["access-control-request-private-network"] === "true") {
    respuesta.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  return true;
}

function esDireccionLocal(direccion) {
  return direccion === "127.0.0.1" || direccion === "::1" || direccion === "::ffff:127.0.0.1";
}

function secretosIguales(recibido, esperado) {
  const a = Buffer.from(String(recibido || ""));
  const b = Buffer.from(String(esperado || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function autorizado(solicitud, configuracion) {
  if (!configuracion.claveAdministracion) return esDireccionLocal(solicitud.socket.remoteAddress);
  const cabecera = String(solicitud.headers.authorization || "");
  const bearer = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
  const clave = bearer || solicitud.headers["x-gmm-clave"];
  return secretosIguales(clave, configuracion.claveAdministracion);
}

function crearServidorApi(configuracion, gestorCatalogo, registro, gestorTranscodificacion, lanzadorVlc) {
  const log = registro || console;
  const tickets = crearTickets(configuracion);
  return http.createServer(async function (solicitud, respuesta) {
    if (!aplicarCors(solicitud, respuesta, configuracion)) {
      responderJson(respuesta, 403, { error: "Origen no permitido" });
      return;
    }
    if (solicitud.method === "OPTIONS") {
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }

    const url = new URL(solicitud.url, "http://gmm-server.local");
    try {
      if (solicitud.method === "GET" && url.pathname === "/") {
        responderJson(respuesta, 200, {
          servicio: "GMM Server",
          version: VERSION_SERVIDOR,
          mensaje: "Servidor multimedia personal de GiveMyMovies"
        });
        return;
      }
      if (solicitud.method === "GET" && url.pathname === "/api/salud") {
        const catalogo = gestorCatalogo.obtenerPublico();
        const salud = {
          estado: "ok",
          servicio: configuracion.nombreServidor,
          version: VERSION_SERVIDOR,
          protegido: Boolean(configuracion.claveAdministracion)
        };
        if (autorizado(solicitud, configuracion)) {
          salud.catalogoActualizadoEn = catalogo.actualizadoEn;
          salud.peliculas = catalogo.resumen.total;
          salud.disponibles = catalogo.resumen.disponibles;
        }
        responderJson(respuesta, 200, salud);
        return;
      }
      if (url.pathname === "/api/catalogo" || url.pathname === "/api/escanear" ||
          url.pathname.startsWith("/api/medios/") || url.pathname.startsWith("/api/vlc/")) {
        if (!autorizado(solicitud, configuracion)) {
          responderJson(respuesta, 401, { error: "Acceso no autorizado" });
          return;
        }
      }
      if (solicitud.method === "GET" && url.pathname === "/api/catalogo") {
        responderJson(respuesta, 200, gestorCatalogo.obtenerPublico());
        return;
      }
      if (solicitud.method === "POST" && url.pathname === "/api/escanear") {
        responderJson(respuesta, 200, await gestorCatalogo.escanearConfirmando());
        return;
      }
      if (solicitud.method === "POST" && url.pathname.startsWith("/api/vlc/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/vlc/".length));
        const pelicula = gestorCatalogo.obtenerArchivo && gestorCatalogo.obtenerArchivo(id);
        if (!pelicula) {
          responderJson(respuesta, 404, { error: "Película no disponible" });
          return;
        }
        if (!lanzadorVlc || !lanzadorVlc.disponible()) {
          responderJson(respuesta, 409, { error: "VLC_NO_INSTALADO" });
          return;
        }
        const ticket = tickets.emitir(id, false, false, true);
        const enlaceLocal = `http://127.0.0.1:${configuracion.puerto}/_gmm/medio/${ticket.token}`;
        lanzadorVlc.abrir(enlaceLocal);
        responderJson(respuesta, 200, { abierto: true });
        return;
      }
      if (solicitud.method === "GET" && url.pathname.startsWith("/api/medios/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/medios/".length));
        const pelicula = gestorCatalogo.obtenerArchivo && gestorCatalogo.obtenerArchivo(id);
        if (!pelicula) {
          responderJson(respuesta, 404, { error: "Pel\u00edcula no disponible" });
          return;
        }
        const descarga = url.searchParams.get("tipo") === "descarga";

        if (pelicula.origen === "jellyfin") {
          const esOriginal = url.searchParams.get("tipo") === "original";
          const ticket = tickets.emitir(id, descarga, false, esOriginal);
          responderJson(respuesta, 200, {
            ruta: `/_gmm/medio/${ticket.token}`,
            expiraEn: new Date(ticket.expiraEn).toISOString(),
            tipo: descarga ? "descarga" : (esOriginal ? "original" : "reproduccion")
          });
          return;
        }

        /* "original": para quien prefiere abrir el archivo tal cual en su propio reproductor
           (VLC, el reproductor del m\u00f3vil, una TV) en vez de esperar la conversi\u00f3n. La mayor\u00eda
           de reproductores de escritorio y m\u00f3vil leen MKV/AC3 sin ayuda; el navegador es el
           \u00fanico exigente. Mismo enlace que la reproducci\u00f3n normal cuando el archivo ya es
           compatible, pero aqu\u00ed se salta la conversi\u00f3n aunque hiciera falta. */
        if (url.searchParams.get("tipo") === "original") {
          const ticket = tickets.emitir(id, false, false);
          responderJson(respuesta, 200, {
            ruta: `/_gmm/medio/${ticket.token}`,
            expiraEn: new Date(ticket.expiraEn).toISOString(),
            tipo: "original"
          });
          return;
        }

        /* La descarga siempre entrega el archivo original: no tiene sentido esperar una
           conversi\u00f3n para algo que no se reproduce en el navegador. Lo mismo si nunca se pudo
           analizar el archivo (sin ffmpeg) o si ya es compatible tal cual: comportamiento
           id\u00e9ntico al de antes de este a\u00f1adido. */
        const necesitaConversion = !descarga && pelicula.compatibilidad &&
          pelicula.compatibilidad !== "compatible";
        if (!necesitaConversion) {
          const ticket = tickets.emitir(id, descarga, false);
          responderJson(respuesta, 200, {
            ruta: `/_gmm/medio/${ticket.token}`,
            expiraEn: new Date(ticket.expiraEn).toISOString(),
            tipo: descarga ? "descarga" : "reproduccion"
          });
          return;
        }

        if (!gestorTranscodificacion) {
          responderJson(respuesta, 409, {
            error: "FFMPEG_NO_CONFIGURADO",
            mensaje: "Este v\u00eddeo necesita conversi\u00f3n y el servidor no tiene FFmpeg configurado. Puedes descargarlo."
          });
          return;
        }
        const listo = await gestorTranscodificacion.archivoListo(pelicula);
        if (listo) {
          const ticket = tickets.emitir(id, false, true);
          responderJson(respuesta, 200, {
            ruta: `/_gmm/medio/${ticket.token}`,
            expiraEn: new Date(ticket.expiraEn).toISOString(),
            tipo: "reproduccion"
          });
          return;
        }
        const trabajo = gestorTranscodificacion.solicitar(pelicula);
        if (trabajo.estado === "error") {
          responderJson(respuesta, 500, { error: "NO_SE_PUDO_CONVERTIR", mensaje: trabajo.error });
          return;
        }
        responderJson(respuesta, 202, { estado: trabajo.estado });
        return;
      }
      if (solicitud.method === "GET" && url.pathname.startsWith("/_gmm/medio/")) {
        const token = url.pathname.slice("/_gmm/medio/".length);
        const ticket = tickets.consumir(token);
        if (!ticket) {
          responderJson(respuesta, 410, { error: "El enlace temporal caduc\u00f3" });
          return;
        }
        const pelicula = gestorCatalogo.obtenerArchivo && gestorCatalogo.obtenerArchivo(ticket.id);
        if (!pelicula) {
          responderJson(respuesta, 404, { error: "Pel\u00edcula no disponible" });
          return;
        }
        if (pelicula.origen === "jellyfin" && gestorCatalogo.responderMedio) {
          await gestorCatalogo.responderMedio(solicitud, respuesta, pelicula, {
            descarga: ticket.descarga,
            original: ticket.original
          });
          return;
        }
        if (!ticket.transcodificado) {
          await responderArchivo(solicitud, respuesta, pelicula, ticket.descarga);
          return;
        }
        const peliculaCacheada = Object.assign({}, pelicula, {
          ruta: rutaCache(configuracion, pelicula),
          extension: ".mp4",
          nombreArchivo: pelicula.nombreArchivo.replace(/\.[^.]+$/, ".mp4")
        });
        await responderArchivo(solicitud, respuesta, peliculaCacheada, ticket.descarga);
        return;
      }
      responderJson(respuesta, 404, { error: "Ruta no encontrada" });
    } catch (error) {
      log.error("Fallo atendiendo una solicitud de GMM Server:", error);
      responderJson(respuesta, 500, { error: "Error interno del servidor" });
    }
  });
}

module.exports = {
  VERSION_SERVIDOR,
  autorizado,
  crearTickets,
  crearServidorApi,
  esDireccionLocal,
  origenPermitido,
  rangoSolicitado,
  secretosIguales
};

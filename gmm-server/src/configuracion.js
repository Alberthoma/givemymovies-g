"use strict";

const fs = require("node:fs");
const path = require("node:path");

const EXTENSIONES_PREDETERMINADAS = [
  ".mp4", ".mkv", ".avi", ".mov", ".m4v", ".webm", ".ts", ".mpeg", ".mpg"
];

const CARPETAS_IGNORADAS_PREDETERMINADAS = [
  "$RECYCLE.BIN", "System Volume Information", ".git", "node_modules"
];

function enteroEnRango(valor, minimo, maximo, nombre) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new Error(`${nombre} debe ser un número entero entre ${minimo} y ${maximo}.`);
  }
  return numero;
}

function textoNoVacio(valor, nombre) {
  const texto = String(valor || "").trim();
  if (!texto) throw new Error(`${nombre} no puede estar vacío.`);
  return texto;
}

function normalizarCarpetas(carpetas) {
  if (!Array.isArray(carpetas)) throw new Error("carpetas debe ser una lista.");
  const nombres = new Set();
  const rutas = new Set();

  return carpetas.map(function (entrada, indice) {
    const objeto = typeof entrada === "string" ? { ruta: entrada } : entrada;
    if (!objeto || typeof objeto !== "object") {
      throw new Error(`La carpeta ${indice + 1} no tiene un formato válido.`);
    }

    const ruta = path.resolve(textoNoVacio(objeto.ruta, `carpetas[${indice}].ruta`));
    const nombre = textoNoVacio(objeto.nombre || path.basename(ruta), `carpetas[${indice}].nombre`);
    const claveNombre = nombre.toLocaleLowerCase("es");
    const claveRuta = ruta.toLocaleLowerCase("es");

    if (nombres.has(claveNombre)) throw new Error(`El nombre de carpeta "${nombre}" está repetido.`);
    if (rutas.has(claveRuta)) throw new Error(`La ruta "${ruta}" está repetida.`);
    nombres.add(claveNombre);
    rutas.add(claveRuta);
    return { nombre, ruta };
  });
}

function normalizarListaTextos(valor, nombre, reserva) {
  const lista = valor === undefined ? reserva : valor;
  if (!Array.isArray(lista)) throw new Error(`${nombre} debe ser una lista.`);
  return Array.from(new Set(lista.map(function (item) {
    return textoNoVacio(item, nombre);
  })));
}

function normalizarExtensiones(valor) {
  return normalizarListaTextos(valor, "extensiones", EXTENSIONES_PREDETERMINADAS)
    .map(function (extension) {
      const limpia = extension.toLocaleLowerCase("es");
      return limpia.startsWith(".") ? limpia : `.${limpia}`;
    });
}

function cargarConfiguracion(rutaSolicitada) {
  const ruta = path.resolve(rutaSolicitada || process.env.GMM_SERVER_CONFIG ||
    path.join(__dirname, "..", "PRIVADO", "configuracion.json"));
  let crudo;

  try {
    crudo = fs.readFileSync(ruta, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`No existe la configuración privada. Ejecuta "npm.cmd run configurar". Ruta esperada: ${ruta}`);
    }
    throw error;
  }

  let datos;
  try {
    datos = JSON.parse(crudo);
  } catch (error) {
    throw new Error(`La configuración no contiene JSON válido: ${error.message}`);
  }

  const host = textoNoVacio(datos.host || "127.0.0.1", "host");
  const claveAdministracion = String(datos.claveAdministracion || "").trim();
  if (claveAdministracion === "SE_GENERA_AL_PREPARAR") {
    throw new Error("La clave de administración de la plantilla no es válida. Ejecuta el preparador.");
  }
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && claveAdministracion.length < 32) {
    throw new Error("Para escuchar fuera de este PC se exige una clave de administración de al menos 32 caracteres.");
  }

  const basePrivada = path.dirname(ruta);
  const rutaCatalogoConfigurada = textoNoVacio(datos.rutaCatalogo || "catalogo.json", "rutaCatalogo");
  const rutaCatalogo = path.isAbsolute(rutaCatalogoConfigurada)
    ? rutaCatalogoConfigurada
    : path.resolve(basePrivada, rutaCatalogoConfigurada);
  const rutaCacheConfigurada = textoNoVacio(
    datos.rutaCacheTranscodificacion || "transcodificado",
    "rutaCacheTranscodificacion"
  );
  const rutaCacheTranscodificacion = path.isAbsolute(rutaCacheConfigurada)
    ? rutaCacheConfigurada
    : path.resolve(basePrivada, rutaCacheConfigurada);
  const jellyfinUrl = String(datos.jellyfinUrl || "").trim().replace(/\/+$/, "");
  const jellyfinClaveApi = String(datos.jellyfinClaveApi || "").trim();
  if ((jellyfinUrl && !jellyfinClaveApi) || (!jellyfinUrl && jellyfinClaveApi)) {
    throw new Error("jellyfinUrl y jellyfinClaveApi deben configurarse juntos.");
  }
  if (jellyfinUrl && !/^https?:\/\//i.test(jellyfinUrl)) {
    throw new Error("jellyfinUrl debe empezar por http:// o https://.");
  }

  return {
    rutaConfiguracion: ruta,
    nombreServidor: textoNoVacio(datos.nombreServidor || "GMM Server", "nombreServidor"),
    host,
    puerto: enteroEnRango(datos.puerto === undefined ? 7399 : datos.puerto, 1, 65535, "puerto"),
    claveAdministracion,
    carpetas: normalizarCarpetas(datos.carpetas || []),
    origenesPermitidos: normalizarListaTextos(datos.origenesPermitidos, "origenesPermitidos", []),
    extensiones: normalizarExtensiones(datos.extensiones),
    carpetasIgnoradas: normalizarListaTextos(
      datos.carpetasIgnoradas,
      "carpetasIgnoradas",
      CARPETAS_IGNORADAS_PREDETERMINADAS
    ),
    escanearAlIniciar: datos.escanearAlIniciar !== false,
    intervaloEscaneoMinutos: enteroEnRango(
      datos.intervaloEscaneoMinutos === undefined ? 0 : datos.intervaloEscaneoMinutos,
      0,
      10080,
      "intervaloEscaneoMinutos"
    ),
    duracionEnlaceMinutos: enteroEnRango(
      datos.duracionEnlaceMinutos === undefined ? 10 : datos.duracionEnlaceMinutos,
      1,
      60,
      "duracionEnlaceMinutos"
    ),
    rutaCatalogo,
    /* Sin instalar, ffmpeg/ffprobe simplemente no se encuentran en el PATH: el sondeo y la
       transcodificación fallan en silencio (ver compatibilidad.js y transcodificar.js) y la
       app sigue funcionando exactamente igual que antes de este añadido. */
    rutaFFmpeg: textoNoVacio(datos.rutaFFmpeg || "ffmpeg", "rutaFFmpeg"),
    rutaFFprobe: textoNoVacio(datos.rutaFFprobe || "ffprobe", "rutaFFprobe"),
    rutaCacheTranscodificacion,
    jellyfin: {
      activo: Boolean(jellyfinUrl && jellyfinClaveApi),
      url: jellyfinUrl,
      claveApi: jellyfinClaveApi
    }
  };
}

module.exports = {
  CARPETAS_IGNORADAS_PREDETERMINADAS,
  EXTENSIONES_PREDETERMINADAS,
  cargarConfiguracion,
  normalizarCarpetas,
  normalizarExtensiones
};

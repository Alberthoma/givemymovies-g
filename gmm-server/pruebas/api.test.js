"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { crearServidorApi, rangoSolicitado } = require("../src/api");

function catalogoDePrueba() {
  return {
    version: 1,
    actualizadoEn: "2026-08-05T00:00:00.000Z",
    resumen: { total: 1, disponibles: 1, copiandose: 0, carpetas: 1 },
    carpetas: [{ nombre: "Prueba", disponible: true, peliculas: 1 }],
    peliculas: [{ id: "abc", tituloDetectado: "Prueba", disponible: true }]
  };
}

async function levantar(t) {
  const gestor = {
    obtenerPublico: catalogoDePrueba,
    escanearConfirmando: async function () { return catalogoDePrueba(); },
    obtenerArchivo: function () { return null; }
  };
  const configuracion = {
    nombreServidor: "GMM de prueba",
    claveAdministracion: "secreto-de-prueba-12345678901234567890",
    origenesPermitidos: ["https://alberthoma.github.io"]
  };
  const registro = { error: function () {} };
  const servidor = crearServidorApi(configuracion, gestor, registro);
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(function () { servidor.close(); });
  return `http://127.0.0.1:${servidor.address().port}`;
}

test("publica salud sin revelar datos del catálogo a quien no se autentica", async function (t) {
  const base = await levantar(t);
  const respuesta = await fetch(`${base}/api/salud`);
  const datos = await respuesta.json();
  assert.equal(respuesta.status, 200);
  assert.equal(datos.estado, "ok");
  assert.equal(Object.hasOwn(datos, "peliculas"), false);
  assert.equal(Object.hasOwn(datos, "carpetas"), false);

  const autenticada = await fetch(`${base}/api/salud`, {
    headers: { Authorization: "Bearer secreto-de-prueba-12345678901234567890" }
  });
  assert.equal((await autenticada.json()).peliculas, 1);
});

test("protege catálogo y escaneo con la clave", async function (t) {
  const base = await levantar(t);
  const denegada = await fetch(`${base}/api/catalogo`);
  assert.equal(denegada.status, 401);

  const permitida = await fetch(`${base}/api/catalogo`, {
    headers: { Authorization: "Bearer secreto-de-prueba-12345678901234567890" }
  });
  assert.equal(permitida.status, 200);
  assert.equal((await permitida.json()).resumen.total, 1);

  const escaneo = await fetch(`${base}/api/escanear`, {
    method: "POST",
    headers: { "X-GMM-Clave": "secreto-de-prueba-12345678901234567890" }
  });
  assert.equal(escaneo.status, 200);
});

test("abre una película en el VLC del equipo que ejecuta GMM Server", async function (t) {
  let enlaceAbierto = null;
  const gestor = {
    obtenerPublico: catalogoDePrueba,
    escanearConfirmando: async function () { return catalogoDePrueba(); },
    obtenerArchivo: function (id) { return id === "abc" ? { id: "abc", disponible: true } : null; }
  };
  const configuracion = {
    puerto: 7399,
    nombreServidor: "GMM de prueba",
    claveAdministracion: "secreto-de-prueba-12345678901234567890",
    origenesPermitidos: ["https://alberthoma.github.io"],
    duracionEnlaceMinutos: 10
  };
  const lanzador = {
    disponible: function () { return true; },
    abrir: function (url) { enlaceAbierto = url; }
  };
  const servidor = crearServidorApi(configuracion, gestor, { error: function () {} }, null, lanzador);
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(function () { servidor.close(); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const respuesta = await fetch(`${base}/api/vlc/abc`, {
    method: "POST",
    headers: { Authorization: "Bearer secreto-de-prueba-12345678901234567890" }
  });
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).abierto, true);
  assert.match(enlaceAbierto, /^http:\/\/127\.0\.0\.1:7399\/_gmm\/medio\//);
});

test("acepta el origen de GMM y rechaza otros", async function (t) {
  const base = await levantar(t);
  const permitida = await fetch(`${base}/api/salud`, {
    headers: { Origin: "https://alberthoma.github.io" }
  });
  assert.equal(permitida.status, 200);
  assert.equal(permitida.headers.get("access-control-allow-origin"), "https://alberthoma.github.io");

  const denegada = await fetch(`${base}/api/salud`, {
    headers: { Origin: "https://ejemplo-malicioso.invalid" }
  });
  assert.equal(denegada.status, 403);
});

test("interpreta rangos simples de v\u00eddeo", function () {
  assert.deepEqual(rangoSolicitado("bytes=2-4", 10), { inicio: 2, fin: 4 });
  assert.deepEqual(rangoSolicitado("bytes=7-", 10), { inicio: 7, fin: 9 });
  assert.deepEqual(rangoSolicitado("bytes=-3", 10), { inicio: 7, fin: 9 });
  assert.equal(rangoSolicitado("bytes=20-21", 10), false);
  assert.equal(rangoSolicitado("bytes=1-2,4-5", 10), false);
});

test("emite un enlace temporal y sirve reproducci\u00f3n o descarga sin revelar la ruta", async function (t) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "gmm-media-"));
  const archivo = path.join(carpeta, "Prueba (2024).mp4");
  fs.writeFileSync(archivo, "abcdef");
  t.after(function () { fs.rmSync(carpeta, { recursive: true, force: true }); });

  const gestor = {
    obtenerPublico: catalogoDePrueba,
    escanearConfirmando: async function () { return catalogoDePrueba(); },
    obtenerArchivo: function (id) {
      if (id !== "abc") return null;
      return { id: "abc", ruta: archivo, nombreArchivo: "Prueba (2024).mp4", extension: ".mp4", disponible: true };
    }
  };
  const configuracion = {
    nombreServidor: "GMM de prueba",
    claveAdministracion: "secreto-de-prueba-12345678901234567890",
    origenesPermitidos: ["https://alberthoma.github.io"],
    duracionEnlaceMinutos: 10
  };
  const servidor = crearServidorApi(configuracion, gestor, { error: function () {} });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(function () { servidor.close(); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const clave = { Authorization: "Bearer secreto-de-prueba-12345678901234567890" };

  const denegada = await fetch(`${base}/api/medios/abc`);
  assert.equal(denegada.status, 401);

  const creada = await fetch(`${base}/api/medios/abc`, { headers: clave });
  const datos = await creada.json();
  assert.equal(creada.status, 200);
  assert.match(datos.ruta, /^\/_gmm\/medio\/[A-Za-z0-9_-]{30,}$/);
  assert.equal(JSON.stringify(datos).includes(archivo), false);

  const parcial = await fetch(base + datos.ruta, { headers: { Range: "bytes=1-3" } });
  assert.equal(parcial.status, 206);
  assert.equal(parcial.headers.get("content-range"), "bytes 1-3/6");
  assert.equal(await parcial.text(), "bcd");
  assert.match(parcial.headers.get("content-type"), /^video\/mp4/);

  const descarga = await fetch(`${base}/api/medios/abc?tipo=descarga`, { headers: clave });
  const enlaceDescarga = await descarga.json();
  const archivoDescarga = await fetch(base + enlaceDescarga.ruta);
  assert.equal(archivoDescarga.status, 200);
  assert.match(archivoDescarga.headers.get("content-disposition"), /^attachment/);
  assert.equal(await archivoDescarga.text(), "abcdef");
});

test("tipo=original entrega el archivo tal cual, sin pasar por conversión, para abrirlo en otro reproductor", async function (t) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "gmm-media-"));
  const archivo = path.join(carpeta, "Prueba (2024).mkv");
  fs.writeFileSync(archivo, "abcdef");
  t.after(function () { fs.rmSync(carpeta, { recursive: true, force: true }); });

  let seSolicitoConversion = false;
  const gestor = {
    obtenerPublico: catalogoDePrueba,
    escanearConfirmando: async function () { return catalogoDePrueba(); },
    obtenerArchivo: function (id) {
      if (id !== "abc") return null;
      return {
        id: "abc", ruta: archivo, nombreArchivo: "Prueba (2024).mkv", extension: ".mkv",
        disponible: true, compatibilidad: "transcodificar"
      };
    }
  };
  const configuracion = {
    nombreServidor: "GMM de prueba",
    claveAdministracion: "secreto-de-prueba-12345678901234567890",
    origenesPermitidos: ["https://alberthoma.github.io"],
    duracionEnlaceMinutos: 10
  };
  const gestorTranscodificacion = {
    archivoListo: async function () { return false; },
    solicitar: function () { seSolicitoConversion = true; return { estado: "en_cola" }; }
  };
  const servidor = crearServidorApi(configuracion, gestor, { error: function () {} }, gestorTranscodificacion);
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(function () { servidor.close(); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const clave = { Authorization: "Bearer secreto-de-prueba-12345678901234567890" };

  const creada = await fetch(`${base}/api/medios/abc?tipo=original`, { headers: clave });
  const datos = await creada.json();
  assert.equal(creada.status, 200);
  assert.match(datos.ruta, /^\/_gmm\/medio\/[A-Za-z0-9_-]{30,}$/);
  assert.equal(seSolicitoConversion, false);

  const archivoOriginal = await fetch(base + datos.ruta);
  assert.equal(archivoOriginal.status, 200);
  assert.match(archivoOriginal.headers.get("content-disposition"), /^inline/);
  assert.equal(await archivoOriginal.text(), "abcdef");
});

test("sin GestorTranscodificacion, reproducir un vídeo incompatible pide FFmpeg pero la descarga funciona igual", async function (t) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "gmm-media-"));
  const archivo = path.join(carpeta, "Prueba (2024).mkv");
  fs.writeFileSync(archivo, "abcdef");
  t.after(function () { fs.rmSync(carpeta, { recursive: true, force: true }); });

  const gestor = {
    obtenerPublico: catalogoDePrueba,
    escanearConfirmando: async function () { return catalogoDePrueba(); },
    obtenerArchivo: function (id) {
      if (id !== "abc") return null;
      return {
        id: "abc", ruta: archivo, nombreArchivo: "Prueba (2024).mkv", extension: ".mkv",
        disponible: true, compatibilidad: "remux"
      };
    }
  };
  const configuracion = {
    nombreServidor: "GMM de prueba",
    claveAdministracion: "secreto-de-prueba-12345678901234567890",
    origenesPermitidos: ["https://alberthoma.github.io"],
    duracionEnlaceMinutos: 10
  };
  const servidor = crearServidorApi(configuracion, gestor, { error: function () {} });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(function () { servidor.close(); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const clave = { Authorization: "Bearer secreto-de-prueba-12345678901234567890" };

  const reproduccion = await fetch(`${base}/api/medios/abc`, { headers: clave });
  assert.equal(reproduccion.status, 409);
  assert.equal((await reproduccion.json()).error, "FFMPEG_NO_CONFIGURADO");

  const descarga = await fetch(`${base}/api/medios/abc?tipo=descarga`, { headers: clave });
  assert.equal(descarga.status, 200);
});

test("con GestorTranscodificacion, pide la conversión mientras no está lista y luego sirve el archivo cacheado", async function (t) {
  const carpetaOriginal = fs.mkdtempSync(path.join(os.tmpdir(), "gmm-original-"));
  const archivoOriginal = path.join(carpetaOriginal, "Prueba (2024).mkv");
  fs.writeFileSync(archivoOriginal, "original-mkv");
  const carpetaCache = fs.mkdtempSync(path.join(os.tmpdir(), "gmm-cache-"));
  t.after(function () {
    fs.rmSync(carpetaOriginal, { recursive: true, force: true });
    fs.rmSync(carpetaCache, { recursive: true, force: true });
  });

  const pelicula = {
    id: "abc", ruta: archivoOriginal, nombreArchivo: "Prueba (2024).mkv", extension: ".mkv",
    disponible: true, compatibilidad: "remux"
  };
  const gestor = {
    obtenerPublico: catalogoDePrueba,
    escanearConfirmando: async function () { return catalogoDePrueba(); },
    obtenerArchivo: function (id) { return id === "abc" ? pelicula : null; }
  };
  const configuracion = {
    nombreServidor: "GMM de prueba",
    claveAdministracion: "secreto-de-prueba-12345678901234567890",
    origenesPermitidos: ["https://alberthoma.github.io"],
    duracionEnlaceMinutos: 10,
    rutaCacheTranscodificacion: carpetaCache
  };

  let listo = false;
  const transcodificador = {
    archivoListo: async function () { return listo; },
    solicitar: function () {
      listo = true;
      fs.writeFileSync(path.join(carpetaCache, "abc.mp4"), "video-cacheado");
      return { estado: "preparando" };
    }
  };

  const servidor = crearServidorApi(configuracion, gestor, { error: function () {} }, transcodificador);
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(function () { servidor.close(); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const clave = { Authorization: "Bearer secreto-de-prueba-12345678901234567890" };

  const primera = await fetch(`${base}/api/medios/abc`, { headers: clave });
  assert.equal(primera.status, 202);
  assert.equal((await primera.json()).estado, "preparando");

  const segunda = await fetch(`${base}/api/medios/abc`, { headers: clave });
  assert.equal(segunda.status, 200);
  const datos = await segunda.json();

  const contenido = await fetch(base + datos.ruta);
  assert.equal(await contenido.text(), "video-cacheado");
  assert.match(contenido.headers.get("content-type"), /^video\/mp4/);
});

test("con GestorTranscodificacion, un trabajo en error se reporta como fallo de conversión", async function (t) {
  const gestor = {
    obtenerPublico: catalogoDePrueba,
    escanearConfirmando: async function () { return catalogoDePrueba(); },
    obtenerArchivo: function (id) {
      if (id !== "abc") return null;
      return { id: "abc", ruta: "/no-importa.mkv", nombreArchivo: "Prueba.mkv", extension: ".mkv", disponible: true, compatibilidad: "transcodificar" };
    }
  };
  const configuracion = {
    nombreServidor: "GMM de prueba",
    claveAdministracion: "secreto-de-prueba-12345678901234567890",
    origenesPermitidos: ["https://alberthoma.github.io"],
    duracionEnlaceMinutos: 10,
    rutaCacheTranscodificacion: "/no-importa"
  };
  const transcodificador = {
    archivoListo: async function () { return false; },
    solicitar: function () { return { estado: "error", error: "códec no soportado" }; }
  };
  const servidor = crearServidorApi(configuracion, gestor, { error: function () {} }, transcodificador);
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(function () { servidor.close(); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const clave = { Authorization: "Bearer secreto-de-prueba-12345678901234567890" };

  const respuesta = await fetch(`${base}/api/medios/abc`, { headers: clave });
  assert.equal(respuesta.status, 500);
  assert.equal((await respuesta.json()).error, "NO_SE_PUDO_CONVERTIR");
});

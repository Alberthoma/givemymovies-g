"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { GestorJellyfin, extensionDeFuente, limpiarBase } = require("../src/jellyfin");

test("normaliza la dirección y extensión de Jellyfin", function () {
  assert.equal(limpiarBase("http://127.0.0.1:8096///"), "http://127.0.0.1:8096");
  assert.equal(extensionDeFuente({ Container: "mkv,webm", Path: "C:\\Peli.mkv" }), ".mkv");
});

test("convierte el catálogo de Jellyfin al formato de GMM sin exponer ids internos", async function () {
  let cabecera = null;
  const falsoFetch = async function (url, opciones) {
    cabecera = opciones.headers["X-Emby-Token"];
    assert.match(url, /\/Items\?/);
    return new Response(JSON.stringify({
      TotalRecordCount: 1,
      Items: [{
        Id: "jf-1", Name: "Una película", ProductionYear: 2024,
        ProviderIds: { Tmdb: "123" },
        MediaSources: [{ Id: "ms-1", Container: "mkv", Path: "C:\\Peliculas\\Una película.mkv", Size: 99 }]
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const gestor = new GestorJellyfin({ jellyfin: {
    url: "http://127.0.0.1:8096", claveApi: "secreto"
  } }, { fetch: falsoFetch });
  const catalogo = await gestor.iniciar();
  assert.equal(cabecera, "secreto");
  assert.equal(catalogo.resumen.total, 1);
  assert.equal(catalogo.peliculas[0].id, "jellyfin:jf-1");
  assert.deepEqual(catalogo.peliculas[0].tmdb, { id: 123 });
  assert.equal(Object.hasOwn(catalogo.peliculas[0], "jellyfinId"), false);
  assert.equal(gestor.obtenerArchivo("jellyfin:jf-1").jellyfinId, "jf-1");
});

test("el proxy pide a Jellyfin MP4 H.264/AAC para el navegador", async function () {
  let urlPedida = null;
  const falsoFetch = async function (url) {
    urlPedida = url;
    return new Response("video", { status: 200, headers: { "Content-Type": "video/mp4" } });
  };
  const gestor = new GestorJellyfin({ jellyfin: {
    url: "http://127.0.0.1:8096", claveApi: "secreto"
  } }, { fetch: falsoFetch });
  const pelicula = { jellyfinId: "jf-1", mediaSourceId: "ms-1", extension: ".mkv", nombreArchivo: "Peli.mkv" };
  const cabeceras = {};
  let cuerpo = "";
  const respuesta = {
    writeHead: function (estado, headers) { this.estado = estado; Object.assign(cabeceras, headers); },
    end: function (trozo) { cuerpo += trozo || ""; },
    on: function () { return this; },
    once: function () { return this; },
    emit: function () { return true; },
    write: function (trozo) { cuerpo += trozo.toString(); return true; },
    destroy: function () {}
  };
  await gestor.responderMedio({ headers: {} }, respuesta, pelicula, {});
  await new Promise(function (resolver) { setTimeout(resolver, 20); });
  assert.match(urlPedida, /\/Videos\/jf-1\/stream\.mp4\?/);
  assert.match(urlPedida, /videoCodec=h264/);
  assert.match(urlPedida, /audioCodec=aac/);
  assert.equal(cabeceras["content-type"], "video/mp4");
});

test("Actualizar ordena a Jellyfin escanear y espera antes de leer el catálogo", async function () {
  const peticiones = [];
  let consultasTarea = 0;
  const falsoFetch = async function (url, opciones) {
    peticiones.push({ url, metodo: opciones && opciones.method || "GET" });
    if (url.endsWith("/Library/Refresh")) return new Response(null, { status: 204 });
    if (url.endsWith("/ScheduledTasks")) {
      consultasTarea += 1;
      return new Response(JSON.stringify([{ Key: "RefreshLibrary", State: consultasTarea === 1 ? "Running" : "Idle" }]), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }
    if (url.includes("/Items?")) {
      return new Response(JSON.stringify({ TotalRecordCount: 0, Items: [] }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(null, { status: 404 });
  };
  const gestor = new GestorJellyfin({ jellyfin: {
    url: "http://127.0.0.1:8096", claveApi: "secreto"
  } }, { fetch: falsoFetch, esperar: async function () {} });

  const catalogo = await gestor.escanearConfirmando();
  assert.equal(catalogo.resumen.total, 0);
  assert.deepEqual(peticiones.map(function (p) { return p.metodo + " " + new URL(p.url).pathname; }), [
    "POST /Library/Refresh", "GET /ScheduledTasks", "GET /ScheduledTasks", "GET /Items"
  ]);
});

/* ══════════════════════════════════════════════════════════════════════
   sw.js — service worker de givemymovies

   Hace la app instalable en el móvil y la mantiene utilizable sin
   conexión, pero SIN mentir: los datos de disponibilidad no se guardan
   nunca. Una película que ayer estaba en Netflix hoy puede no estarlo, y
   toda la app se sostiene sobre decir la verdad de dónde verla.

   ┌─────────────────────────┬───────────────────────────────────────────┐
   │ api.themoviedb.org      │ SOLO RED. Nunca se cachea.                │
   │ www.omdbapi.com         │ SOLO RED: las notas cambian con el tiempo.│
   │ *.googleapis.com, Drive │ SOLO RED (otro origen): API de Drive N.2. │
   │ *.gstatic.com, Firebase │ SOLO RED (otro origen): SDK de cuenta,    │
   │                         │ V GMM 0029 — nunca servir un SDK rancio.  │
   │ image.tmdb.org          │ Caché primero: una carátula no cambia.    │
   │ Navegación (index.html) │ Red primero, caché si no hay conexión.    │
   │ Resto del propio sitio  │ Caché primero: iconos, manifiesto.        │
   └─────────────────────────┴───────────────────────────────────────────┘

   Nota: *.googleapis.com y *.gstatic.com no necesitan una línea propia en
   el manejador de "fetch" de abajo — son otro origen y el código ya
   devuelve sin llamar a respondWith() para cualquier origen externo que no
   esté explícitamente cacheado (image.tmdb.org), así que el navegador hace
   la petición normal a la red. Aparecen en esta tabla solo para que quede
   dicho, no porque falte código.

   AL PUBLICAR UNA VERSIÓN NUEVA hay que subir VERSION. Si no, los
   navegadores que ya cachearon la app seguirán sirviendo la vieja.
   ══════════════════════════════════════════════════════════════════════ */

"use strict";

var VERSION   = 46;
var CACHE_APP = "gmm-app-v" + VERSION;
var CACHE_IMG = "gmm-img-v" + VERSION;

var MAX_IMAGENES = 300;   // carátulas y logos guardados como mucho

var ESENCIALES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./iconos/icono-192.png",
  "./iconos/icono-512.png",
  "./iconos/icono-maskable-512.png"
];

/* ---------------------------------------------------------------- */
/* Instalación                                                      */
/* ---------------------------------------------------------------- */

self.addEventListener("install", function (evento) {
  evento.waitUntil(
    caches.open(CACHE_APP).then(function (cache) {
      /* addAll falla entero si un solo recurso falla. Los pedimos uno a
         uno para que un icono ausente no impida instalar la app. */
      return Promise.all(ESENCIALES.map(function (ruta) {
        return cache.add(ruta).catch(function () { /* recurso opcional */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* ---------------------------------------------------------------- */
/* Activación: fuera las cachés de versiones anteriores             */
/* ---------------------------------------------------------------- */

self.addEventListener("activate", function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(nombres.map(function (n) {
        if (n !== CACHE_APP && n !== CACHE_IMG && n.indexOf("gmm-") === 0) {
          return caches.delete(n);
        }
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* ---------------------------------------------------------------- */
/* Estrategias                                                      */
/* ---------------------------------------------------------------- */

/* Evita que la caché de imágenes crezca sin fin. */
function podar(nombreCache, maximo) {
  return caches.open(nombreCache).then(function (cache) {
    return cache.keys().then(function (claves) {
      if (claves.length <= maximo) return;
      return Promise.all(claves.slice(0, claves.length - maximo).map(function (c) {
        return cache.delete(c);
      }));
    });
  });
}

function cachePrimero(peticion, nombreCache, podarA) {
  return caches.match(peticion).then(function (guardada) {
    if (guardada) return guardada;
    return fetch(peticion).then(function (respuesta) {
      if (respuesta && respuesta.status === 200) {
        var copia = respuesta.clone();
        caches.open(nombreCache).then(function (cache) {
          cache.put(peticion, copia);
          if (podarA) podar(nombreCache, podarA);
        });
      }
      return respuesta;
    });
  });
}

function redPrimero(peticion) {
  return fetch(peticion).then(function (respuesta) {
    if (respuesta && respuesta.status === 200) {
      var copia = respuesta.clone();
      caches.open(CACHE_APP).then(function (cache) { cache.put(peticion, copia); });
    }
    return respuesta;
  }).catch(function () {
    return caches.match(peticion).then(function (guardada) {
      return guardada || caches.match("./index.html");
    });
  });
}

self.addEventListener("fetch", function (evento) {
  var peticion = evento.request;

  if (peticion.method !== "GET") return;

  var url;
  try { url = new URL(peticion.url); } catch (e) { return; }

  /* 1 · Disponibilidad y fichas: SIEMPRE de la red, nunca de la caché.
         Servir esto rancio convertiría la app en un engaño. Las notas de
         OMDb (IMDb/RT/Metacritic) cambian con el tiempo: mismo criterio. */
  if (url.hostname === "api.themoviedb.org") return;
  if (url.hostname === "www.omdbapi.com" || url.hostname === "omdbapi.com") return;

  /* 2 · Carátulas y logos: la ruta identifica la imagen y no cambia. */
  if (url.hostname === "image.tmdb.org") {
    evento.respondWith(cachePrimero(peticion, CACHE_IMG, MAX_IMAGENES));
    return;
  }

  /* A partir de aquí, solo lo que sirve nuestro propio dominio. */
  if (url.origin !== self.location.origin) return;

  /* 3 · La clave local no existe cuando la app está publicada. Que su
         404 no se guarde ni ensucie nada. */
  if (url.pathname.indexOf("/PRIVADO/") !== -1) return;

  /* 4 · Abrir la app: red primero, para que las versiones nuevas lleguen
         solas; la caché queda como red de seguridad sin conexión. */
  if (peticion.mode === "navigate") {
    evento.respondWith(redPrimero(peticion));
    return;
  }

  /* 5 · Iconos, manifiesto y demás: caché primero. */
  evento.respondWith(
    cachePrimero(peticion, CACHE_APP).catch(function () {
      return caches.match("./index.html");
    })
  );
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { LanzadorVlc, rutasVlc } = require("../src/vlc");

test("encuentra VLC y abre una URL web como argumento, sin usar un shell", function () {
  const llamadas = [];
  const entorno = { ProgramFiles: "C:\\Program Files" };
  const esperada = "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe";
  const lanzador = new LanzadorVlc({
    entorno,
    existe: function (ruta) { return ruta === esperada; },
    ejecutar: function (archivo, argumentos, opciones) {
      llamadas.push({ archivo, argumentos, opciones });
      return { unref: function () {} };
    }
  });
  assert.deepEqual(rutasVlc(entorno), [esperada]);
  assert.equal(lanzador.disponible(), true);
  lanzador.abrir("http://127.0.0.1:7399/video");
  assert.equal(llamadas[0].archivo, esperada);
  assert.deepEqual(llamadas[0].argumentos, ["http://127.0.0.1:7399/video"]);
  assert.equal(llamadas[0].opciones.detached, true);
});

test("rechaza direcciones que no sean http o https", function () {
  const lanzador = new LanzadorVlc({ existe: function () { return true; } });
  assert.throws(function () { lanzador.abrir("file:///privado.mkv"); }, /no es válida/);
});

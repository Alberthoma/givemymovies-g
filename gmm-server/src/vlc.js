"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function rutasVlc(entorno) {
  const env = entorno || process.env;
  return [env.ProgramFiles, env["ProgramFiles(x86)"]].filter(Boolean).map(function (base) {
    return path.join(base, "VideoLAN", "VLC", "vlc.exe");
  });
}

class LanzadorVlc {
  constructor(opciones) {
    this.existe = opciones && opciones.existe || fs.existsSync;
    this.ejecutar = opciones && opciones.ejecutar || spawn;
    this.entorno = opciones && opciones.entorno || process.env;
  }

  encontrar() {
    return rutasVlc(this.entorno).find(this.existe) || null;
  }

  disponible() {
    return Boolean(this.encontrar());
  }

  abrir(url) {
    const destino = new URL(url);
    if (destino.protocol !== "http:" && destino.protocol !== "https:") {
      throw new Error("La dirección para VLC no es válida.");
    }
    const ejecutable = this.encontrar();
    if (!ejecutable) throw new Error("VLC no está instalado en el equipo de GMM Server.");
    const proceso = this.ejecutar(ejecutable, [destino.href], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    if (proceso && proceso.unref) proceso.unref();
  }
}

module.exports = { LanzadorVlc, rutasVlc };

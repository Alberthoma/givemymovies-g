"use strict";

const os = require("node:os");

const { cargarConfiguracion } = require("./src/configuracion");
const { GestorCatalogo } = require("./src/catalogo");
const { crearServidorApi, VERSION_SERVIDOR } = require("./src/api");
const { GestorTranscodificacion } = require("./src/transcodificar");
const { GestorJellyfin } = require("./src/jellyfin");
const { LanzadorVlc } = require("./src/vlc");

function direccionesAlcanzables(host, puerto) {
  if (host !== "0.0.0.0") return [`http://${host}:${puerto}`];
  const direcciones = [`http://127.0.0.1:${puerto}`];
  const interfaces = os.networkInterfaces();
  Object.values(interfaces).forEach(function (lista) {
    (lista || []).forEach(function (info) {
      if (info.family === "IPv4" && !info.internal) {
        direcciones.push(`http://${info.address}:${puerto}`);
      }
    });
  });
  return direcciones;
}

async function iniciar() {
  const configuracion = cargarConfiguracion(process.argv[2]);
  const gestor = configuracion.jellyfin.activo
    ? new GestorJellyfin(configuracion)
    : new GestorCatalogo(configuracion);
  await gestor.iniciar();

  if (!configuracion.jellyfin.activo && configuracion.escanearAlIniciar) {
    const catalogo = await gestor.escanearConfirmando();
    console.log(`Catálogo revisado: ${catalogo.resumen.total} película(s).`);
  }

  const transcodificador = configuracion.jellyfin.activo
    ? null
    : new GestorTranscodificacion(configuracion, { registro: console });
  const servidor = crearServidorApi(configuracion, gestor, console, transcodificador, new LanzadorVlc());
  servidor.listen(configuracion.puerto, configuracion.host, function () {
    console.log(`GMM Server ${VERSION_SERVIDOR} está funcionando.`);
    direccionesAlcanzables(configuracion.host, configuracion.puerto).forEach(function (direccion) {
      console.log(`Dirección: ${direccion}`);
    });
    console.log(configuracion.jellyfin.activo
      ? `Motor multimedia: Jellyfin (${configuracion.jellyfin.url})`
      : `Carpetas configuradas: ${configuracion.carpetas.length}`);
    console.log("Pulsa Ctrl+C para detenerlo.");
  });

  let temporizador = null;
  if (!configuracion.jellyfin.activo && configuracion.intervaloEscaneoMinutos > 0) {
    temporizador = setInterval(function () {
      gestor.escanear().catch(function (error) {
        console.error("No se pudo actualizar el catálogo:", error.message);
      });
    }, configuracion.intervaloEscaneoMinutos * 60 * 1000);
    temporizador.unref();
  }

  function cerrar(senal) {
    console.log(`\n${senal}: deteniendo GMM Server…`);
    if (temporizador) clearInterval(temporizador);
    servidor.close(function () { process.exit(0); });
    setTimeout(function () { process.exit(1); }, 5000).unref();
  }
  process.once("SIGINT", function () { cerrar("SIGINT"); });
  process.once("SIGTERM", function () { cerrar("SIGTERM"); });
}

iniciar().catch(function (error) {
  console.error("GMM Server no pudo iniciar:");
  console.error(error.message);
  process.exitCode = 1;
});

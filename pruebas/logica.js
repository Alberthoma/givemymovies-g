/* ══════════════════════════════════════════════════════════════════════
   logica.js — pruebas de la lógica de givemymovies, sin navegador

   Ejecutar:  node pruebas/logica.js
   Sin dependencias: solo Node.
   ══════════════════════════════════════════════════════════════════════ */

const { cargarGmm, crearMarcador } = require("./cargar");
const GMM = cargarGmm();
const m = crearMarcador();

const inter = GMM.demo.porId(157336);
const provInter = GMM.demo.proveedoresComoTmdb(inter);

/* ---------------------------------------------------------------- */
m.titulo("Interestelar, idioma español, sin más filtros");

let r = GMM.idioma.filtrar(provInter,
  { plataforma: "", pais: "", idioma: "es", mostrarTodos: false }, inter.original_language);
let codigos = r.paises.map((p) => p.codigo).sort();
m.nota("países mostrados: " + codigos.join(", "));
m.nota("ocultos por idioma: " + r.ocultosPorIdioma + " | total con oferta: " + r.totalPaises);

m.afirmar("incluye Argentina", codigos.includes("AR"));
m.afirmar("incluye México", codigos.includes("MX"));
m.afirmar("incluye España", codigos.includes("ES"));
m.afirmar("incluye Estados Unidos (español como 2º idioma)", codigos.includes("US"));
m.afirmar("excluye Japón", !codigos.includes("JP"));
m.afirmar("excluye Alemania", !codigos.includes("DE"));
m.afirmar("excluye Brasil", !codigos.includes("BR"));
m.afirmar("cuenta 4 países ocultos (BR, FR, DE, JP)", r.ocultosPorIdioma === 4, "fueron " + r.ocultosPorIdioma);
m.afirmar("nombre de país en español", r.paises.some((p) => p.nombre === "Argentina"));
m.afirmar("AR marcado como confianza alta",
  r.paises.find((p) => p.codigo === "AR").confianza.nivel === "alto");
m.afirmar("US marcado como confianza media (español cooficial)",
  r.paises.find((p) => p.codigo === "US").confianza.nivel === "medio");

/* ---------------------------------------------------------------- */
m.titulo("La frase resumen");

let frase = GMM.idioma.frase(inter.title, r, { idioma: "es" });
m.nota(frase.html.replace(/<[^>]+>/g, ""));
m.afirmar("la frase no está vacía", !frase.vacia);
m.afirmar("menciona el idioma", frase.html.includes("en español"));
m.afirmar("menciona Netflix", frase.html.includes("Netflix"));

/* ---------------------------------------------------------------- */
m.titulo("Mismo caso, filtrando por Netflix");

r = GMM.idioma.filtrar(provInter,
  { plataforma: "Netflix", pais: "", idioma: "es", mostrarTodos: false }, "en");
codigos = r.paises.map((p) => p.codigo).sort();
m.nota("países: " + codigos.join(", "));
m.afirmar("solo los países con Netflix: AR, CL, MX", codigos.join(",") === "AR,CL,MX", codigos.join(","));
m.afirmar("Max desaparece al filtrar por Netflix",
  !r.paises.some((p) => p.grupos.some((g) => g.plataformas.some((x) => x.provider_name === "Max"))));

/* ---------------------------------------------------------------- */
m.titulo("Disponible, pero no en esa plataforma");

/* El caso real que motivó esta distinción: 'Siempre el mismo día' está
   en 14 países hispanohablantes pero en ninguno la tiene Netflix.
   Decir "sin resultados" sería técnicamente cierto e inútil. */
const coco = GMM.demo.porId(354912);            // solo está en Disney Plus
r = GMM.idioma.filtrar(GMM.demo.proveedoresComoTmdb(coco),
  { plataforma: "Netflix", pais: "", idioma: "es", mostrarTodos: false }, coco.original_language);
m.afirmar("ningún país con Netflix", r.paises.length === 0);
m.afirmar("pero cuenta los que sí tienen oferta", r.descartadosPorPlataforma > 0,
  "fueron " + r.descartadosPorPlataforma);

frase = GMM.idioma.frase(coco.title, r, { plataforma: "Netflix", idioma: "es" });
m.nota(frase.html.replace(/<[^>]+>/g, ""));
m.afirmar("la frase nombra la plataforma que falla", frase.html.includes("no en Netflix"));
m.afirmar("y aclara que sí está disponible", frase.html.includes("sí está disponible"));

r = GMM.idioma.filtrar(GMM.demo.proveedoresComoTmdb(coco),
  { plataforma: "Disney Plus", pais: "", idioma: "es", mostrarTodos: false }, coco.original_language);
m.afirmar("con la plataforma correcta sí hay países", r.paises.length > 0);
m.afirmar("y no descarta ninguno", r.descartadosPorPlataforma === 0);

r = GMM.idioma.filtrar(provInter,
  { plataforma: "", pais: "", idioma: "es", mostrarTodos: false }, "en");
m.afirmar("sin filtro de plataforma, no se descarta nada", r.descartadosPorPlataforma === 0);

/* ---------------------------------------------------------------- */
m.titulo("Alias de plataforma: 'Max' debe capturar 'HBO Max'");

m.afirmar("Max coincide con HBO Max", GMM.idioma.coincidePlataforma("HBO Max", "Max"));
m.afirmar("Max coincide con Max", GMM.idioma.coincidePlataforma("Max", "Max"));
m.afirmar("Netflix no coincide con Max", !GMM.idioma.coincidePlataforma("Netflix", "Max"));
m.afirmar("sin filtro, todo coincide", GMM.idioma.coincidePlataforma("Lo que sea", ""));

/* ---------------------------------------------------------------- */
m.titulo("Idioma sin ninguna coincidencia (Interestelar en árabe)");

r = GMM.idioma.filtrar(provInter, { plataforma: "", pais: "", idioma: "ar", mostrarTodos: false }, "en");
frase = GMM.idioma.frase(inter.title, r, { idioma: "ar" });
m.nota(frase.html.replace(/<[^>]+>/g, ""));
m.afirmar("no devuelve países", r.paises.length === 0);
m.afirmar("la frase avisa de que sí está en otros países",
  frase.vacia && frase.html.includes("10"));

/* ---------------------------------------------------------------- */
m.titulo("Japón SÍ debe salir cuando se busca en japonés");

r = GMM.idioma.filtrar(provInter, { plataforma: "", pais: "", idioma: "ja", mostrarTodos: false }, "en");
m.afirmar("solo Japón", r.paises.length === 1 && r.paises[0].codigo === "JP",
  r.paises.map((p) => p.codigo).join(","));

/* ---------------------------------------------------------------- */
m.titulo("'Ver todos los países igualmente'");

r = GMM.idioma.filtrar(provInter, { plataforma: "", pais: "", idioma: "ar", mostrarTodos: true }, "en");
m.afirmar("con mostrarTodos aparecen los 10 países", r.paises.length === 10, "fueron " + r.paises.length);

/* ---------------------------------------------------------------- */
m.titulo("Filtro por país concreto");

r = GMM.idioma.filtrar(provInter, { plataforma: "", pais: "ES", idioma: "es", mostrarTodos: false }, "en");
m.afirmar("solo España", r.paises.length === 1 && r.paises[0].codigo === "ES");
m.afirmar("España trae Movistar y SkyShowtime",
  r.paises[0].grupos[0].plataformas.map((p) => p.provider_name).join(",") === "Movistar Plus+,SkyShowtime");

/* ---------------------------------------------------------------- */
m.titulo("Audio original: Parásitos en coreano");

const parasitos = GMM.demo.porId(496243);
r = GMM.idioma.filtrar(GMM.demo.proveedoresComoTmdb(parasitos),
  { plataforma: "", pais: "", idioma: "ko", mostrarTodos: false }, parasitos.original_language);
m.nota("países: " + r.paises.map((p) => p.codigo).join(", "));
m.afirmar("Corea aparece con confianza alta",
  r.paises.find((p) => p.codigo === "KR") && r.paises.find((p) => p.codigo === "KR").confianza.nivel === "alto");
m.afirmar("el resto aparece como audio original",
  r.paises.filter((p) => p.codigo !== "KR").every((p) => p.confianza.nivel === "medio"));

/* ---------------------------------------------------------------- */
m.titulo("Orden: la mayor confianza va primero");

r = GMM.idioma.filtrar(provInter, { plataforma: "", pais: "", idioma: "es", mostrarTodos: true }, "en");
const niveles = r.paises.map((p) => p.confianza.nivel);
const rango = { alto: 0, medio: 1, neutro: 2, bajo: 3 };
m.afirmar("los niveles van de mejor a peor",
  niveles.every((n, i) => i === 0 || rango[niveles[i - 1]] <= rango[n]), niveles.join(","));

/* ---------------------------------------------------------------- */
m.titulo("Mis listas");

m.afirmar("empieza vacía", GMM.listas.total() === 0);
m.afirmar("añadir devuelve true", GMM.listas.alternar("favoritas", inter) === true);
m.afirmar("ahora la tiene", GMM.listas.tiene("favoritas", 157336));
m.afirmar("no está en pendientes", !GMM.listas.tiene("pendientes", 157336));
GMM.listas.alternar("pendientes", parasitos);
m.afirmar("total = 2", GMM.listas.total() === 2);
m.afirmar("quitar devuelve false", GMM.listas.alternar("favoritas", inter) === false);
m.afirmar("total = 1", GMM.listas.total() === 1);
m.afirmar("persiste en localStorage", global.__almacen["gmm_listas"].includes("496243"));

const copia = GMM.listas.exportar();
GMM.listas.vaciar("pendientes");
m.afirmar("vaciada", GMM.listas.total() === 0);
GMM.listas.importar(copia);
m.afirmar("importar restaura", GMM.listas.total() === 1);
let rechazado = false;
try { GMM.listas.importar('{"cosa":1}'); } catch (e) { rechazado = true; }
m.afirmar("rechaza un JSON con formato ajeno", rechazado);

/* ---------------------------------------------------------------- */
m.titulo("Mi biblioteca: enlaces a mis copias (V GMM 0026, Nivel 1)");

const peliCopia = { id: 157336, tipo: "movie", title: "Interestelar", poster_path: "/p.jpg" };
const serieCopia = { id: 157336, tipo: "tv", name: "Otra con el mismo id" };
m.afirmar("empieza vacía", GMM.biblioteca.total() === 0);
m.afirmar("guardar exige un enlace no vacío", GMM.biblioteca.guardar(peliCopia, "   ") === false);
m.afirmar("guarda el enlace de una peli", GMM.biblioteca.guardar(peliCopia, "https://drive.google.com/file/d/AAA/view") === true);
m.afirmar("la recupera con su enlace", GMM.biblioteca.entrada(157336, "movie").enlace.indexOf("AAA") !== -1);
m.afirmar("indexa por tipo:id (peli y serie con el mismo id no se pisan)",
  !GMM.biblioteca.tiene(157336, "tv") &&
  GMM.biblioteca.guardar(serieCopia, "https://mega.nz/xyz") === true &&
  GMM.biblioteca.total() === 2);
m.afirmar("actualizar reemplaza el enlace, no duplica",
  GMM.biblioteca.guardar(peliCopia, "https://mega.nz/nueva") === true &&
  GMM.biblioteca.total() === 2 &&
  GMM.biblioteca.entrada(157336, "movie").enlace === "https://mega.nz/nueva");
m.afirmar("persiste en localStorage", (global.__almacen["gmm_biblioteca"] || "").includes("mega.nz/nueva"));
GMM.biblioteca.quitar(157336, "movie");
m.afirmar("quitar la elimina", !GMM.biblioteca.tiene(157336, "movie") && GMM.biblioteca.total() === 1);
m.afirmar("todas() devuelve las entradas guardadas", GMM.biblioteca.todas().length === 1);

/* ---------------------------------------------------------------- */
m.titulo("GMM Server: conexión privada en este navegador (V GMM 0033)");

m.afirmar("normaliza la dirección y retira la barra final",
  GMM.servidor.normalizarUrl("http://127.0.0.1:7399/") === "http://127.0.0.1:7399");
m.afirmar("rechaza una dirección que no sea HTTP(S)", GMM.servidor.normalizarUrl("ftp://ejemplo") === "");
m.afirmar("guarda la dirección y la clave fuera del HTML", GMM.servidor.guardar("https://gmm.tailnet.ts.net/", "clave-prueba"));
let conexionServidor = GMM.servidor.configuracion();
m.afirmar("conserva una URL HTTPS normalizada", conexionServidor.url === "https://gmm.tailnet.ts.net");
m.afirmar("conserva la clave solo en el almacenamiento del dispositivo", conexionServidor.clave === "clave-prueba" &&
  global.__almacen[GMM.config.CLAVE_SERVIDOR].includes("clave-prueba"));
m.afirmar("rechaza guardar una dirección inválida", !GMM.servidor.guardar("no es una url", "clave"));
m.afirmar("permite borrar la conexión", GMM.servidor.guardar("", "") && !GMM.servidor.conectado());

/* ---------------------------------------------------------------- */
m.titulo("GMM Server: estados de /api/medios al pedir un vídeo (V GMM 0038)");

const fetchOriginalServidor = global.fetch;
GMM.servidor.guardar("http://127.0.0.1:7399", "clave-prueba-medios");
function respuestaFalsaServidor(estadoHttp, cuerpo) {
  return Promise.resolve({ status: estadoHttp, json: () => Promise.resolve(cuerpo) });
}
const pEnlaceServidor = (async function () {
  global.fetch = () => respuestaFalsaServidor(202, { estado: "preparando" });
  const preparando = await GMM.servidor.enlace("id1", false);
  m.afirmar("202 se interpreta como 'todavía preparando', no como error",
    preparando.preparando === true && preparando.estadoConversion === "preparando");

  global.fetch = () => respuestaFalsaServidor(200,
    { ruta: "/_gmm/medio/token123", expiraEn: "2026-01-01T00:00:00.000Z", tipo: "reproduccion" });
  const listo = await GMM.servidor.enlace("id1", false);
  m.afirmar("200 con ticket arma la URL completa a partir de la dirección guardada",
    listo.preparando === false && listo.url === "http://127.0.0.1:7399/_gmm/medio/token123");

  global.fetch = () => respuestaFalsaServidor(409, { error: "FFMPEG_NO_CONFIGURADO" });
  let errorFFmpeg = null;
  try { await GMM.servidor.enlace("id1", false); } catch (error) { errorFFmpeg = error.message; }
  m.afirmar("409 (sin ffmpeg configurado) se traduce a FFMPEG_NO_CONFIGURADO", errorFFmpeg === "FFMPEG_NO_CONFIGURADO");

  global.fetch = () => respuestaFalsaServidor(500, { error: "NO_SE_PUDO_CONVERTIR", mensaje: "códec no soportado" });
  let errorConversion = null;
  try { await GMM.servidor.enlace("id1", false); } catch (error) { errorConversion = error.message; }
  m.afirmar("500 con error NO_SE_PUDO_CONVERTIR se propaga tal cual", errorConversion === "NO_SE_PUDO_CONVERTIR");

  global.fetch = fetchOriginalServidor;
  GMM.servidor.guardar("", "");
})();

/* ---------------------------------------------------------------- */
m.titulo("GMM Server: abrir el original en otro reproductor (V GMM 0039)");

/* Encadenada DESPUÉS de pEnlaceServidor a propósito, nunca en paralelo con Promise.all: las
   dos comparten estado global mutable (global.fetch, la configuración de GMM.servidor), y
   correr a la vez las mezcla —cada await cede el control y deja que la otra pise el
   fetch/config a medio usar. */
async function pruebaEnlaceOriginalServidor() {
  GMM.servidor.guardar("http://127.0.0.1:7399", "clave-prueba-original");

  global.fetch = () => respuestaFalsaServidor(200,
    { ruta: "/_gmm/medio/tokenOriginal", expiraEn: "2026-01-01T00:00:00.000Z", tipo: "original" });
  const url = await GMM.servidor.enlaceOriginal("id1");
  m.afirmar("arma la URL completa a partir de la dirección guardada, sin pasar por 'preparando'",
    url === "http://127.0.0.1:7399/_gmm/medio/tokenOriginal");

  global.fetch = () => respuestaFalsaServidor(404, { error: "Película no disponible" });
  let errorNoEncontrado = null;
  try { await GMM.servidor.enlaceOriginal("id1"); } catch (error) { errorNoEncontrado = error.message; }
  m.afirmar("404 se traduce a NO_ENCONTRADO", errorNoEncontrado === "NO_ENCONTRADO");

  global.fetch = fetchOriginalServidor;
  GMM.servidor.guardar("", "");
}

m.titulo("Interpretación del enlace de la copia (GMM.util.enlaceCopia)");
const eDrive = GMM.util.enlaceCopia("https://drive.google.com/file/d/1AbC-dEfGhIJ/view?usp=sharing");
m.afirmar("un enlace de Drive saca el id y arma ver + descargar directa",
  eDrive.tipo === "drive" &&
  eDrive.reproducir === "https://drive.google.com/file/d/1AbC-dEfGhIJ/view" &&
  eDrive.descargar === "https://drive.google.com/uc?export=download&id=1AbC-dEfGhIJ");
m.afirmar("Drive con open?id también se reconoce",
  GMM.util.enlaceCopia("https://drive.google.com/open?id=ZZZ-1234567").tipo === "drive");
const eOtro = GMM.util.enlaceCopia("https://mega.nz/file/abc#clave");
m.afirmar("cualquier otro enlace se usa tal cual para ver y descargar",
  eOtro.tipo === "otro" && eOtro.reproducir === "https://mega.nz/file/abc#clave" && eOtro.descargar === eOtro.reproducir);
m.afirmar("enlace vacío devuelve null", GMM.util.enlaceCopia("  ") === null);

m.titulo("Google Drive: helpers puros del Nivel 2 (V GMM 0027)");
const tok = GMM.util.leerTokenHash("#access_token=ABC123&expires_in=3600&token_type=Bearer");
m.afirmar("lee el token del hash y calcula su caducidad futura",
  tok.token === "ABC123" && tok.expira > Date.now() && tok.expira <= Date.now() + 3600 * 1000);
m.afirmar("sin access_token devuelve null",
  GMM.util.leerTokenHash("#state=x&error=denied") === null && GMM.util.leerTokenHash("") === null);
m.afirmar("expires_in ausente cae a 1 hora",
  Math.abs(GMM.util.leerTokenHash("#access_token=Z").expira - (Date.now() + 3600 * 1000)) < 2000);
m.afirmar("la consulta de Drive pide vídeos por nombre y escapa las comillas",
  GMM.util.consultaDrive("O'Brien") === "name contains 'O\\'Brien' and mimeType contains 'video/' and trashed = false");
const authUrl = GMM.util.urlAuthDrive("CID.apps", "https://alberthoma.github.io/givemymovies-g/");
m.afirmar("la URL de OAuth usa flujo implícito, scope de solo lectura y el client id",
  authUrl.indexOf("accounts.google.com/o/oauth2/v2/auth") !== -1 &&
  authUrl.indexOf("response_type=token") !== -1 &&
  authUrl.indexOf(encodeURIComponent("https://www.googleapis.com/auth/drive.readonly")) !== -1 &&
  authUrl.indexOf("client_id=CID.apps") !== -1);
m.afirmar("el visor, la descarga directa y el enlace de ficha de Drive",
  GMM.drive.urlPreview("XYZ") === "https://drive.google.com/file/d/XYZ/preview" &&
  GMM.drive.urlDescarga("XYZ") === "https://drive.google.com/uc?export=download&id=XYZ" &&
  GMM.drive.enlaceVer("XYZ") === "https://drive.google.com/file/d/XYZ/view");

/* ---------------------------------------------------------------- */
m.titulo("Utilidades");

m.afirmar("enumerar 3 elementos", GMM.util.enumerar(["A", "B", "C"]) === "A, B y C");
m.afirmar("enumerar 1 elemento", GMM.util.enumerar(["A"]) === "A");
m.afirmar("enumerar vacío", GMM.util.enumerar([]) === "");
m.afirmar("normalizar quita acentos", GMM.util.normalizar("Parásitos") === "parasitos");
m.afirmar("duración", GMM.util.duracion(169) === "2 h 49 min");
m.afirmar("duración exacta", GMM.util.duracion(120) === "2 h");
m.afirmar("escapar comillas", GMM.util.esc('<b>"x"</b>') === "&lt;b&gt;&quot;x&quot;&lt;/b&gt;");

/* ---------------------------------------------------------------- */
m.titulo("Búsqueda en el catálogo demo");

m.afirmar("busca sin acentos", GMM.demo.buscarPelicula("parasitos").length === 1);
m.afirmar("busca por título original", GMM.demo.buscarPelicula("Inception").length === 1);
m.afirmar("busca persona", GMM.demo.buscarPersona("penelope").length === 1);
m.afirmar("busca trama (películas)", GMM.demo.buscarTrama("viajes en el tiempo", "movie").length === 2);
m.afirmar("busca serie por título", GMM.demo.buscarSerie("casa").some((s) => s.id === 71446));
m.afirmar("busca serie por nombre original", GMM.demo.buscarSerie("오징어").length === 1);
m.afirmar("busca trama en series", GMM.demo.buscarTrama("atraco", "tv").some((s) => s.id === 71446));
m.afirmar("trama de película no arrastra series", GMM.demo.buscarTrama("atraco", "movie").every((p) => p.tipo === "movie"));

/* ---------------------------------------------------------------- */
m.titulo("Coherencia del catálogo demo");

const idsPeliculas = GMM.demo.PELICULAS.map((p) => p.id);
m.afirmar("no hay ids repetidos", new Set(idsPeliculas).size === idsPeliculas.length);
m.afirmar("toda película tiene carátula", GMM.demo.PELICULAS.every((p) => p.poster_path));
m.afirmar("toda persona apunta a películas existentes",
  GMM.demo.PERSONAS.every((per) => per.creditos.every((id) => GMM.demo.porId(id))));
m.afirmar("toda trama apunta a películas existentes",
  Object.values(GMM.demo.TRAMAS).every((ids) => ids.every((id) => GMM.demo.porId(id))));

/* ---------------------------------------------------------------- */
m.titulo("Normalización de series");

const serieCruda = { id: 1, name: "X", original_name: "X", first_air_date: "2020-03-01", episode_run_time: [48] };
const norm = GMM.util.normalizarMedia(serieCruda, "tv");
m.afirmar("marca el tipo tv", norm.tipo === "tv");
m.afirmar("name pasa a title", norm.title === "X");
m.afirmar("first_air_date pasa a release_date", norm.release_date === "2020-03-01");
m.afirmar("episode_run_time pasa a runtime", norm.runtime === 48);
m.afirmar("no muta el objeto original", serieCruda.tipo === undefined);
const normPeli = GMM.util.normalizarMedia({ id: 2, title: "P" }, "movie");
m.afirmar("una película conserva su title", normPeli.title === "P" && normPeli.tipo === "movie");

/* ---------------------------------------------------------------- */
m.titulo("Sección Descubrir sobre el catálogo demo");

m.afirmar("series de drama incluyen Breaking Bad",
  GMM.demo.descubrir("tv", { genero: 18 }).some((s) => s.id === 1396));
m.afirmar("series de drama con nota >= 8 dejan fuera El juego del calamar",
  !GMM.demo.descubrir("tv", { genero: 18, notaMin: 8 }).some((s) => s.id === 93405));
m.afirmar("pelis de ciencia ficción incluyen Interestelar y Matrix", (() => {
  const r = GMM.demo.descubrir("movie", { genero: 878 }).map((p) => p.id);
  return r.includes(157336) && r.includes(603);
})());
m.afirmar("filtrar por año exacto",
  GMM.demo.descubrir("movie", { ano: "1999" }).every((p) => GMM.util.ano(p.release_date) === "1999"));
m.afirmar("ordena por nota descendente", (() => {
  const r = GMM.demo.descubrir("tv", {});
  for (let i = 1; i < r.length; i++) if (r[i - 1].vote_average < r[i].vote_average) return false;
  return true;
})());
m.afirmar("los géneros de serie difieren de los de película",
  GMM.datos.generos("tv") !== GMM.datos.generos("movie") &&
  GMM.datos.generos("tv").some((g) => g.id === 10765));

/* ---------------------------------------------------------------- */
m.titulo("Descubrir: intervalo de años");

const anosDe = (r) => r.map((p) => Number(GMM.util.ano(p.release_date || p.first_air_date)));

m.afirmar("el intervalo deja fuera lo anterior y lo posterior", (() => {
  const a = anosDe(GMM.demo.descubrir("movie", { anoDesde: "2010", anoHasta: "2019" }));
  return a.length > 1 && a.every((n) => n >= 2010 && n <= 2019);
})());
m.afirmar("solo 'desde' no pone techo",
  anosDe(GMM.demo.descubrir("movie", { anoDesde: "2010" })).every((n) => n >= 2010));
m.afirmar("solo 'hasta' no pone suelo",
  anosDe(GMM.demo.descubrir("movie", { anoHasta: "2001" })).every((n) => n <= 2001));
m.afirmar("un intervalo de un solo año equivale al año exacto", (() => {
  const uno = GMM.demo.descubrir("movie", { anoDesde: "1999", anoHasta: "1999" }).map((p) => p.id);
  const exacto = GMM.demo.descubrir("movie", { ano: "1999" }).map((p) => p.id);
  return uno.length === 1 && uno.join() === exacto.join();
})());
m.afirmar("el año exacto manda sobre el intervalo, como en el recorrido año a año",
  GMM.demo.descubrir("movie", { ano: "1999", anoDesde: "2010", anoHasta: "2019" }).length === 0);

/* ---------------------------------------------------------------- */
m.titulo("Descubrir: orden");

m.afirmar("hay una clave de TMDB para cada orden, en cine y en series",
  ["popular", "reciente", "antigua", "nota"].every((k) =>
    GMM.config.ORDENES[k] && GMM.config.ORDENES[k].movie && GMM.config.ORDENES[k].tv));
m.afirmar("cine y series nombran distinto el orden por fecha",
  GMM.config.ORDENES.reciente.movie === "primary_release_date.desc" &&
  GMM.config.ORDENES.reciente.tv === "first_air_date.desc");
m.afirmar("ordenar por nota exige más votos que el resto",
  GMM.config.VOTOS_MIN_NOTA > GMM.config.VOTOS_MIN);

const ordenado = (a, sentido) => {
  for (let i = 1; i < a.length; i++) {
    if (sentido === "desc" ? a[i - 1] < a[i] : a[i - 1] > a[i]) return false;
  }
  return true;
};

m.afirmar("'más recientes' ordena de año mayor a menor",
  ordenado(anosDe(GMM.demo.descubrir("movie", { orden: "reciente" })), "desc"));
m.afirmar("'más antiguas' ordena de año menor a mayor",
  ordenado(anosDe(GMM.demo.descubrir("movie", { orden: "antigua" })), "asc"));
m.afirmar("'mayor puntuación' sola ordena por nota, no por año",
  ordenado(GMM.demo.descubrir("movie", { porNota: true }).map((p) => p.vote_average), "desc"));
m.afirmar("sin orden pedido no se altera el comportamiento de siempre",
  GMM.demo.descubrir("tv", {}).map((s) => s.id).join() ===
  GMM.demo.descubrir("tv", { orden: "popular" }).map((s) => s.id).join());
m.afirmar("año y nota a la vez: el año sigue mandando", (() => {
  const a = anosDe(GMM.demo.descubrir("movie", { orden: "reciente", porNota: true }));
  return a.length > 1 && ordenado(a, "desc");
})());
m.afirmar("año y nota a la vez, hacia atrás: el año sigue mandando", (() => {
  const a = anosDe(GMM.demo.descubrir("movie", { orden: "antigua", porNota: true }));
  return a.length > 1 && ordenado(a, "asc");
})());

/* ---------------------------------------------------------------- */
m.titulo("Coherencia de las series demo");

m.afirmar("toda serie tiene al menos un género", GMM.demo.SERIES.every((s) => (s.genre_ids || []).length));
m.afirmar("toda serie declara idioma original", GMM.demo.SERIES.every((s) => s.original_language));
m.afirmar("toda serie tiene carátula", GMM.demo.SERIES.every((s) => s.poster_path));
m.afirmar("no hay ids de serie repetidos",
  new Set(GMM.demo.SERIES.map((s) => s.id)).size === GMM.demo.SERIES.length);

/* ---------------------------------------------------------------- */
m.titulo("Listas conscientes del tipo (peli y serie con el mismo id)");

GMM.listas.alternar("favoritas", { id: 500, tipo: "movie", title: "Peli" });
GMM.listas.alternar("favoritas", { id: 500, tipo: "tv", title: "Serie" });
m.afirmar("guarda peli y serie del mismo id sin pisarse",
  GMM.listas.tiene("favoritas", 500, "movie") && GMM.listas.tiene("favoritas", 500, "tv"));
GMM.listas.quitar("favoritas", 500, "movie");
m.afirmar("quitar la peli no toca la serie",
  !GMM.listas.tiene("favoritas", 500, "movie") && GMM.listas.tiene("favoritas", 500, "tv"));
GMM.listas.quitar("favoritas", 500, "tv");

/* ---------------------------------------------------------------- */
m.titulo("Títulos alternativos por país");

const altPeli = {
  title: "Duro de matar", original_title: "Die Hard", original_language: "en",
  alternative_titles: { titles: [
    { iso_3166_1: "ES", title: "La jungla de cristal" },
    { iso_3166_1: "AR", title: "Duro de matar" },   // igual al principal → fuera
    { iso_3166_1: "US", title: "Die Hard" },         // igual al original → fuera
    { iso_3166_1: "FR", title: "Piège de cristal" }  // FR no es mercado es/en → fuera
  ] }
};
let alt = GMM.util.titulosAlternativos(altPeli);
m.afirmar("agrupa un único título alternativo relevante", alt.length === 1, "fueron " + alt.length);
m.afirmar("es «La jungla de cristal» (España)",
  alt.length === 1 && alt[0].titulo === "La jungla de cristal" && alt[0].paises.indexOf("ES") !== -1);
m.afirmar("descarta el principal y el original",
  !alt.some((a) => /Duro de matar|Die Hard/.test(a.titulo)));
m.afirmar("descarta países fuera de mercados español/inglés",
  !alt.some((a) => a.titulo === "Piège de cristal"));
m.afirmar("funciona con series (clave results)",
  GMM.util.titulosAlternativos({ name: "X", original_name: "X",
    alternative_titles: { results: [{ iso_3166_1: "ES", title: "Equis" }] } }).length === 1);
m.afirmar("sin alternative_titles devuelve vacío",
  GMM.util.titulosAlternativos({ title: "Y" }).length === 0);

/* ---------------------------------------------------------------- */
m.titulo("OMDb: parseo de notas (IMDb / Rotten Tomatoes / Metacritic)");

const omdbCompleto = {
  Response: "True",
  imdbRating: "8.7",
  Metascore: "74",
  Ratings: [
    { Source: "Internet Movie Database", Value: "8.7/10" },
    { Source: "Rotten Tomatoes", Value: "73%" },
    { Source: "Metacritic", Value: "74/100" }
  ]
};
let notas = GMM.omdb.parsear(omdbCompleto);
m.afirmar("extrae la nota de IMDb", notas && notas.imdb === "8.7");
m.afirmar("extrae Rotten Tomatoes tal cual (porcentaje)", notas && notas.rt === "73%");
m.afirmar("Metacritic sin el '/100'", notas && notas.meta === "74");

m.afirmar("Response:'False' devuelve null", GMM.omdb.parsear({ Response: "False", Error: "Movie not found!" }) === null);
m.afirmar("respuesta nula devuelve null", GMM.omdb.parsear(null) === null);
m.afirmar("sin ninguna nota aprovechable devuelve null",
  GMM.omdb.parsear({ Response: "True", imdbRating: "N/A", Ratings: [] }) === null);

let soloImdb = GMM.omdb.parsear({ Response: "True", imdbRating: "6.1", Ratings: [] });
m.afirmar("con solo IMDb, rt y meta quedan indefinidos",
  soloImdb && soloImdb.imdb === "6.1" && !soloImdb.rt && !soloImdb.meta);

m.afirmar("ignora valores 'N/A' dentro de Ratings",
  (() => {
    const n = GMM.omdb.parsear({ Response: "True", Ratings: [{ Source: "Rotten Tomatoes", Value: "N/A" }], imdbRating: "5.0" });
    return n && n.imdb === "5.0" && !n.rt;
  })());
m.afirmar("Metascore de reserva cuando no viene en Ratings",
  (() => {
    const n = GMM.omdb.parsear({ Response: "True", imdbRating: "7.0", Metascore: "61", Ratings: [] });
    return n && n.meta === "61";
  })());

/* ---------------------------------------------------------------- */
/* Desde V GMM 0023 los carruseles se ordenan por la nota de TMDB, no por la de
   IMDb: con cinco carruseles de veinte cargando a la vez, el rodeo por OMDb
   costaba ~120 consultas por visita sobre un tope de 1.000 al día. La nota que
   ordena la lista es además la que luce cada tarjeta. */
m.titulo("Carruseles: top por nota de TMDB (GMM.util.mejoresPorNota)");

const cand = [
  { id: 1, title: "A", vote_average: 8.7 },
  { id: 2, title: "B", vote_average: 5.9 },   // < 6: fuera
  { id: 3, title: "C", vote_average: 7.4 },
  { id: 4, title: "D", vote_average: null },  // sin nota: fuera
  { id: 5, title: "E", vote_average: 6.0 },   // exactamente 6: dentro (umbral >=)
  { id: 6, title: "F", vote_average: 9.1 }
];
let mejores = GMM.util.mejoresPorNota(cand, 20);
m.afirmar("descarta nota < 6 y los que no tienen nota", mejores.length === 4, "fueron " + mejores.length);
m.afirmar("ordena de mayor a menor nota",
  mejores.map((x) => x.id).join(",") === "6,1,3,5", mejores.map((x) => x.id).join(","));
m.afirmar("corta al tope pedido",
  GMM.util.mejoresPorNota(cand, 2).map((x) => x.id).join(",") === "6,1");
m.afirmar("6 exacto sí pasa el umbral (>=, es el mismo que pide /discover)",
  GMM.util.mejoresPorNota(cand, 20).some((x) => x.id === 5));
m.afirmar("admite un umbral distinto del de config",
  GMM.util.mejoresPorNota(cand, 20, 8).map((x) => x.id).join(",") === "6,1");
m.afirmar("lista vacía o sin notas devuelve vacío",
  GMM.util.mejoresPorNota([], 20).length === 0 &&
  GMM.util.mejoresPorNota([{ id: 9, vote_average: null }], 20).length === 0);

/* ---------------------------------------------------------------- */
m.titulo("Carruseles: uno por categoría (V GMM 0023)");

m.afirmar("Tendencia es el único carrusel fijo",
  GMM.config.CATEGORIAS_SUGERENCIA.length === 1 && GMM.config.CATEGORIAS_SUGERENCIA[0].clave === "tendencia");
m.afirmar("veinte títulos por carrusel", GMM.config.TOP_CATEGORIA === 20);
m.afirmar("los demás carruseles se crean con filtros y no están fijados en config",
  GMM.config.CATEGORIAS_SUGERENCIA.filter((c) => c.anoDesde).length === 0);
m.afirmar("el umbral de nota de las categorías es 6",
  GMM.config.NOTA_MIN_CATEGORIA === 6);

/* ---------------------------------------------------------------- */
m.titulo("Filmografía con facetas: intérprete y dirección (V GMM 0024)");

const creditos = {
  cast: [
    { id: 10, title: "Peli A", popularity: 5 },
    { id: 11, title: "Peli B", popularity: 9 },
    { id: 10, title: "Peli A (otro papel)", popularity: 3 }  // id repetido: una sola vez
  ],
  crew: [
    { id: 11, title: "Peli B", popularity: 9, job: "Director" }, // dirige Y actúa → cuenta como dirección
    { id: 20, title: "Peli C", popularity: 7, job: "Director" },
    { id: 21, title: "Peli D", popularity: 1, job: "Producer" }  // no dirige: se ignora
  ]
};
const fac = GMM.util.filmografiaConFacetas(creditos, "movie");
m.afirmar("dirige = crew con job Director, ordenado por popularidad",
  fac.dirige.map((x) => x.id).join(",") === "11,20", fac.dirige.map((x) => x.id).join(","));
m.afirmar("interpreta deduplica por id y excluye lo que ya dirige",
  fac.interpreta.map((x) => x.id).join(",") === "10", fac.interpreta.map((x) => x.id).join(","));
m.afirmar("cada ítem lleva su faceta marcada",
  fac.dirige.every((x) => x.faceta === "dirige") && fac.interpreta.every((x) => x.faceta === "interpreta"));
m.afirmar("normaliza el tipo en los ítems", fac.dirige[0].tipo === "movie");
m.afirmar("créditos vacíos devuelven dos listas vacías",
  (() => { const f = GMM.util.filmografiaConFacetas({}, "movie"); return f.interpreta.length === 0 && f.dirige.length === 0; })());

/* ---------------------------------------------------------------- */
m.titulo("Ficha técnica del título (V GMM 0024)");

const peliFT = {
  tipo: "movie",
  production_countries: [{ iso_3166_1: "US", name: "United States of America" }],
  production_companies: [{ name: "Warner Bros." }, { name: "Legendary" }],
  credits: {
    cast: [
      { id: 501, name: "Actriz 1", character: "Heroína", profile_path: "/a.jpg" },
      { id: 502, name: "Actor 2", character: "Villano" }
    ],
    crew: [
      { id: 601, name: "Dir Uno", job: "Director", department: "Directing" },
      { name: "Guionista", job: "Screenplay", department: "Writing" },
      { name: "Compositor", job: "Original Music Composer", department: "Sound" },
      { name: "Foto", job: "Director of Photography", department: "Camera" },
      { name: "Ignorado", job: "Gaffer", department: "Lighting" }
    ]
  }
};
const ft = GMM.util.fichaTecnica(peliFT);
m.afirmar("dirección sale del crew con job Director, con su nombre e id",
  ft.direccion.length === 1 && ft.direccion[0].nombre === "Dir Uno" && ft.direccion[0].id === 601);
m.afirmar("guion sale del departamento Writing", ft.guion.join(",") === "Guionista");
m.afirmar("música y fotografía por su job",
  ft.musica.join(",") === "Compositor" && ft.fotografia.join(",") === "Foto");
m.afirmar("productoras conservan el orden", ft.productoras.join(",") === "Warner Bros.,Legendary");
m.afirmar("país se traduce por su código ISO", ft.paises.length === 1 && ft.paises[0].length > 2);
m.afirmar("reparto se corta y guarda personaje, foto e id (para su filmografía)",
  ft.reparto.length === 2 && ft.reparto[0].personaje === "Heroína" &&
  ft.reparto[0].foto === "/a.jpg" && ft.reparto[0].id === 501);
m.afirmar("tieneFichaTecnica es true cuando hay datos", GMM.util.tieneFichaTecnica(ft) === true);

const serieFT = { tipo: "tv", created_by: [{ id: 701, name: "Creadora 1" }, { id: 702, name: "Creador 2" }], credits: { cast: [], crew: [] } };
const ftv = GMM.util.fichaTecnica(serieFT);
m.afirmar("en serie la dirección es la creación (created_by), con id",
  ftv.esTv === true && ftv.direccion.map((d) => d.nombre).join(",") === "Creadora 1,Creador 2" &&
  ftv.direccion[0].id === 701);
m.afirmar("ficha vacía no tiene ficha técnica que enseñar",
  GMM.util.tieneFichaTecnica(GMM.util.fichaTecnica({})) === false);

/* ---------------------------------------------------------------- */
m.titulo("Colecciones de Descubrir: Marvel, DC, Anime, Hindi (V GMM 0024)");

m.afirmar("hay cuatro colecciones en el config", GMM.datos.COLECCIONES.length === 4);
m.afirmar("esColeccion distingue la clave prefijada de un id de género",
  GMM.datos.esColeccion("col:marvel") === true && GMM.datos.esColeccion("28") === false && GMM.datos.esColeccion("") === false);
m.afirmar("coleccion() resuelve por clave", GMM.datos.coleccion("col:marvel").nombre === "Marvel");
m.afirmar("Marvel y DC resuelven su keyword del cómic por nombre, con reserva verificada",
  GMM.datos.coleccion("col:marvel").keywordsPorNombre.indexOf("marvel comic") !== -1 &&
  GMM.datos.coleccion("col:marvel").keywordsFallback.indexOf("180547") !== -1 &&
  GMM.datos.coleccion("col:dc").keywordsPorNombre.indexOf("dc comics") !== -1 &&
  GMM.datos.coleccion("col:dc").keywordsFallback.indexOf("229266") !== -1);
m.afirmar("Anime e Hindi se resuelven con idioma original (sin keyword)",
  GMM.datos.coleccion("col:anime").params.with_original_language === "ja" &&
  GMM.datos.coleccion("col:anime").params.with_genres === "16" &&
  GMM.datos.coleccion("col:hindi").params.with_original_language === "hi" &&
  !GMM.datos.coleccion("col:hindi").keywordsPorNombre);

m.afirmar("combinarKeywords une resueltos y reserva, sin vacíos ni duplicados",
  GMM.util.combinarKeywords(["9715", ""], ["180547", "9715"]) === "9715|180547");
m.afirmar("combinarKeywords tolera nulos y devuelve solo la reserva si no hay resueltos",
  GMM.util.combinarKeywords([null, undefined], ["229266", "312528"]) === "229266|312528");
m.afirmar("combinarKeywords vacío por ambos lados es cadena vacía",
  GMM.util.combinarKeywords([], []) === "");

/* ---------------------------------------------------------------- */
m.titulo("Sincronizar con Firebase: fusión de listas (GMM.util.fusionarListas, V GMM 0029)");

const favA = { id: 1, tipo: "movie", title: "A", anadida: "2026-01-01T00:00:00.000Z" };
const favA2 = { id: 1, tipo: "movie", title: "A", anadida: "2025-06-01T00:00:00.000Z" }; // misma peli, en la nube, más antigua
const favB = { id: 2, tipo: "tv", title: "B", anadida: "2026-02-01T00:00:00.000Z" };     // solo local
const favC = { id: 1, tipo: "tv", title: "C", anadida: "2026-03-01T00:00:00.000Z" };     // mismo id que A pero otro tipo: no es la misma

let fusion = GMM.util.fusionarListas(
  { favoritas: [favA, favB, favC], pendientes: [] },
  { favoritas: [favA2], pendientes: [] }
);
m.afirmar("une sin duplicar por (id, tipo)", fusion.favoritas.length === 3, "salieron " + fusion.favoritas.length);
m.afirmar("ante un duplicado, conserva la fecha 'anadida' más antigua",
  fusion.favoritas.find((x) => x.id === 1 && x.tipo === "movie").anadida === favA2.anadida);
m.afirmar("mismo id pero distinto tipo no se deduplica (peli y serie pueden compartir id)",
  fusion.favoritas.some((x) => x.id === 1 && x.tipo === "tv"));
m.afirmar("lo que solo está en local se conserva", fusion.favoritas.some((x) => x.id === 2));

const soloRemoto = GMM.util.fusionarListas(
  { favoritas: [], pendientes: [] },
  { favoritas: [favA], pendientes: [favB] }
);
m.afirmar("local vacío: se queda con todo lo remoto",
  soloRemoto.favoritas.length === 1 && soloRemoto.pendientes.length === 1);

const ambosVacios = GMM.util.fusionarListas({}, {});
m.afirmar("sin listas en ninguno de los dos lados no falla y devuelve vacío",
  ambosVacios.favoritas.length === 0 && ambosVacios.pendientes.length === 0);

/* ---------------------------------------------------------------- */
m.titulo("Cuenta (Firebase, V GMM 0029): degradación sin el SDK y mensajes de error");

m.afirmar("sin el SDK cargado (Node no tiene 'firebase'), la cuenta se declara no disponible",
  GMM.cuenta.disponible() === false);
m.afirmar("sin SDK, no hay sesión", GMM.cuenta.sesion() === null && GMM.cuenta.conectado() === false);
m.afirmar("interpretarError traduce los códigos conocidos del SDK",
  GMM.cuenta.interpretarError({ code: "auth/email-already-in-use" }) === "Ya hay una cuenta con ese correo. Prueba a entrar.");
m.afirmar("interpretarError tiene un mensaje de reserva para códigos desconocidos",
  typeof GMM.cuenta.interpretarError({ code: "auth/lo-que-sea" }) === "string" &&
  GMM.cuenta.interpretarError({ code: "auth/lo-que-sea" }).length > 0);
m.afirmar("interpretarError tolera que no llegue error", typeof GMM.cuenta.interpretarError() === "string");

/* ---------------------------------------------------------------- */
m.titulo("Lotes con concurrencia limitada");

let simultaneas = 0, pico = 0;
const trabajo = Array.from({ length: 13 }, (_, i) => i);
GMM.util.enLotes(trabajo, 5, (n) => {
  simultaneas++; pico = Math.max(pico, simultaneas);
  return new Promise((res) => setTimeout(() => { simultaneas--; res(n * 2); }, 5));
}, () => {}).then((res) => {
  m.afirmar("respeta el tope de 5 simultáneas", pico <= 5, "pico " + pico);
  m.afirmar("devuelve los 13 resultados en orden",
    res.join(",") === trabajo.map((n) => n * 2).join(","));
  return pEnlaceServidor.then(pruebaEnlaceOriginalServidor);
}).then(() => {
  process.exit(m.resumir() ? 1 : 0);
});

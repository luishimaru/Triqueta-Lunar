#!/usr/bin/env node
/**
 * sync-catalog.js — Triqueta Lunar
 * Uso:  node sync-catalog.js            (o doble clic en Actualizar-Web.bat)
 *       node sync-catalog.js --cat "Benediction=Death Metal"   (categoría para un pin nuevo)
 *       node sync-catalog.js --dry-run  (muestra lo que haría, sin escribir nada)
 *
 * A. Fotos reales: lee fotos_reales/<categoría>/ (png, jpg, jpeg, webp, mp4),
 *    las ordena de forma natural (1, 2 … 10, 11) y reescribe las etiquetas
 *    entre los marcadores <!-- AUTO-FOTOS ... START/END --> de index.html y de
 *    las galerías de pines, picks, stickers y llaveros. Si una página aún no
 *    tiene marcadores, los coloca la primera vez alrededor del bloque actual.
 *    Los carruseles de Aretes y Posavasos en index.html no se tocan.
 * B. Pines: compara los .png de pines/ con pines.json y añade los nuevos.
 *    "banda" = nombre del archivo con guiones como espacios; la "categoria"
 *    se hereda de la misma banda (o de la banda base, p. ej. "Misfits" para
 *    "Misfits-Skull"), se recibe con --cat o se pregunta en la consola.
 * C. Al terminar ejecuta build-seo.js (sitemap.xml + bloques SEO).
 *
 * Conserva los saltos de línea (CRLF/LF) de cada archivo.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const EXT_IMG = ['.png', '.jpg', '.jpeg', '.webp'];
const EXT_VIDEO = ['.mp4'];

/* ---------------- configuración de bloques ---------------- */

// index.html: carruseles de la portada (solo imágenes; el carrusel no reproduce videos).
// Las galerías de cada página sí aceptan videos ('inicio' o 'final').
const BLOQUES = [
  { file: 'index.html', id: 'index:pines',     carpeta: 'pines',     tipo: 'carrusel',
    alt: 'Pines de bandas de rock y metal en Bogotá | Triqueta Lunar' },
  { file: 'index.html', id: 'index:picks',     carpeta: 'picks',     tipo: 'carrusel',
    alt: 'Picks, púas y plumillas para guitarra personalizadas | Triqueta Lunar' },
  { file: 'index.html', id: 'index:stickers',  carpeta: 'stickers',  tipo: 'carrusel', clase: 'foto-real',
    alt: 'Stickers UV DTF de rock y metal | Triqueta Lunar' },
  { file: 'index.html', id: 'index:llaveros',  carpeta: 'llaveros',  tipo: 'carrusel',
    alt: 'Llaveros de bandas de rock y metal | Triqueta Lunar' },
  { file: 'index.html', id: 'index:camisetas', carpeta: 'camisetas', tipo: 'carrusel',
    alt: 'Camisetas de rock y metal estampadas en DTF | Triqueta Lunar' },

  { file: 'pines.html', id: 'galeria:pines', carpeta: 'pines', tipo: 'galeria', videos: 'final',
    extra: ' style="cursor: zoom-in;"', // el zoom lo da carrito.js con la clase .foto-real
    alt: n => `Foto real de pines Triqueta Lunar ${n}` },
  { file: 'picks.html', id: 'galeria:picks', carpeta: 'picks', tipo: 'galeria', videos: 'final',
    alt: n => `Muestra de Picks ${n}` },
  { file: 'stickers.html', id: 'galeria:stickers', carpeta: 'stickers', tipo: 'galeria', videos: 'inicio',
    alt: n => `Foto real de stickers UV DTF Triqueta Lunar ${n}` },
  { file: 'llaveros.html', id: 'galeria:llaveros', carpeta: 'llaveros', tipo: 'galeria', videos: 'final',
    alt: n => `Foto real de llaveros Triqueta Lunar ${n}` },
];

/* ---------------- utilidades ---------------- */

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const avisos = [];

const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const escribir = (f, txt) => { if (!DRY) fs.writeFileSync(path.join(ROOT, f), txt, 'utf8'); };
const eolDe = txt => (txt.includes('\r\n') ? '\r\n' : '\n');
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Ruta relativa con cada segmento codificado (espacios, tildes…), igual que build-seo.js
const url = rel => rel.split('/').map(seg =>
  encodeURIComponent(seg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
).join('/');
const ordenNatural = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

function listarMedios(carpeta) {
  const dir = path.join(ROOT, 'fotos_reales', carpeta);
  if (!fs.existsSync(dir)) return { imagenes: [], videos: [] };
  const archivos = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile()).sort(ordenNatural);
  const ext = f => path.extname(f).toLowerCase();
  return {
    imagenes: archivos.filter(f => EXT_IMG.includes(ext(f))).map(f => `fotos_reales/${carpeta}/${f}`),
    videos: archivos.filter(f => EXT_VIDEO.includes(ext(f))).map(f => `fotos_reales/${carpeta}/${f}`),
  };
}

/* ---------------- A. fotos reales ---------------- */

const marcas = id => [`<!-- AUTO-FOTOS ${id} START -->`, `<!-- AUTO-FOTOS ${id} END -->`];

// Primera ejecución: rodea con marcadores el contenido actual del carrusel o de la galería.
function colocarMarcadores(src, b, eol) {
  const [ini, fin] = marcas(b.id);
  let apertura;
  if (b.tipo === 'carrusel') {
    const iCard = src.indexOf(`<a href="${b.carpeta}.html" class="category-card">`);
    if (iCard === -1) throw new Error(`${b.file}: no se encontró la tarjeta de ${b.carpeta}`);
    apertura = src.indexOf('<div class="carousel"', iCard);
  } else {
    apertura = src.indexOf('<div class="galeria-reales">');
  }
  if (apertura === -1) throw new Error(`${b.file}: no se encontró el bloque de ${b.id}`);
  const iContenido = src.indexOf('>', apertura) + 1;
  const iCierre = src.indexOf('</div>', iContenido);
  const sangriaDiv = src.slice(src.lastIndexOf('\n', apertura) + 1, apertura);
  const sangria = sangriaDiv + '    ';
  return src.slice(0, iContenido) + eol +
    sangria + ini + eol + sangria + fin + eol + sangriaDiv +
    src.slice(iCierre);
}

function etiquetas(b, medios) {
  const { imagenes, videos } = medios;
  if (b.tipo === 'carrusel') {
    return imagenes.map((src, i) => {
      const clases = [b.clase, i === 0 ? 'active' : ''].filter(Boolean).join(' ');
      return `<img src="${url(src)}"${clases ? ` class="${clases}"` : ''} alt="${attr(b.alt)}">`;
    });
  }
  const imgs = imagenes.map((src, i) =>
    `<img src="${url(src)}" class="foto-real"${b.extra || ''} alt="${attr(b.alt(i + 1))}" loading="lazy">`);
  const vids = videos.map(src =>
    `<video src="${url(src)}" class="foto-real" autoplay loop muted playsinline></video>`);
  return b.videos === 'inicio' ? [...vids, ...imgs] : [...imgs, ...vids];
}

function sincronizarFotos() {
  const resumen = [];
  const porArchivo = new Map();
  BLOQUES.forEach(b => { if (!porArchivo.has(b.file)) porArchivo.set(b.file, []); porArchivo.get(b.file).push(b); });

  for (const [file, bloques] of porArchivo) {
    const original = leer(file);
    const eol = eolDe(original);
    let src = original;
    for (const b of bloques) {
      const [ini, fin] = marcas(b.id);
      if (!src.includes(ini)) src = colocarMarcadores(src, b, eol);
      const iIni = src.indexOf(ini);
      const iFin = src.indexOf(fin);
      if (iFin < iIni) throw new Error(`${file}: marcadores de ${b.id} desordenados`);

      const medios = listarMedios(b.carpeta);
      const lista = etiquetas(b, medios);
      if (!lista.length) avisos.push(`fotos_reales/${b.carpeta}/ está vacía: el bloque ${b.id} queda sin fotos.`);
      const sangria = src.slice(src.lastIndexOf('\n', iIni) + 1, iIni);
      const cuerpo = lista.map(t => sangria + t).join(eol);
      src = src.slice(0, iIni + ini.length) + eol + (cuerpo ? cuerpo + eol : '') + sangria + src.slice(iFin);
      resumen.push(`  ${b.id.padEnd(18)} ${medios.imagenes.length} fotos` +
        (b.tipo === 'galeria' && medios.videos.length ? ` + ${medios.videos.length} video(s)` : ''));
    }
    if (src !== original) escribir(file, src);
  }
  return resumen;
}

/* ---------------- B. pines nuevos ---------------- */

function leerCategoriasParam() {
  const out = new Map();
  args.forEach((a, i) => {
    let v = null;
    if (a === '--cat') v = args[i + 1];
    else if (a.startsWith('--cat=')) v = a.slice(6);
    if (!v || !v.includes('=')) return;
    const [k, ...resto] = v.split('=');
    out.set(k.trim().replace(/\.png$/i, '').replace(/-/g, ' ').toLowerCase(), resto.join('=').trim());
  });
  return out;
}

function categoriaHeredada(banda, pines) {
  const b = banda.toLowerCase();
  const exacta = pines.find(p => p.banda.toLowerCase() === b && p.categoria);
  if (exacta) return { categoria: exacta.categoria, de: exacta.banda };
  // Banda base: la más larga de pines.json con la que empieza el nombre nuevo ("Misfits" ← "Misfits Skull Blood")
  const base = pines
    .filter(p => p.categoria && b.startsWith(p.banda.toLowerCase() + ' '))
    .sort((x, y) => y.banda.length - x.banda.length)[0];
  return base ? { categoria: base.categoria, de: base.banda } : null;
}

function preguntar(rl, texto) {
  return new Promise(res => rl.question(texto, r => res(r.trim())));
}

async function sincronizarPines() {
  const texto = leer('pines.json');
  const pines = JSON.parse(texto.replace(/^﻿/, ''));
  const enJson = new Set(pines.map(p => p.imagen));
  const archivos = fs.readdirSync(path.join(ROOT, 'pines'))
    .filter(f => path.extname(f).toLowerCase() === '.png')
    .sort(ordenNatural);
  const enCarpeta = new Set(archivos);

  pines.filter(p => !enCarpeta.has(p.imagen)).forEach(p =>
    avisos.push(`pines.json apunta a pines/${p.imagen} (${p.banda}), pero el archivo no existe.`));

  const nuevos = archivos.filter(f => !enJson.has(f));
  if (!nuevos.length) return { agregados: [], pendientes: [] };

  const params = leerCategoriasParam();
  const categorias = [...new Set(pines.map(p => p.categoria).filter(Boolean))].sort(ordenNatural);
  const interactivo = process.stdin.isTTY && !DRY;
  let rl = null;

  const agregados = [];
  const pendientes = [];
  for (const imagen of nuevos) {
    const banda = imagen.replace(/\.png$/i, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    let categoria = params.get(banda.toLowerCase());
    let origen = categoria ? 'parámetro --cat' : '';
    if (!categoria) {
      const h = categoriaHeredada(banda, pines);
      if (h) { categoria = h.categoria; origen = `heredada de "${h.de}"`; }
    }
    if (!categoria && interactivo) {
      if (!rl) {
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        console.log('\nCategorías existentes:');
        categorias.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}. ${c}`));
      }
      const r = await preguntar(rl, `\nCategoría para "${banda}" (${imagen}) — número, texto nuevo o Enter para omitir: `);
      if (/^\d+$/.test(r) && categorias[Number(r) - 1]) categoria = categorias[Number(r) - 1];
      else if (r) categoria = r;
      if (categoria) origen = 'consola';
    }
    if (!categoria) { pendientes.push({ imagen, banda }); continue; }
    agregados.push({ banda, imagen, categoria, origen });
  }
  if (rl) rl.close();

  if (agregados.length) {
    // Inserción de texto antes del "]" final: conserva intacto el formato del resto del archivo.
    const eol = eolDe(texto);
    const iCierre = texto.lastIndexOf(']');
    const iUltimo = texto.lastIndexOf('}', iCierre);
    const bloque = agregados.map(p => [
      '  {',
      `    "banda": ${JSON.stringify(p.banda)},`,
      `    "imagen": ${JSON.stringify(p.imagen)},`,
      `    "categoria": ${JSON.stringify(p.categoria)}`,
      '  }',
    ].join(eol)).join(',' + eol);
    const nuevo = iUltimo === -1
      ? '[' + eol + bloque + eol + ']'
      : texto.slice(0, iUltimo + 1) + ',' + eol + bloque + texto.slice(iUltimo + 1);
    JSON.parse(nuevo.replace(/^﻿/, '')); // valida antes de guardar
    escribir('pines.json', nuevo);
  }
  return { agregados, pendientes };
}

/* ---------------- ejecución ---------------- */

async function main() {
  console.log(`Triqueta Lunar — sincronización${DRY ? ' (simulación, no se escribe nada)' : ''}\n`);

  console.log('A. Fotos reales:');
  console.log(sincronizarFotos().join('\n'));

  console.log('\nB. Pines:');
  const { agregados, pendientes } = await sincronizarPines();
  if (!agregados.length && !pendientes.length) console.log('  pines.json ya está al día.');
  agregados.forEach(p => console.log(`  + ${p.imagen} → "${p.banda}" [${p.categoria}] (${p.origen})`));
  if (pendientes.length) {
    console.log('  Sin categoría, NO se añadieron (no saldrán en la tienda todavía):');
    pendientes.forEach(p => console.log(`    ? ${p.imagen}`));
    console.log('  Para añadirlos:  node sync-catalog.js ' +
      pendientes.map(p => `--cat "${p.banda}=Categoría"`).join(' '));
  }

  console.log('\nC. SEO:');
  if (DRY) console.log('  (simulación: no se ejecuta build-seo.js)');
  else execFileSync(process.execPath, [path.join(ROOT, 'build-seo.js')], { cwd: ROOT, stdio: 'inherit' });

  if (avisos.length) {
    console.log('\n⚠ Avisos:');
    avisos.forEach(a => console.log('  - ' + a));
  }
  console.log('\nListo.');
}

main().catch(err => { console.error('\nERROR: ' + err.message); process.exitCode = 1; });

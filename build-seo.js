#!/usr/bin/env node
/**
 * build-seo.js — Triqueta Lunar
 * Fase 2 de SEO. Uso:  node build-seo.js
 *
 * 1. Unifica canonical / og:url / URLs del JSON-LD con los enlaces internos (*.html).
 * 2. Genera sitemap.xml con la extensión de Google Image Sitemap.
 * 3. Inyecta en pines, llaveros, aretes, camisetas y posavasos un bloque
 *    JSON-LD "ItemList" + <noscript> entre <!-- SEO-CATALOG-START/END -->.
 *
 * Solo LEE los .json (nunca los escribe). Es idempotente: si se vuelve a
 * ejecutar, reemplaza el bloque anterior en lugar de duplicarlo.
 * Conserva los saltos de línea (CRLF/LF) de cada HTML.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITE = 'https://triquetalunar.com';
const MARK_START = '<!-- SEO-CATALOG-START -->';
const MARK_END = '<!-- SEO-CATALOG-END -->';

// Páginas publicadas (decoraciones.html está vacía, por eso no se incluye).
const PAGES = [
  { file: 'index.html',     priority: '1.0', changefreq: 'weekly' },
  { file: 'pines.html',     priority: '0.9', changefreq: 'weekly',  json: 'pines.json' },
  { file: 'llaveros.html',  priority: '0.8', changefreq: 'weekly',  json: 'pines.json' },
  { file: 'picks.html',     priority: '0.8', changefreq: 'weekly',  json: 'pines.json' },
  { file: 'stickers.html',  priority: '0.8', changefreq: 'weekly',  json: 'pines.json' },
  { file: 'aretes.html',    priority: '0.8', changefreq: 'monthly', json: 'aretes.json' },
  { file: 'camisetas.html', priority: '0.8', changefreq: 'monthly', json: 'camisetas.json' },
  { file: 'posavasos.html', priority: '0.8', changefreq: 'monthly', json: 'posavasos.json' },
];
const PAGE_SLUGS = PAGES.filter(p => p.file !== 'index.html').map(p => p.file.replace('.html', ''));

// Precios tal como aparecen en cada página (COP).
const PRECIO = {
  pin: 10000,
  llavero: 15000,
  arete: 5000,
  camisetaFrontal: 35000,
  camisetaDoble: 40000,
  posavasos4: 35000,
  posavasos6: 45000,
};

/* ---------------- utilidades ---------------- */

const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, ''));

// URL absoluta con cada segmento codificado (tildes, espacios, (), ' …)
// respetando mayúsculas y guiones del nombre real del archivo.
function absUrl(relPath) {
  const enc = relPath.split('/').map(seg =>
    encodeURIComponent(seg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  ).join('/');
  return `${SITE}/${enc}`;
}
const relUrl = rel => absUrl(rel).slice(SITE.length + 1);
const pageUrl = file => (file === 'index.html' ? `${SITE}/` : `${SITE}/${file}`);

const xml = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const html = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON seguro dentro de <script>
const jsonForScript = obj => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

const lastmod = (...files) => {
  const t = Math.max(...files.filter(Boolean).map(f => fs.statSync(path.join(ROOT, f)).mtime.getTime()));
  return new Date(t).toISOString().slice(0, 10);
};
const fileExists = rel => fs.existsSync(path.join(ROOT, rel));

/* ---------------- catálogos (solo lectura) ---------------- */

const pines = readJSON('pines.json')
  .map(p => ({ ...p, categoria: p.categoria || 'Rock y Metal' }))
  .sort((a, b) => a.banda.localeCompare(b.banda, 'es'));

const aretes = readJSON('aretes.json')
  .map(a => ({ nombre: a['diseño'] || 'Diseño sin nombre', imagen: a.imagen }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

const fotosDe = (carpetaBase, prod) => {
  const out = [];
  for (let i = 1; i <= (prod.total_fotos || 1); i++) out.push(`${carpetaBase}/${prod.carpeta}/${i}.png`);
  return out;
};

const camisetas = readJSON('camisetas.json')
  .map(c => {
    const doble = c.tipo_estampado === 'doble';
    return {
      nombre: c.nombre,
      fotos: fotosDe('camisetas', c),
      precio: doble ? PRECIO.camisetaDoble : PRECIO.camisetaFrontal,
      estampado: doble ? 'Frente + espalda' : 'Solo frente',
    };
  })
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

const posavasos = readJSON('posavasos.json')
  .map(p => ({
    nombre: p.nombre,
    puestos: p.puestos,
    fotos: fotosDe('posavasos', p),
    precio: p.puestos === 6 ? PRECIO.posavasos6 : PRECIO.posavasos4,
  }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

/* ---------------- 1. canonical unificado ---------------- */

// Los enlaces internos (header.html, index.html) usan "pines.html", etc.
// canonical, og:url y las URLs del JSON-LD se alinean a esa misma forma.
function unificarUrls(src) {
  const re = new RegExp(`${SITE.replace(/\./g, '\\.')}/(${PAGE_SLUGS.join('|')})(?![\\w./%-])`, 'g');
  return src.replace(re, (_, slug) => `${SITE}/${slug}.html`);
}

/* ---------------- 2. sitemap.xml ---------------- */

const imagenesPorPagina = {
  'pines.html': pines.map(p => ({
    loc: absUrl(`pines/${p.imagen}`),
    title: `Pin de ${p.banda} | Triqueta Lunar`,
    caption: `Pin de ${p.banda} (${p.categoria}) con corte láser e impresión UV. Envíos desde Bogotá a toda Colombia.`,
  })),
  'aretes.html': aretes.map(a => ({
    loc: absUrl(`aretes/${a.imagen}`),
    title: `Aretes ${a.nombre} | Triqueta Lunar`,
    caption: `Aretes ${a.nombre} con corte láser e impresión UV. Hechos en Bogotá, Colombia.`,
  })),
  'camisetas.html': camisetas.flatMap(c => c.fotos.map((f, i) => ({
    loc: absUrl(f),
    title: `Camiseta ${c.nombre}${c.fotos.length > 1 ? ` (foto ${i + 1})` : ''} | Triqueta Lunar`,
    caption: `Camiseta ${c.nombre} estampada en DTF (${c.estampado.toLowerCase()}). Envíos a toda Colombia.`,
  }))),
  'posavasos.html': posavasos.flatMap(p => p.fotos.map((f, i) => ({
    loc: absUrl(f),
    title: `Posavasos ${p.nombre} - ${p.puestos} puestos${p.fotos.length > 1 ? ` (foto ${i + 1})` : ''} | Triqueta Lunar`,
    caption: `Set de posavasos ${p.nombre} de ${p.puestos} puestos en PETG con impresión UV.`,
  }))),
};

function generarSitemap() {
  const faltantes = [];
  const urls = PAGES.map(p => {
    const imgs = (imagenesPorPagina[p.file] || []).filter(img => {
      const rel = decodeURIComponent(img.loc.slice(SITE.length + 1));
      if (!fileExists(rel)) { faltantes.push(rel); return false; }
      return true;
    });
    const imgXml = imgs.map(img => [
      '    <image:image>',
      `      <image:loc>${xml(img.loc)}</image:loc>`,
      `      <image:title>${xml(img.title)}</image:title>`,
      `      <image:caption>${xml(img.caption)}</image:caption>`,
      '    </image:image>',
    ].join('\n')).join('\n');
    return {
      xml: [
        '  <url>',
        `    <loc>${xml(pageUrl(p.file))}</loc>`,
        `    <lastmod>${lastmod(p.file, p.json)}</lastmod>`,
        `    <changefreq>${p.changefreq}</changefreq>`,
        `    <priority>${p.priority}</priority>`,
        imgXml,
        '  </url>',
      ].filter(Boolean).join('\n'),
      imagenes: imgs.length,
    };
  });

  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls.map(u => u.xml),
    '</urlset>',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), out, 'utf8');
  return { urls: urls.length, imagenes: urls.reduce((s, u) => s + u.imagenes, 0), faltantes };
}

/* ---------------- 3. bloques ItemList + noscript ---------------- */

const offer = precio => ({
  '@type': 'Offer',
  price: precio,
  priceCurrency: 'COP',
  availability: 'https://schema.org/InStock',
});

function itemList(nombre, pagina, productos) {
  const url = pageUrl(pagina);
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: nombre,
    url,
    numberOfItems: productos.length,
    itemListElement: productos.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        image: p.image,
        ...(p.category ? { category: p.category } : {}),
        ...(p.description ? { description: p.description } : {}),
        offers: offer(p.price),
      },
    })),
  };
}

const porCategoria = lista => {
  const m = new Map();
  lista.forEach(p => { if (!m.has(p.categoria)) m.set(p.categoria, []); m.get(p.categoria).push(p); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
};

function noscriptBandas(tipo, plural, precio) {
  const grupos = porCategoria(pines);
  const generos = grupos.map(([c]) => html(c)).join(', ');
  return [
    `<h2>Catálogo de ${plural.toLowerCase()} de bandas: ${pines.length} diseños de rock, metal y punk</h2>`,
    `<p>${plural} a $${precio.toLocaleString('es-CO')} COP c/u. Géneros: ${generos}.</p>`,
    ...grupos.map(([cat, lista]) =>
      `<h3>${html(cat)}</h3><ul>` +
      lista.map(p => `<li><a href="${html(relUrl('pines/' + p.imagen))}">${html(tipo)} de ${html(p.banda)}</a></li>`).join('') +
      '</ul>'),
  ];
}

function bloquesPorPagina() {
  const fmt = n => `$${n.toLocaleString('es-CO')} COP`;
  return {
    'pines.html': {
      ld: itemList('Pines de bandas de rock, metal y punk', 'pines.html',
        pines.map(p => ({ name: `Pin de ${p.banda}`, image: absUrl('pines/' + p.imagen), category: p.categoria, price: PRECIO.pin }))),
      ns: noscriptBandas('Pin', 'Pines', PRECIO.pin),
    },
    'llaveros.html': {
      ld: itemList('Llaveros de bandas de rock, metal y punk', 'llaveros.html',
        pines.map(p => ({ name: `Llavero de ${p.banda}`, image: absUrl('pines/' + p.imagen), category: p.categoria, price: PRECIO.llavero }))),
      ns: noscriptBandas('Llavero', 'Llaveros', PRECIO.llavero),
    },
    'aretes.html': {
      ld: itemList('Aretes con corte láser e impresión UV', 'aretes.html',
        aretes.map(a => ({ name: `Aretes ${a.nombre}`, image: absUrl('aretes/' + a.imagen), price: PRECIO.arete }))),
      ns: [
        `<h2>Catálogo de aretes: ${aretes.length} diseños</h2>`,
        '<ul>' + aretes.map(a => `<li><a href="${html(absUrl('aretes/' + a.imagen))}">Aretes ${html(a.nombre)}</a> - ${fmt(PRECIO.arete)}</li>`).join('') + '</ul>',
      ],
    },
    'camisetas.html': {
      ld: itemList('Camisetas estampadas en DTF', 'camisetas.html',
        camisetas.map(c => ({ name: `Camiseta ${c.nombre}`, image: c.fotos.map(absUrl), description: `Estampado DTF: ${c.estampado.toLowerCase()}.`, price: c.precio }))),
      ns: [
        `<h2>Catálogo de camisetas: ${camisetas.length} diseños</h2>`,
        '<ul>' + camisetas.map(c => `<li><a href="${html(absUrl(c.fotos[0]))}">Camiseta ${html(c.nombre)}</a> (${html(c.estampado.toLowerCase())}) - ${fmt(c.precio)}</li>`).join('') + '</ul>',
      ],
    },
    'posavasos.html': {
      ld: itemList('Posavasos / portavasos en PETG con impresión UV', 'posavasos.html',
        posavasos.map(p => ({ name: `Posavasos ${p.nombre} (${p.puestos} puestos)`, image: p.fotos.map(absUrl), description: `Set de ${p.puestos} posavasos en PETG con impresión UV.`, price: p.precio }))),
      ns: [
        `<h2>Catálogo de posavasos: ${posavasos.length} sets</h2>`,
        '<ul>' + posavasos.map(p => `<li><a href="${html(absUrl(p.fotos[0]))}">Posavasos ${html(p.nombre)} (${p.puestos} puestos)</a> - ${fmt(p.precio)}</li>`).join('') + '</ul>',
      ],
    },
  };
}

function inyectar(src, file, bloque, eol) {
  const lineas = [
    MARK_START,
    `<script type="application/ld+json">${jsonForScript(bloque.ld)}</script>`,
    '<noscript>',
    ...bloque.ns,
    '</noscript>',
    MARK_END,
  ];
  const texto = lineas.join(eol);

  const iStart = src.indexOf(MARK_START);
  const iEnd = src.indexOf(MARK_END);
  if (iStart !== -1 && iEnd > iStart) {
    return src.slice(0, iStart) + texto + src.slice(iEnd + MARK_END.length);
  }
  const iBody = src.lastIndexOf('</body>');
  if (iBody === -1) throw new Error(`${file}: no se encontró </body>`);
  return src.slice(0, iBody) + texto + eol + src.slice(iBody);
}

/* ---------------- ejecución ---------------- */

function main() {
  const bloques = bloquesPorPagina();
  const resumen = [];

  for (const p of PAGES) {
    const ruta = path.join(ROOT, p.file);
    const original = fs.readFileSync(ruta, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    let nuevo = unificarUrls(original);
    if (bloques[p.file]) nuevo = inyectar(nuevo, p.file, bloques[p.file], eol);
    if (nuevo !== original) {
      fs.writeFileSync(ruta, nuevo, 'utf8');
      resumen.push(`  ${p.file}: actualizado${bloques[p.file] ? ` (ItemList con ${bloques[p.file].ld.numberOfItems} productos)` : ''}`);
    } else {
      resumen.push(`  ${p.file}: sin cambios`);
    }
  }

  const sm = generarSitemap();
  console.log('HTML:');
  console.log(resumen.join('\n'));
  console.log(`sitemap.xml: ${sm.urls} URLs, ${sm.imagenes} imágenes`);
  if (sm.faltantes.length) {
    console.log(`Imágenes omitidas porque el archivo no existe (${sm.faltantes.length}):`);
    sm.faltantes.forEach(f => console.log('  - ' + f));
  }
}

main();

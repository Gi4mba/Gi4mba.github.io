// Builds the static site into _site/.
//
//   node scripts/build.mjs                    flag from site.config.json
//   node scripts/build.mjs --projects=on      override for a local preview (on | off)
//   FEATURE_PROJECTS=on node scripts/build.mjs  same override, as an environment variable
//
// Sources stay plain HTML. The build only fills two kinds of marker:
//   <!-- build:work -->      home: featured project + cards (+ link to all projects)
//   <!-- build:projects -->  projects page: every project, newest first
// With the projects flag off, the projects pages are not copied at all:
// the URL does not exist online.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const SITE = 'https://gi4mba.github.io';

// ---- Config and flag --------------------------------------------------------
const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const arg = process.argv.find((a) => a.startsWith('--projects='));
const env = arg ? arg.split('=')[1] : process.env.FEATURE_PROJECTS;
if (env && !['on', 'off'].includes(env)) throw new Error(`FEATURE_PROJECTS must be "on" or "off", got "${env}"`);
const PROJECTS_PAGE = env ? env === 'on' : config.features.projectsPage === true;

// ---- Projects ---------------------------------------------------------------
const DIR = join(ROOT, 'content', 'projects');
const projects = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const base = join(DIR, d.name);
    const p = JSON.parse(readFileSync(join(base, 'project.json'), 'utf8'));
    const extra = {};
    for (const lang of ['en', 'it']) {
      const f = join(base, `extra.${lang}.html`);
      if (existsSync(f)) extra[lang] = readFileSync(f, 'utf8').trimEnd();
    }
    for (const key of ['title', 'updated', 'repo', 'area', 'stack', 'summary']) {
      if (!(key in p)) throw new Error(`${d.name}/project.json: missing "${key}"`);
    }
    if (!/^\d{4}-\d{2}$/.test(p.updated)) throw new Error(`${d.name}: "updated" must be YYYY-MM`);
    let code = null;
    if (p.snippet) {
      // the code itself is a plain file next to project.json, copied verbatim from the repo
      const f = readdirSync(base).find((n) => n.startsWith('snippet.'));
      if (!f) throw new Error(`${d.name}: "snippet" set but no snippet.<ext> file`);
      code = readFileSync(join(base, f), 'utf8').replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n'); // repos may use CRLF
      const [from, to] = p.snippet.lines;
      if (code.length !== to - from + 1) throw new Error(`${d.name}: snippet has ${code.length} lines, "lines" says ${to - from + 1}`);
      code.lang = extname(f).slice(1);
    }
    return { id: d.name, ...p, extra, code };
  })
  .sort((a, b) => b.updated.localeCompare(a.updated)); // newest first

const byId = new Map(projects.map((p) => [p.id, p]));
const { featured, cards } = config.home;
for (const id of [featured, ...cards]) if (!byId.has(id)) throw new Error(`site.config.json: unknown project "${id}"`);
if (1 + cards.length > 3) throw new Error('site.config.json: the home shows at most 3 projects (1 featured + 2 cards)');

// ---- Rendering helpers ------------------------------------------------------
const T = {
  en: { featured: 'Featured', repo: 'View repository', on: 'on GitHub', all: 'All projects', path: '/projects/' },
  it: { featured: 'In evidenza', repo: 'Apri il repository', on: 'su GitHub', all: 'Tutti i progetti', path: '/it/progetti/' },
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Indents generated HTML, except inside <pre>: there whitespace is content.
function indent(text, n) {
  let inPre = false;
  return text.split('\n').map((l) => {
    const out = l && !inPre ? ' '.repeat(n) + l : l;
    if (l.includes('<pre')) inPre = !l.includes('</pre>');
    else if (l.includes('</pre>')) inPre = false;
    return out;
  }).join('\n');
}
const month = (ym, lang) => new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${ym}-01T00:00:00Z`));

function main(p, lang, { kicker, heading }) {
  return [
    '<div class="feature-main">',
    kicker ? `  <p class="kicker">${esc(kicker)}</p>` : null,
    `  ${heading}`,
    `  <p class="feature-text">${esc(p.summary[lang])}</p>`,
    '  <ul class="tags">',
    ...p.stack.map((s) => `    <li>${esc(s)}</li>`),
    '  </ul>',
    `  <a class="btn btn--primary" href="${esc(p.repo)}" target="_blank" rel="noopener">${T[lang].repo}</a>`,
    '</div>',
  ].filter((l) => l !== null).join('\n');
}

function spec(p, lang, cls) {
  if (!p.spec?.length) return null;
  return [
    `<dl class="${cls}">`,
    ...p.spec.map((row) => `  <div><dt>${esc(row[lang][0])}</dt><dd>${esc(row[lang][1])}</dd></div>`),
    '</dl>',
  ].join('\n');
}

// Home: the featured project in full, the others as cards
function renderWork(lang) {
  const f = byId.get(featured);
  const parts = [
    main(f, lang, {
      kicker: `${T[lang].featured} · ${f.area[lang]}`,
      heading: `<h3 class="feature-title">${esc(f.title)}</h3>`,
    }),
    spec(f, lang, 'spec spec--lg feature-spec'),
  ].filter(Boolean);
  let feature = `<article class="feature">\n${indent(parts.join('\n'), 2)}\n`;
  if (f.extra[lang]) feature += `\n${indent(f.extra[lang], 2)}\n`;
  feature += '</article>';

  const cardList = cards.map((id) => {
    const p = byId.get(id);
    return [
      '<article class="card">',
      `  <p class="kicker">${esc(p.stack.join(' · '))}</p>`,
      `  <h3>${esc(p.title)}</h3>`,
      `  <p>${esc((p.teaser ?? p.summary)[lang])}</p>`, // short line for the home; the full summary lives on /projects
      `  <a class="link-mono card-link" href="${esc(p.repo)}" target="_blank" rel="noopener" aria-label="${esc(`${p.title} ${T[lang].on}`)}">GitHub</a>`,
      '</article>',
    ].join('\n');
  });

  let html = `${feature}\n\n<div class="cards">\n${indent(cardList.join('\n'), 2)}\n</div>`;
  if (PROJECTS_PAGE) {
    html += `\n\n<p class="work-more"><a class="link-mono" href="${T[lang].path}">${T[lang].all}</a></p>`;
  }
  return indent(html, 8);
}

// Projects page: every project gets everything it has
function renderProjects(lang) {
  return projects.map((p) => {
    const side = [renderThumb(p), spec(p, lang, 'spec spec--lg')].filter(Boolean).join('\n');
    let body = main(p, lang, { heading: `<h2 class="feature-title" id="${p.id}-title">${esc(p.title)}</h2>` });
    if (side) body += `\n<div class="project-side">\n${indent(side, 2)}\n</div>`;
    if (p.code) body += `\n\n${renderSnippet(p, lang)}`;
    // extras are written for the home, where the project title is an h3; here it is an h2,
    // so their headings move up one level to keep the outline without gaps
    if (p.extra[lang]) body += `\n\n${p.extra[lang].replace(/<(\/?)h([3-6])\b/g, (_, s, n) => `<${s}h${n - 1}`)}`;
    return indent([
      `<section class="section wrap project" id="${p.id}" aria-labelledby="${p.id}-title">`,
      `  <p class="label">${esc(month(p.updated, lang))} · ${esc(p.area[lang])}</p>`,
      '  <article class="feature">',
      indent(body, 4),
      '  </article>',
      '</section>',
    ].join('\n'), 6);
  }).join('\n\n');
}

// Thumbnail: a project can ship its own image (thumb.webp / thumb.png / thumb.svg in its
// folder). Otherwise the build draws its block signature: the project id hashed with
// SHA-256, each byte deciding the colour of one hexagon. Same id, same picture, forever.
function renderThumb(p) {
  for (const f of ['thumb.webp', 'thumb.png', 'thumb.svg']) {
    if (existsSync(join(DIR, p.id, f))) {
      return `<figure class="project-thumb"><img src="/assets/img/projects/${p.id}-${f}" alt="" width="640" height="400" loading="lazy" decoding="async"></figure>`;
    }
  }
  const h = createHash('sha256').update(p.id).digest();
  const hex = h.toString('hex');
  const R = 22;
  const W = Math.sqrt(3) * R; // width of a pointy-top hexagon
  let cells = '';
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 8; col++) {
      const i = row * 8 + col;
      const b = h[i % 32] ^ ((i * 37) & 255); // 56 cells from 32 bytes: mix in the index
      const cx = 330 + col * W + (row % 2 ? W / 2 : 0);
      const cy = 52 + row * R * 1.5;
      const pts = [0, 1, 2, 3, 4, 5].map((k) => {
        const a = (Math.PI / 180) * (60 * k - 30);
        return `${(cx + R * 0.92 * Math.cos(a)).toFixed(1)},${(cy + R * 0.92 * Math.sin(a)).toFixed(1)}`;
      }).join(' ');
      const cls = b < 40 ? 'hx-a' : b < 90 ? 'hx-m' : b < 150 ? 'hx-v' : 'hx-o';
      cells += `<polygon class="${cls}" points="${pts}"/>`;
    }
  }
  return [
    '<figure class="project-thumb">',
    `  <svg class="sig" viewBox="0 0 640 400" aria-hidden="true" focusable="false">`,
    `    <rect class="sig-bg" width="640" height="400"/>`,
    `    ${cells}`,
    `    <text class="sig-k" x="36" y="56">BLOCK · ${esc(p.updated)}</text>`,
    `    <text class="sig-t" x="36" y="300">${esc(p.title)}</text>`,
    `    <text class="sig-h" x="36" y="336">0x${hex.slice(0, 8)}…${hex.slice(-6)}</text>`,
    `    <text class="sig-s" x="36" y="362">${esc(p.stack.join(' · ').toUpperCase())}</text>`,
    '  </svg>',
    '</figure>',
  ].join('\n');
}

// Snippet: real code as text (selectable, searchable, read by screen readers),
// with a light highlight done here so the page ships no highlighter.
const KEYWORDS = {
  sol: ['if', 'else', 'return', 'returns', 'function', 'external', 'public', 'internal', 'view', 'pure', 'storage', 'memory', 'emit', 'require', 'true', 'false'],
  ts: ['const', 'let', 'await', 'async', 'return', 'if', 'else', 'function', 'true', 'false', 'new'],
};
function highlight(line, lang) {
  const at = line.indexOf('//');
  const codePart = at === -1 ? line : line.slice(0, at);
  const comment = at === -1 ? '' : line.slice(at);
  const kw = new RegExp(`\\b(${(KEYWORDS[lang] || []).join('|')})\\b`, 'g');
  const html = esc(codePart)
    .replace(kw, '<span class="tk-k">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="tk-n">$1</span>');
  return html + (comment ? `<span class="tk-c">${esc(comment)}</span>` : '');
}
function renderSnippet(p, lang) {
  const { file, lines: [from, to], commit, caption } = p.snippet;
  const url = `${p.repo}/blob/${commit}/${file}#L${from}-L${to}`;
  // line numbers live in their own column, outside <code>: a copy gets only the code
  const nums = p.code.map((_, i) => from + i).join('\n');
  const body = p.code.map((l) => highlight(l, p.code.lang)).join('\n');
  return [
    '<figure class="snippet">',
    `  <figcaption class="snippet-head"><span>// ${esc(file).replace(/\//g, "/<wbr>")}</span><a class="link-mono" href="${esc(url)}" target="_blank" rel="noopener">L${from}–${to}</a></figcaption>`,
    '  <div class="snippet-body">',
    `    <pre class="snippet-ln" aria-hidden="true">${nums}</pre>`,
    `    <pre class="snippet-code" tabindex="0"><code>${body}</code></pre>`,
    '  </div>',
    `  <p class="snippet-note">${esc(caption[lang])}</p>`,
    '</figure>',
  ].join('\n');
}

// ---- Output -----------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
const STATIC = ['index.html', 'it', 'assets', 'portfolio', '404.html', 'favicon.ico', 'robots.txt', 'site.webmanifest', 'sitemap.xml'];
const PROJECT_PAGES = { en: 'projects/index.html', it: 'it/progetti/index.html' };
for (const entry of STATIC) {
  cpSync(join(ROOT, entry), join(OUT, entry), {
    recursive: true,
    filter: (src) => !src.startsWith(join(ROOT, 'it', 'progetti')), // copied below, only with the flag
  });
}

function fill(file, marker, html) {
  const path = join(OUT, file);
  const src = readFileSync(path, 'utf8');
  const tag = `<!-- build:${marker} -->`;
  const line = src.split('\n').find((l) => l.trim() === tag);
  if (!line) throw new Error(`${file}: marker ${tag} not found`);
  writeFileSync(path, src.replace(line, html));
}

fill('index.html', 'work', renderWork('en'));
fill('it/index.html', 'work', renderWork('it'));

if (PROJECTS_PAGE) {
  for (const [lang, file] of Object.entries(PROJECT_PAGES)) {
    mkdirSync(dirname(join(OUT, file)), { recursive: true });
    cpSync(join(ROOT, file), join(OUT, file));
    fill(file, 'projects', renderProjects(lang));
  }
  // project images live with the project's content, published under assets/img/projects/
  for (const p of projects) {
    for (const f of ['thumb.webp', 'thumb.png', 'thumb.svg']) {
      const src = join(DIR, p.id, f);
      if (existsSync(src)) cpSync(src, join(OUT, 'assets', 'img', 'projects', `${p.id}-${f}`));
    }
  }
  const lastmod = new Date().toISOString().slice(0, 10);
  const alt = ['en', SITE + T.en.path, 'it', SITE + T.it.path, 'x-default', SITE + T.en.path];
  const links = [0, 2, 4].map((i) => `    <xhtml:link rel="alternate" hreflang="${alt[i]}" href="${alt[i + 1]}"/>`).join('\n');
  const urls = ['en', 'it'].map((l) => `  <url>\n    <loc>${SITE}${T[l].path}</loc>\n    <lastmod>${lastmod}</lastmod>\n${links}\n  </url>`).join('\n');
  const sm = join(OUT, 'sitemap.xml');
  writeFileSync(sm, readFileSync(sm, 'utf8').replace('</urlset>', `${urls}\n</urlset>`));
}

console.log(`built _site/ · projects page ${PROJECTS_PAGE ? 'ON' : 'off'} · ${projects.length} projects · home: ${featured} + ${cards.join(', ')}`);

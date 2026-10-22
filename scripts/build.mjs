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
import { dirname, join } from 'node:path';
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
    return { id: d.name, ...p, extra };
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
const indent = (text, n) => text.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');
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
      `  <p>${esc(p.summary[lang])}</p>`,
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
    if (p.extra[lang]) body += `\n\n${p.extra[lang]}`;
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

// Thumbnail: a project can ship its own image (thumb.webp / thumb.png in its folder);
// until a style is chosen there is no generated fallback.
function renderThumb(p) {
  for (const f of ['thumb.webp', 'thumb.png', 'thumb.svg']) {
    if (existsSync(join(DIR, p.id, f))) {
      return `<figure class="project-thumb"><img src="/assets/img/projects/${p.id}-${f}" alt="" width="640" height="400" loading="lazy" decoding="async"></figure>`;
    }
  }
  return null;
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

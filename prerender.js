#!/usr/bin/env node
/**
 * Regenerates the static, crawlable snapshots of every route.
 *
 * WHY THIS EXISTS: this app builds every page's content client-side in
 * JavaScript, so a crawler that does not run (or does not wait for) that
 * JavaScript sees an empty page. AdSense's review crawler is less reliable
 * at executing JavaScript than Google Search's, so every page must exist as
 * real HTML containing its real content.
 *
 * The site is hosted on GitHub Pages, which cannot run server rewrites, so
 * each route is written to a real file:
 *     /<route>/index.html     (served at https://engineeringhubcalc.com/<route>/)
 * and the home page is written into /index.html itself. Every snapshot has:
 *   - the page's full rendered content,
 *   - a plain-HTML copy of the navigation (real <a href="/route/"> links so a
 *     crawler can discover every page; JavaScript replaces it on load),
 *   - title / description / canonical / Open Graph / JSON-LD for that route,
 *   - the AdSense account meta tag and loader in the raw <head>.
 * A visitor's browser re-renders the identical content and takes over as the
 * normal interactive single-page app. It is the same content, not a different
 * version for crawlers, so there is no cloaking.
 *
 * It also regenerates sitemap.xml from the route list.
 *
 * WHEN TO RE-RUN: after any change to page content, SEO_META or FAQ text.
 *
 * USAGE:
 *   1. python3 -m http.server 8899 &
 *   2. node prerender.js [port]
 *   3. Commit the regenerated <route>/index.html files, index.html and sitemap.xml.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.argv[2] || 8899;
const ROOT = __dirname;
const BASE_URL = `http://localhost:${PORT}`;

function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

function getRoutesToRender() {
  // Read the route list and noindex set directly from js/app.js's source
  // rather than trying to read them off the running page: ROUTES and
  // SEO_META are module-scoped `const` inside app.js (loaded via
  // <script type="module">), so they are never attached to `window` and
  // page.evaluate() cannot see them from outside that module.
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const routesBlock = src.match(/const ROUTES = \{([\s\S]*?)\n\};/)[1];
  const routeIds = [...routesBlock.matchAll(/'([a-z0-9-]*)':\s*page/g)].map((m) => m[1]).filter((id) => id !== '');
  const metaBlock = src.match(/const SEO_META = \{([\s\S]*?)\n\};/)[1];
  const noindexIds = new Set([...metaBlock.matchAll(/'([a-z0-9-]+)':\s*\{[^}]*noindex:\s*true/g)].map((m) => m[1]));
  return routeIds.filter((id) => !noindexIds.has(id));
}

function toPathLinks(html) {
  // any remaining legacy ?page=x link -> real path link
  return html.replace(/href="\?page=([a-z0-9-]+)"/g, 'href="/$1/"');
}

function applyRoute(headTemplate, bodyContent, d, subpage) {
  let head = headTemplate;
  if (subpage) head = head.replace(/(href|src)="\.\//g, '$1="/');
  head = head.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(d.title)}</title>`);
  head = head.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeAttr(d.description)}">`);
  head = head.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${escapeAttr(d.robots || 'index, follow')}">`);
  head = head.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeAttr(d.canonical)}">`);
  head = head.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeAttr(d.ogTitle)}">`);
  head = head.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeAttr(d.ogDescription)}">`);
  head = head.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeAttr(d.ogUrl)}">`);
  head = head.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escapeAttr(d.twitterTitle)}">`);
  head = head.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escapeAttr(d.twitterDescription)}">`);
  const jsonLdBlock = d.jsonLdScripts.map((j) => `<script type="application/ld+json">\n${j.trim()}\n</script>`).join('\n');
  // replace ALL existing JSON-LD blocks with this route's set
  let first = true;
  head = head.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, () => { if (first) { first = false; return jsonLdBlock + '\n'; } return ''; });
  if (subpage) head = '\n<base href="/">' + head;

  let body = subpage ? bodyContent.replace(/(href|src)="\.\//g, '$1="/') : bodyContent;
  body = body.replace(/<main class="content" id="content">[\s\S]*?<\/main>/, () => `<main class="content" id="content">${toPathLinks(d.contentHtml)}</main>`);
  body = body.replace(/<nav class="nav" id="nav-root">[\s\S]*?<\/nav>/, () => `<nav class="nav" id="nav-root">${toPathLinks(d.navHtml)}</nav>`);
  return { head, body };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(`${BASE_URL}/index.html`);
  await page.waitForTimeout(500);

  const routes = getRoutesToRender();
  console.log(`Pre-rendering ${routes.length} routes...`);

  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const headStart = indexHtml.indexOf('<head>') + '<head>'.length;
  const headEnd = indexHtml.indexOf('</head>');
  const headTemplate = indexHtml.slice(headStart, headEnd);
  const bodyContent = indexHtml.slice(indexHtml.indexOf('<body'));
  const buildHtml = (d, subpage) => {
    const { head, body } = applyRoute(headTemplate, bodyContent, d, subpage);
    return `<!DOCTYPE html>\n<html lang="en">\n<head>${head}</head>\n${body}`;
  };
  const capture = () => page.evaluate(() => {
    const get = (sel, attr) => { const el = document.querySelector(sel); return el ? el.getAttribute(attr) : null; };
    return {
      title: document.title,
      description: get('meta[name="description"]', 'content'),
      robots: get('meta[name="robots"]', 'content'),
      canonical: get('link[rel="canonical"]', 'href'),
      ogTitle: get('meta[property="og:title"]', 'content'),
      ogDescription: get('meta[property="og:description"]', 'content'),
      ogUrl: get('meta[property="og:url"]', 'content'),
      twitterTitle: get('meta[name="twitter:title"]', 'content'),
      twitterDescription: get('meta[name="twitter:description"]', 'content'),
      jsonLdScripts: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
      contentHtml: document.getElementById('content').innerHTML,
      navHtml: document.getElementById('nav-root').innerHTML,
    };
  });

  const RESERVED = new Set(['css', 'js', 'assets', 'data', 'tests', 'node_modules']);
  for (const r of routes) if (RESERVED.has(r)) throw new Error(`Route id "${r}" collides with a site directory`);
  // The old /pages/ snapshots were an Apache-rewrite scheme that GitHub Pages cannot run; they would only
  // duplicate content, so remove them.
  fs.rmSync(path.join(ROOT, 'pages'), { recursive: true, force: true });

  let ok = 0;
  const failed = [];
  for (const route of routes) {
    try {
      await page.goto(`${BASE_URL}/index.html?page=${encodeURIComponent(route)}`);
      await page.waitForTimeout(150);
      const d = await capture();

      const html = buildHtml(d, true);
      fs.mkdirSync(path.join(ROOT, route), { recursive: true });
      fs.writeFileSync(path.join(ROOT, route, 'index.html'), html);
      ok++;
    } catch (e) {
      failed.push(`${route}: ${e.message}`);
    }
  }

  // Home page: written into index.html itself (same file the SPA boots from).
  try {
    await page.goto(`${BASE_URL}/index.html`);
    await page.waitForTimeout(300);
    const d = await capture();
    d.canonical = 'https://engineeringhubcalc.com/';
    const { head, body } = applyRoute(headTemplate, bodyContent, d, false);
    fs.writeFileSync(path.join(ROOT, 'index.html'), `<!DOCTYPE html>\n<html lang="en">\n<head>${head}</head>\n${body}`);
    console.log('Home page snapshot written into index.html');
  } catch (e) { failed.push('home: ' + e.message); }

  // sitemap.xml from the route list
  const today = new Date().toISOString().slice(0, 10);
  const urls = [['https://engineeringhubcalc.com/', '1.0'], ...routes.map((r) => [`https://engineeringhubcalc.com/${r}/`, '0.8'])];
  const sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(([u, pr]) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${pr}</priority>\n  </url>`).join('\n') + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm);
  console.log(`sitemap.xml: ${urls.length} URLs`);

  console.log(`Done. Generated: ${ok} / Failed: ${failed.length}`);
  if (failed.length) console.log(failed.join('\n'));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
}

main();

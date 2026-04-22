#!/usr/bin/env node
/**
 * Zosia Pages — Build Script
 * Scans all subdirectories for index.html, extracts metadata,
 * and injects a pages manifest into the main index.html.
 *
 * Features:
 * - Git-based created/updated dates (with x-created/x-updated meta overrides)
 * - OG/social meta tag injection
 * - Sitemap.xml generation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const REPO_ROOT = path.resolve(ROOT, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const HOME_PATH = path.join(REPO_ROOT, 'index.html');
const SITEMAP_PATH = path.join(REPO_ROOT, 'sitemap.xml');
const SITE_URL = 'https://zosia.cc';

// Skip these directories
const SKIP = new Set(['.vercel', 'node_modules', '.git']);

// Category mapping: slug patterns → category
const CATEGORY_MAP = {
  'skills-inventory': 'openclaw',
  'sandbox-security': 'openclaw',
  'memory-review': 'openclaw',
  'qmd-audit': 'openclaw',
  'acp-mental-model': 'openclaw',
  'cc-switch': 'openclaw',
  'visual-explainer-upgrade': 'openclaw',
  'opik-architecture': 'observability',
  'opik-phase1-plan': 'observability',
  'opik-6day-analysis': 'observability',
  'cicd-playbook': 'devops',
  'github-cicd-solo': 'devops',
  'health-system': 'health',
  'health-sync-research': 'health',
  'smart-ring-benchmark-iphone-2026': 'health',
  'multi-agent-comparison': 'architecture',
  'zosia-identity': 'zosia',
  'zosia-opportunities': 'zosia',
  'zosia-argus-overview': 'architecture',
  'zosia-context-architecture': 'architecture',
  'argus-agent-plan': 'architecture',
  'argus-migration': 'architecture',
  'mycroft-plan-v2': 'architecture',
  'personal-knowledge-graph-v2': 'architecture',
};

// Keyword-based fallback for unknown slugs
const KEYWORD_CATEGORIES = [
  { keywords: ['opik', 'observab', 'trace', 'telemetry'], cat: 'observability' },
  { keywords: ['cicd', 'ci-cd', 'devops', 'deploy', 'github-ci'], cat: 'devops' },
  { keywords: ['health', 'apple-health', 'fitness', 'ring', 'wearable'], cat: 'health' },
  { keywords: ['zosia', 'identity', 'soul'], cat: 'zosia' },
  { keywords: ['openclaw', 'sandbox', 'skill', 'memory', 'acp', 'qmd', 'visual-explainer'], cat: 'openclaw' },
  { keywords: ['argus', 'mycroft', 'agent', 'architect', 'multi-agent', 'knowledge-graph'], cat: 'architecture' },
];

function guessCategory(slug) {
  if (CATEGORY_MAP[slug]) return CATEGORY_MAP[slug];
  const lower = slug.toLowerCase();
  for (const { keywords, cat } of KEYWORD_CATEGORIES) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return 'openclaw';
}

function extractMeta(html) {
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || 'Untitled';

  let desc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]?.trim();
  if (!desc) desc = html.match(/<meta\s+name="x-description"\s+content="([^"]*)"/i)?.[1]?.trim();
  if (!desc) desc = html.match(/<p[^>]*class="[^"]*subtitle[^"]*"[^>]*>([^<]+)<\/p>/i)?.[1]?.trim();
  if (!desc) desc = html.match(/<p[^>]*class="[^"]*tagline[^"]*"[^>]*>([^<]+)<\/p>/i)?.[1]?.trim();
  if (!desc) {
    const paragraphs = html.match(/<p[^>]*>([^<]{20,})<\/p>/gi);
    if (paragraphs?.[0]) {
      desc = paragraphs[0].replace(/<[^>]+>/g, '').trim().slice(0, 200);
    }
  }
  if (!desc) desc = title;

  const catOverride = html.match(/<meta\s+name="x-category"\s+content="([^"]*)"/i)?.[1]?.trim();
  const tagsRaw = html.match(/<meta\s+name="x-tags"\s+content="([^"]*)"/i)?.[1]?.trim();
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
  const createdMeta = html.match(/<meta\s+name="x-created"\s+content="([^"]*)"/i)?.[1]?.trim();
  const updatedMeta = html.match(/<meta\s+name="x-updated"\s+content="([^"]*)"/i)?.[1]?.trim();

  return { title, desc, catOverride, tags, createdMeta, updatedMeta };
}

/**
 * Get the date a file was first committed (git add date).
 * Falls back to filesystem mtime if not in git.
 */
function getGitCreatedDate(filePath) {
  try {
    const result = execSync(
      `git log --diff-filter=A --follow --format='%aI' -- "${filePath}" | tail -1`,
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (result) return result.slice(0, 10);
  } catch {}
  return fs.statSync(filePath).mtime.toISOString().slice(0, 10);
}

/**
 * Get the date a file was last modified in git.
 * Falls back to filesystem mtime if not in git.
 */
function getGitUpdatedDate(filePath) {
  try {
    const result = execSync(
      `git log -1 --format='%aI' -- "${filePath}"`,
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (result) return result.slice(0, 10);
  } catch {}
  return fs.statSync(filePath).mtime.toISOString().slice(0, 10);
}

function guessTags(slug, title, cat) {
  const tags = [];
  const lower = (slug + ' ' + title).toLowerCase();
  if (lower.includes('plan') || lower.includes('roadmap')) tags.push('plan');
  if (lower.includes('research') || lower.includes('deep research') || lower.includes('benchmark')) tags.push('research');
  if (lower.includes('architecture') || lower.includes('deployment')) tags.push('architecture');
  if (lower.includes('guide') || lower.includes('playbook') || lower.includes('how')) tags.push('guide');
  if (lower.includes('comparison') || lower.includes('vs') || lower.includes('benchmark')) tags.push('comparison');
  if (lower.includes('audit') || lower.includes('review') || lower.includes('analysis')) tags.push('analysis');
  if (lower.includes('overview') || lower.includes('migration')) tags.push('overview');
  if (lower.includes('security')) tags.push('security');
  if (lower.includes('reference') || lower.includes('inventory')) tags.push('reference');
  if (lower.includes('demo') || lower.includes('upgrade')) tags.push('demo');
  if (tags.length === 0) tags.push(cat);
  return [...new Set(tags)].slice(0, 3);
}

function discoverPages() {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
    const pageIndex = path.join(ROOT, entry.name, 'index.html');
    if (!fs.existsSync(pageIndex)) continue;

    const slug = entry.name;
    const html = fs.readFileSync(pageIndex, 'utf-8');
    const meta = extractMeta(html);

    const cat = meta.catOverride || guessCategory(slug);
    const tags = meta.tags.length > 0 ? meta.tags : guessTags(slug, meta.title, cat);
    const created = meta.createdMeta || getGitCreatedDate(pageIndex);
    const updated = meta.updatedMeta || getGitUpdatedDate(pageIndex);

    pages.push({
      slug,
      title: meta.title,
      desc: meta.desc,
      cat,
      created,
      updated,
      tags
    });
  }

  return pages.sort((a, b) => b.created.localeCompare(a.created));
}

function discoverCategories(pages) {
  const catLabels = {
    openclaw: 'OpenClaw',
    observability: 'Observability',
    devops: 'CI/CD & DevOps',
    health: 'Health',
    zosia: 'Zosia',
    architecture: 'Architecture',
    research: 'Research',
    tools: 'Tools',
  };
  const usedCats = new Set(pages.map(p => p.cat));
  const result = {};
  for (const cat of usedCats) {
    result[cat] = catLabels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
  }
  return result;
}

function injectIntoIndex(pages, categories) {
  let html = fs.readFileSync(INDEX_PATH, 'utf-8');

  // Find the most recent updated date across all pages
  const latestUpdated = pages.reduce((max, p) => p.updated > max ? p.updated : max, pages[0]?.updated || '');
  const lastUpdatedFormatted = new Date(latestUpdated + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const catCount = Object.keys(categories).length;

  // Replace the pages array
  const pagesJson = JSON.stringify(pages, null, 6);
  html = html.replace(
    /const pages = \[[\s\S]*?\];\s*\n/,
    `const pages = ${pagesJson};\n`
  );

  // Replace catLabels
  const catJson = JSON.stringify(categories, null, 6);
  html = html.replace(
    /const catLabels = \{[\s\S]*?\};\s*\n/,
    `const catLabels = ${catJson};\n`
  );

  // Update stats
  html = html.replace(
    /<span><span class="num">\d+<\/span> pages<\/span>/,
    `<span><span class="num">${pages.length}</span> pages</span>`
  );
  html = html.replace(
    /<span><span class="num">\d+<\/span> categories<\/span>/,
    `<span><span class="num">${catCount}</span> categories</span>`
  );
  // Replace "Last deployed" or "Last updated"
  html = html.replace(
    /Last (?:deployed|updated) <span class="num">[^<]+<\/span>/,
    `Last updated <span class="num">${lastUpdatedFormatted}</span>`
  );

  // Update daysAgo reference date
  html = html.replace(
    /const now = new Date\("[^"]+"\)/,
    `const now = new Date("${new Date().toISOString().slice(0, 10)}")`
  );

  // Rebuild filter chips
  const chipsHtml = [
    '      <button class="chip active" data-cat="all">All</button>',
    ...Object.entries(categories).map(([key, label]) =>
      `      <button class="chip" data-cat="${key}">${label}</button>`
    )
  ].join('\n');

  html = html.replace(
    /<div class="filters" id="filters">[\s\S]*?<\/div>\s*\n\s*<div class="toolbar">/,
    `<div class="filters" id="filters">\n${chipsHtml}\n    </div>\n\n    <div class="toolbar">`
  );

  fs.writeFileSync(INDEX_PATH, html, 'utf-8');
  return pages.length;
}


/**
 * Inject OG/social meta tags into each page's <head>.
 * Skips pages that already have og:title.
 */
function injectOGTags(pages) {
  let injected = 0;
  for (const page of pages) {
    const pageIndex = path.join(ROOT, page.slug, 'index.html');
    let html = fs.readFileSync(pageIndex, 'utf-8');
    if (html.includes('og:title')) continue;

    const ogTags = [
      `  <meta property="og:title" content="${escapeAttr(page.title)}">`,
      `  <meta property="og:description" content="${escapeAttr(page.desc.slice(0, 200))}">`,
      `  <meta property="og:type" content="article">`,
      `  <meta property="og:url" content="${SITE_URL}/pages/${page.slug}">`,
      `  <meta name="twitter:card" content="summary">`,
    ].join('\n') + '\n';

    html = html.replace('</head>', ogTags + '</head>');
    fs.writeFileSync(pageIndex, html, 'utf-8');
    injected++;
  }
  return injected;
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generate sitemap.xml at repo root.
 */
function generateSitemap(pages) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: today, priority: '1.0' },
    { loc: `${SITE_URL}/pages`, lastmod: today, priority: '0.8' },
    ...pages.map(p => ({
      loc: `${SITE_URL}/pages/${p.slug}`,
      lastmod: p.updated || p.created,
      priority: '0.6',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(SITEMAP_PATH, xml, 'utf-8');
  return urls.length;
}

// Main
const pages = discoverPages();
const categories = discoverCategories(pages);
const count = injectIntoIndex(pages, categories);
const ogCount = injectOGTags(pages);
const sitemapCount = generateSitemap(pages);
console.log(`✅ Built index with ${count} pages across ${Object.keys(categories).length} categories`);
if (ogCount > 0) console.log(`🔗 Injected OG tags into ${ogCount} pages`);
console.log(`🗺️  Sitemap generated with ${sitemapCount} URLs`);
pages.forEach(p => console.log(`   ${p.slug} → ${p.cat} (created: ${p.created}, updated: ${p.updated})`));

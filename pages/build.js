#!/usr/bin/env node
/**
 * Zosia Pages — Build Script
 * Scans all subdirectories for index.html, extracts metadata,
 * and injects a pages manifest into the main index.html.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const INDEX_PATH = path.join(ROOT, 'index.html');

// Skip these directories
const SKIP = new Set(['.vercel', 'node_modules', '.git']);

// Category mapping: slug patterns → category
// Pages can also use <meta name="x-category" content="..."> to override
const CATEGORY_MAP = {
  // Exact slug matches
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
  return 'openclaw'; // default fallback
}

function extractMeta(html) {
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || 'Untitled';

  // Try <meta name="description">
  let desc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]?.trim();

  // Try <meta name="x-description"> as fallback
  if (!desc) desc = html.match(/<meta\s+name="x-description"\s+content="([^"]*)"/i)?.[1]?.trim();

  // Try first subtitle/tagline element
  if (!desc) desc = html.match(/<p[^>]*class="[^"]*subtitle[^"]*"[^>]*>([^<]+)<\/p>/i)?.[1]?.trim();
  if (!desc) desc = html.match(/<p[^>]*class="[^"]*tagline[^"]*"[^>]*>([^<]+)<\/p>/i)?.[1]?.trim();

  // Fallback: first <p> that's longer than 20 chars
  if (!desc) {
    const paragraphs = html.match(/<p[^>]*>([^<]{20,})<\/p>/gi);
    if (paragraphs?.[0]) {
      desc = paragraphs[0].replace(/<[^>]+>/g, '').trim().slice(0, 200);
    }
  }

  if (!desc) desc = title;

  // Category override via meta tag
  const catOverride = html.match(/<meta\s+name="x-category"\s+content="([^"]*)"/i)?.[1]?.trim();

  // Tags via meta tag
  const tagsRaw = html.match(/<meta\s+name="x-tags"\s+content="([^"]*)"/i)?.[1]?.trim();
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  // Created date via meta tag
  const createdMeta = html.match(/<meta\s+name="x-created"\s+content="([^"]*)"/i)?.[1]?.trim();

  return { title, desc, catOverride, tags, createdMeta };
}

function getFileDate(filePath) {
  const stat = fs.statSync(filePath);
  // Use birthtime if available, otherwise mtime
  const d = stat.birthtime || stat.mtime;
  return d.toISOString().slice(0, 10);
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
    const created = meta.createdMeta || getFileDate(pageIndex);

    pages.push({
      slug,
      title: meta.title,
      desc: meta.desc,
      cat,
      created,
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

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  html = html.replace(
    /Last deployed <span class="num">[^<]+<\/span>/,
    `Last deployed <span class="num">${today}</span>`
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

// Main
const pages = discoverPages();
const categories = discoverCategories(pages);
const count = injectIntoIndex(pages, categories);
console.log(`✅ Built index with ${count} pages across ${Object.keys(categories).length} categories`);
pages.forEach(p => console.log(`   ${p.slug} → ${p.cat} (${p.created})`));

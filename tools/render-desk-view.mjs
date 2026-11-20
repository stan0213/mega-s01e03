// Renders a kb page the way the desk sees it: runbook frame, components run on the data.
// No Svelte build in this export, so this does by hand what the layout and components do,
// with the kb's own logic (causes.ts, problems.ts, desk-ref.ts, staleness.ts).
// Usage: node --import ./tools/lib-alias.mjs tools/render-desk-view.mjs <page.svx> <out.html>
import fs from 'node:fs';
import path from 'node:path';
import { splitTicket } from '#lib/kb/problems';
import { deskRef } from '#lib/kb/desk-ref';
import { daysSince, isoDay, STALE_AFTER_DAYS } from '#lib/kb/staleness';

const [src, out] = process.argv.slice(2);
const root = new URL('../', import.meta.url);
const data = (p) => JSON.parse(fs.readFileSync(new URL(`src/lib/data/${p}`, root), 'utf8'));

const reports = data('reports-4471.json');
const notes = data('desk-notes.json');
const tenantDir = new URL('src/lib/data/tenants/', root);
const tenants = new Map(
  fs.readdirSync(tenantDir).map((f) => {
    const t = JSON.parse(fs.readFileSync(new URL(f, tenantDir), 'utf8'));
    return [t.handle, t];
  }),
);
const tenantOf = (r) => tenants.get(r.tenant);

// Page: frontmatter, script, markdown.
const text = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
const [, fm, rest] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
const meta = Object.fromEntries(
  fm.split('\n').map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^'(.*)'$/, '$1')];
  }),
);
const script = rest.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
const issues = Object.fromEntries([...script.matchAll(/'?([\w-]+)'?: '([^']+)'/g)].map((m) => [m[1], m[2]]));
const body = rest.replace(/<script>[\s\S]*?<\/script>/, '').trim();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

// Components, as the .svelte files render them.
function problemSplit(ticket) {
  const groups = splitTicket(reports, ticket, tenantOf, notes.oneDayMove);
  const total = groups.reduce((n, g) => n + g.reports.length, 0);
  const tags = (g) => Object.entries(g.taggedAs).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ×${n}`).join(' · ');
  const rows = groups
    .map((g) => {
      const link = issues[g.problem];
      const cell = link ? `<a href="${esc(link)}">#${esc(link.split('/').pop())}</a>` : '<span class="none">no ticket</span>';
      return `<tr><td><code>${g.problem}</code></td><td>${g.reports.length}</td><td class="tags">${tags(g)}</td><td>${g.tenants}</td><td>${g.firstSeen} → ${g.lastSeen}</td><td>${cell}</td></tr>`;
    })
    .join('\n');
  return `<p class="sum"><strong>${total}</strong> reports merged into #${ticket} · <strong>${groups.length}</strong> ${groups.length === 1 ? 'problem' : 'problems'}</p>
<table><thead><tr><th>problem</th><th>reports</th><th>tagged as</th><th>tenants</th><th>seen</th><th>ticket</th></tr></thead><tbody>
${rows}
</tbody></table>`;
}
const renderStamp = (signature) =>
  signature
    ? `<p class="stamp">desk ref <b>${deskRef(signature)}</b></p>`
    : '<p class="stamp missing">no desk ref: this page isn\'t signed (no <code>signature</code> in its frontmatter)</p>';

// Markdown blocks.
function block(b) {
  let m;
  if ((m = b.match(/^<ProblemSplit ticket=\{(\d+)\}/))) return problemSplit(Number(m[1]));
  if (/^<RenderStamp \{signature\} \/>$/.test(b)) return renderStamp(meta.signature);
  if ((m = b.match(/^<Callout(?: kind="(\w+)")?>\n([\s\S]*?)\n<\/Callout>$/))) return `<aside class="${m[1] ?? 'note'}"><p>${inline(m[2].replace(/\n/g, ' '))}</p></aside>`;
  if ((m = b.match(/^## (.*)$/))) return `<h2>${inline(m[1])}</h2>`;
  if (b.startsWith('- ')) {
    const items = b.split(/\n(?=- )/).map((i) => `<li>${inline(i.slice(2).replace(/\n\s*/g, ' '))}</li>`);
    return `<ul>\n${items.join('\n')}\n</ul>`;
  }
  return `<p>${inline(b.replace(/\n/g, ' '))}</p>`;
}
const main = body.split(/\n{2,}/).map(block).join('\n');

// The runbook frame (src/lib/layouts/runbook.svelte).
const age = daysSince(meta.reviewed);
const stale = age > STALE_AFTER_DAYS;
const layout = fs.readFileSync(new URL('src/lib/layouts/runbook.svelte', root), 'utf8');
const pageCss = [...fs.readFileSync(new URL('src/lib/kb/ProblemSplit.svelte', root), 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)]
  .concat([...fs.readFileSync(new URL('src/lib/kb/Callout.svelte', root), 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)])
  .concat([...fs.readFileSync(new URL('src/lib/kb/RenderStamp.svelte', root), 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)])
  .map((m) => m[1])
  .join('\n');
const css = (layout.match(/<style>([\s\S]*?)<\/style>/)[1] + pageCss).replace(/:global\(([^)]*)\)/g, '$1');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} · support kb</title>
<style>${css}</style>
</head>
<body>
<div class="kb">
  <header>
    <a class="crumb" href="/kb">support desk · kb</a>
    <h1>${esc(meta.title)}</h1>
    <p class="meta">
      <span>owner <b>${esc(meta.owner)}</b></span>
      <span class="status ${esc(meta.status)}">${esc(meta.status)}</span>
      <span class="${stale ? 'stale' : ''}">reviewed ${isoDay(meta.reviewed)} · ${age} days ago${stale ? ' · stale' : ''}</span>
    </p>
  </header>
  ${stale ? `<p class="banner">Nobody has re-read this page in ${age} days. Check it against the live views before you rely on it.</p>` : ''}
  <main>
${main}
  </main>
  <footer>Pages are written by people. Tables and charts are built from data at render time.</footer>
</div>
</body>
</html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out}`);

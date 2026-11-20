// Writes one issue body per problem in a merged ticket, counts and report ids from the data.
// Usage: node --import ./tools/lib-alias.mjs tools/draft-issues.mjs <out dir>
import fs from 'node:fs';
import path from 'node:path';
import { splitTicket } from '#lib/kb/problems';

const out = process.argv[2];
const root = new URL('../', import.meta.url);
const data = (p) => JSON.parse(fs.readFileSync(new URL(`src/lib/data/${p}`, root), 'utf8'));
const tenantDir = new URL('src/lib/data/tenants/', root);
const tenants = new Map(fs.readdirSync(tenantDir).map((f) => { const t = JSON.parse(fs.readFileSync(new URL(f, tenantDir), 'utf8')); return [t.handle, t]; }));

const TEXT = {
  parser: {
    title: 'parser reads day-first dates month first',
    what: 'Every tenant on file writes the day first. The shared parser reads every date month first, so day and month swap: a booking for 7 April comes out on 4 July. This is the bug #4471 names, and the queued fix is for it.',
    how: 'Reports from day-first tenants by app and email, and by form on booking-v2 (`causeOf` → `parser` in `src/lib/kb/causes.ts`).',
  },
  hint: {
    title: 'booking-v3 date hint says MM/DD/YYYY to day-first tenants',
    what: 'The booking-v3 form prints `MM/DD/YYYY` under its date field. People type what the hint tells them, month first, and the form reads it the tenant\'s way, day first. The parser fix does not fix this: the hint has to change.',
    how: 'Reports by form from day-first tenants that run booking-v3 (`causeOf` → `hint` in `src/lib/kb/causes.ts`).',
  },
  'one-day-move': {
    title: 'dates move by one day (time zone), not month for day',
    what: 'The date moves by one day, not month for day. "Invite says Tuesday 12 May. Calendar says Monday 11 May." One meeting showed Tuesday to a client in Lisbon and Monday to a client in Toronto. That points at time zones, not at the parser.',
    how: 'The reports the desk listed as one-day moves in `src/lib/data/desk-notes.json` (`oneDayMove`). The desk filed them under `parser` by tenant.',
  },
};

const groups = splitTicket(data('reports-4471.json'), 4471, (r) => tenants.get(r.tenant), data('desk-notes.json').oneDayMove);
fs.mkdirSync(out, { recursive: true });
for (const g of groups) {
  const t = TEXT[g.problem];
  const ids = g.reports.map((r) => r.id).sort();
  const tenantList = [...new Set(g.reports.map((r) => r.tenant))].sort().join(', ');
  const tags = Object.entries(g.taggedAs).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(' · ');
  const body = `**Covers ${g.reports.length} reports** from #4471 (support desk). Split out of #4471, which was merged as one issue.

## What happens

${t.what}

## Which reports

${t.how}

- reports: **${g.reports.length}**
- tenants: ${g.tenants} (${tenantList})
- seen: ${g.firstSeen} → ${g.lastSeen}
- intake tagged them as: ${tags}

Counted from \`src/lib/data/reports-4471.json\`, one report per id, by \`splitTicket\` in \`src/lib/kb/problems.ts\`. The kb page: \`src/routes/kb/incidents/4471-split/+page.svx\`.

<details><summary>The ${g.reports.length} report ids</summary>

${ids.join(', ')}

</details>
`;
  fs.writeFileSync(path.join(out, `${g.problem}.md`), body);
  fs.writeFileSync(path.join(out, `${g.problem}.title.txt`), `${t.title} — ${g.reports.length} reports
`);
  console.log(g.problem, g.reports.length, t.title);
}

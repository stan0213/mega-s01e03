// Report ids per cause as the desk's own view counts them (CauseTable: causes.ts, one-day moves filed by tenant).
// Usage: node --import ./tools/lib-alias.mjs tools/desk-view-ids.mjs <cause>
import fs from 'node:fs';
import { groupByCause, uniqueById } from '#lib/kb/causes';

const root = new URL('../', import.meta.url);
const reports = JSON.parse(fs.readFileSync(new URL('src/lib/data/reports-4471.json', root), 'utf8'));
const tenantDir = new URL('src/lib/data/tenants/', root);
const tenants = new Map(fs.readdirSync(tenantDir).map((f) => { const t = JSON.parse(fs.readFileSync(new URL(f, tenantDir), 'utf8')); return [t.handle, t]; }));
const merged = uniqueById(reports).filter((r) => r.mergedInto === 4471);
const g = groupByCause(merged, (r) => tenants.get(r.tenant)).find((g) => g.cause === process.argv[2]);
console.log(JSON.stringify({ n: g.reports.length, tenants: g.tenants, firstSeen: g.firstSeen, lastSeen: g.lastSeen, taggedAs: g.taggedAs, ids: g.reports.map((r) => r.id).sort() }));

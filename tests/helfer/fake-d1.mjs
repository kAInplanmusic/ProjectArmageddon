/** D1-Hülle über node:sqlite: gleiche Aufrufform wie die Cloudflare-Bindung (`prepare().bind().first()/run()`, `meta.changes`). */
import { DatabaseSync } from 'node:sqlite';

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const h = {
        bind(...a) { args = a; return h; },
        async first() { return stmt.get(...args) ?? null; },
        async run() { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; },
      };
      return h;
    },
  };
}

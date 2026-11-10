/**
 * Hetzner-Fake für die Betriebs-Tests (tests/betrieb-abruf.test.js).
 * Ein lokaler HTTP-Server, der die Teile der Cloud-API spricht, die
 * selbst-abbild-loeschen.sh und server-hochfahren.sh brauchen. Über
 * `PA_HCLOUD_API` zeigen die Skripte darauf statt auf api.hetzner.cloud.
 *
 * Verhalten des Abbilds: `abbild: 'ok'` (nach `pollBisFertig` Abfragen available),
 * `'haengt'` (bleibt creating), `'leer'` (available, aber image_size 0).
 */
import { createServer } from 'node:http';

export const TEST_TOKEN = 'TESTTOKEN-nicht-echt-0123456789';

export function starteMock({ abbild = 'ok', pollBisFertig = 1, serverLabels = { 'projectarmageddon-server': 'ja' }, serverId = 4242 } = {}) {
  const zustand = {
    log: [], // { methode, pfad, auth, body }
    servers: [{ id: serverId, name: 'pa-spiel', status: 'running', created: '2026-11-10T10:00:00+00:00', labels: { ...serverLabels },
      server_type: { name: 'cpx22', prices: [{ location: 'fsn1', price_hourly: { gross: '0.0371' } }] }, location: { name: 'fsn1' }, public_net: { ipv4: { ip: '203.0.113.7' } } }],
    images: [], primary_ips: [], ssh_keys: [], naechsteId: 9000, abbild, pollBisFertig,
    typen: [
      { name: 'cx23', architecture: 'x86', cpu_type: 'shared', cores: 2, memory: 4, disk: 40, locations: [{ name: 'fsn1', available: false, deprecation: null }, { name: 'nbg1', available: false, deprecation: null }],
        prices: [{ location: 'fsn1', price_hourly: { gross: '0.0105' }, price_monthly: { gross: '6.53' } }, { location: 'nbg1', price_hourly: { gross: '0.0105' }, price_monthly: { gross: '6.53' } }] },
      { name: 'cpx22', architecture: 'x86', cpu_type: 'shared', cores: 2, memory: 4, disk: 80, locations: [{ name: 'fsn1', available: true, deprecation: null }, { name: 'nbg1', available: true, deprecation: null }],
        prices: [{ location: 'fsn1', price_hourly: { gross: '0.0371' }, price_monthly: { gross: '23.19' } }, { location: 'nbg1', price_hourly: { gross: '0.0371' }, price_monthly: { gross: '23.19' } }] },
      { name: 'cpx32', architecture: 'x86', cpu_type: 'shared', cores: 4, memory: 8, disk: 160, locations: [{ name: 'fsn1', available: true, deprecation: null }],
        prices: [{ location: 'fsn1', price_hourly: { gross: '0.0600' }, price_monthly: { gross: '37.00' } }] },
      { name: 'ccx13', architecture: 'x86', cpu_type: 'dedicated', cores: 2, memory: 8, disk: 80, locations: [{ name: 'fsn1', available: true, deprecation: null }],
        prices: [{ location: 'fsn1', price_hourly: { gross: '0.0200' }, price_monthly: { gross: '12.00' } }] },
    ],
  };
  const sel = url => { const s = url.searchParams.get('label_selector'); if (!s) return () => true; const [k, v] = s.split('='); return x => (x.labels || {})[k] === v; };
  const liste = (res, schluessel, items) => json(res, 200, { [schluessel]: items, meta: { pagination: { page: 1, next_page: null, total_entries: items.length } } });
  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let roh = '';
    req.on('data', c => { roh += c; });
    req.on('end', () => {
      let body = null;
      try { body = roh ? JSON.parse(roh) : null; } catch { /* kein JSON */ }
      const pfad = url.pathname;
      zustand.log.push({ methode: req.method, pfad, auth: req.headers.authorization ?? null, body, url: req.url });
      if (pfad === '/instance-id') { res.writeHead(200); return res.end(String(serverId)); }
      if (req.headers.authorization !== `Bearer ${TEST_TOKEN}`) return json(res, 401, { error: { code: 'unauthorized', message: 'nope' } });
      const m = (re) => pfad.match(re);
      let t;
      if (req.method === 'GET' && pfad === '/servers') return liste(res, 'servers', zustand.servers.filter(sel(url)));
      if ((t = m(/^\/servers\/(\d+)$/))) {
        const s = zustand.servers.find(x => String(x.id) === t[1]);
        if (!s) return json(res, 404, { error: { code: 'not_found', message: 'server' } });
        if (req.method === 'GET') return json(res, 200, { server: s });
        if (req.method === 'PUT') { s.labels = body.labels; return json(res, 200, { server: s }); }
        if (req.method === 'DELETE') { zustand.servers = zustand.servers.filter(x => x !== s); return json(res, 200, { action: { id: 1 } }); }
      }
      if ((t = m(/^\/servers\/(\d+)\/actions\/(\w+)$/)) && req.method === 'POST') {
        const s = zustand.servers.find(x => String(x.id) === t[1]);
        if (!s) return json(res, 404, { error: { code: 'not_found', message: 'server' } });
        if (t[2] === 'shutdown' || t[2] === 'poweroff') { s.status = 'off'; return json(res, 201, { action: { id: 2 } }); }
        if (t[2] === 'create_image') {
          const id = zustand.naechsteId++;
          const k = zustand.abbild === 'leer' ? 0 : 1.5;
          const img = { id, type: 'snapshot', status: 'creating', created: new Date(Date.now() + id).toISOString(), description: body.description, labels: body.labels ?? {}, image_size: null, disk_size: 80, created_from: { id: s.id, name: s.name }, _polls: 0, _k: k };
          zustand.images.push(img);
          return json(res, 201, { image: img, action: { id: 3 } });
        }
      }
      if (req.method === 'GET' && pfad === '/images') return liste(res, 'images', zustand.images.filter(sel(url)).filter(i => !url.searchParams.get('type') || i.type === url.searchParams.get('type')));
      if ((t = m(/^\/images\/(\d+)$/))) {
        const i = zustand.images.find(x => String(x.id) === t[1]);
        if (!i) return json(res, 404, { error: { code: 'not_found', message: 'image' } });
        if (req.method === 'DELETE') { zustand.images = zustand.images.filter(x => x !== i); return json(res, 204 === 0 ? 204 : 200, {}); }
        if (req.method === 'GET') {
          i._polls++;
          if (zustand.abbild !== 'haengt' && i._polls >= zustand.pollBisFertig && i.status === 'creating') { i.status = 'available'; i.image_size = i._k; }
          return json(res, 200, { image: i });
        }
      }
      if (req.method === 'GET' && pfad === '/primary_ips') return liste(res, 'primary_ips', zustand.primary_ips.filter(sel(url)));
      if (req.method === 'POST' && pfad === '/primary_ips') {
        const ip = { id: zustand.naechsteId++, type: 'ipv4', ip: '198.51.100.23', location: { name: body.location }, assignee_id: null, auto_delete: body.auto_delete, labels: body.labels };
        zustand.primary_ips.push(ip); return json(res, 201, { primary_ip: ip });
      }
      if (req.method === 'GET' && pfad === '/server_types') return liste(res, 'server_types', zustand.typen);
      if (req.method === 'GET' && pfad === '/ssh_keys') return liste(res, 'ssh_keys', zustand.ssh_keys);
      if (req.method === 'POST' && pfad === '/ssh_keys') { const k = { id: zustand.naechsteId++, public_key: body.public_key }; zustand.ssh_keys.push(k); return json(res, 201, { ssh_key: k }); }
      if (req.method === 'GET' && pfad === '/volumes') return liste(res, 'volumes', []);
      if (req.method === 'POST' && pfad === '/servers') {
        const s = { id: zustand.naechsteId++, name: body.name, status: 'running', created: new Date().toISOString(), labels: body.labels, server_type: { name: body.server_type, prices: [] }, location: { name: body.location }, public_net: { ipv4: { ip: '198.51.100.23' } }, _body: body };
        zustand.servers.push(s); return json(res, 201, { server: s });
      }
      return json(res, 404, { error: { code: 'not_found', message: `${req.method} ${pfad}` } });
    });
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => {
    const basis = `http://127.0.0.1:${server.address().port}`;
    ok({ zustand, api: basis, metadata: `${basis}/instance-id`, schliessen: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }) });
  }));
}

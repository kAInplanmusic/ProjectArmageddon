// Netlify-Funktion: Login, Status, Start. Logik in scripts/betrieb/web/gateway-kern.mjs.
import { behandle } from '../../scripts/betrieb/web/gateway-kern.mjs';

export default async req => behandle(req, {
  // Not-aus dauert Minuten: eine Hintergrundfunktion (bis 15 min) übernimmt, sie prüft die Sitzung selbst.
  notAusStarten: r => fetch(new URL('/.netlify/functions/not-aus-background', r.url), {
    method: 'POST', headers: { cookie: r.headers.get('cookie') ?? '', origin: r.headers.get('origin') ?? '', 'x-pa-web': '1' },
  }),
});
export const config = { path: '/api/web/*' };

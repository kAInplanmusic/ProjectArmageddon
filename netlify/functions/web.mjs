// Netlify-Funktion: Konten, Spieltoken, Statistik, Status, Start. Logik in scripts/betrieb/web/gateway-kern.mjs.
import { behandle } from '../../scripts/betrieb/web/gateway-kern.mjs';

export default async req => behandle(req, {
  // Not-aus dauert Minuten: eine Hintergrundfunktion (bis 15 min) übernimmt; der Auftrag ist signiert und kurzlebig.
  notAusStarten: (r, auftrag) => fetch(new URL('/.netlify/functions/not-aus-background', r.url), {
    method: 'POST', headers: { 'x-pa-auftrag': auftrag },
  }),
});
export const config = { path: '/api/web/*' };

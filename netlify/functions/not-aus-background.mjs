// Netlify-Hintergrundfunktion (Namensendung -background: antwortet sofort 202, läuft bis 15 min).
import { notAusAuftrag } from '../../scripts/betrieb/web/gateway-kern.mjs';

export default async req => notAusAuftrag(req);

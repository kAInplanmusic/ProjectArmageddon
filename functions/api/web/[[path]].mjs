// Cloudflare Pages Function für /api/web/*: Konten, Spieltoken, Statistik, Status, Start, Not-aus.
// Die Logik steht in scripts/betrieb/web/ (docs/zugang-www.md); hier wird nur verdrahtet.
import { bearbeite } from '../../../scripts/betrieb/web/cloudflare-einstieg.mjs';

export const onRequest = ctx => bearbeite(ctx.request, ctx.env, ctx);

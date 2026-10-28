// Schreibt docs/terrain-matrix.md aus dem Stoffkatalog (Eigenschaften und Waffen-zu-Gelände-Matrix).
import { writeFileSync } from 'node:fs';
import { matrixAlsMarkdown } from '../src/shared/materialMatrix.js';

const text = `# Gelände-Matrix: Eigenschaften und Schadensarten

Erzeugt aus \`src/shared/config/stoffe.js\` über \`src/shared/materialMatrix.js\` (\`node scripts/terrain-matrix-schreiben.mjs\`).
Reine Lesesicht, keine Spielregel.

**Drei Eigenschaften je Boden**

- **Härte:** weich, normal, hart, sehr_hart, unzerstoerbar — bestimmt Größe und Tiefe des Kraters.
- **Haftung:** rutschig, glatt, normal, griffig — aus dem Reibungsfaktor (Eis rutscht, Sand und Asche greifen).
- **Nachgiebigkeit:** fest, weich, tief, traegt nicht — aus Bremswirkung und Tragfähigkeit (Magma und Dampf tragen nicht).

**Matrix:** Die Zahlen sind der Radiusfaktor auf den Krater (1 = Erde mit Wucht). Spalten sind die Wirkgruppen der Schadensart:
Wucht (Standard), Hitze (Feuer, Drache, Energie, Plasma), Kälte (Eis), Ätz (Säure, Gift), Strom (Elektro, Magnet), Nass (Wasser).
0 heißt unzerstörbar.

${matrixAlsMarkdown()}
`;
writeFileSync(new URL('../docs/terrain-matrix.md', import.meta.url), text);
console.log('docs/terrain-matrix.md geschrieben');

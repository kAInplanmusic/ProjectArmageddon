import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Sicherung vor dem Abschalten (`scripts/betrieb/snapshot.sh`).
 * Läuft ohne Netz und ohne Hetzner: die `hcloud`-CLI ist ein Platzhalter-Skript,
 * das nur protokolliert.
 */
const SKRIPT = join(process.cwd(), 'scripts/betrieb/snapshot.sh');

function umgebung() {
  const wurzel = mkdtempSync(join(tmpdir(), 'pa-snap-'));
  const zustand = join(wurzel, 'zustand');
  mkdirSync(zustand, { recursive: true });
  writeFileSync(join(zustand, 'lobbies.json'), '{"lobbies":["wichtig"]}');
  const envDatei = join(wurzel, 'betrieb.env');
  writeFileSync(envDatei, 'PORT=3000\nHCLOUD_TOKEN=streng-geheim\nSERVER_API_KEY = auch-geheim\n');
  return { wurzel, zustand, envDatei, snapshots: join(zustand, 'snapshots') };
}

function lauf(env, args = [], extra = {}) {
  return spawnSync('bash', [SKRIPT, ...args], {
    env: {
      PATH: process.env.PATH,
      PA_STATE_DIR: env.zustand,
      PA_SNAPSHOT_ENV_DATEI: env.envDatei,
      PA_SYSTEMD_UNIT: 'gibt-es-nicht.service',
      ...extra,
    },
    encoding: 'utf8',
  });
}

const archive = verz => readdirSync(verz).filter(n => /^pa-snapshot-.*\.tar\.gz$/.test(n)).sort();

function inhalt(archivPfad, datei) {
  return spawnSync('tar', ['-xzOf', archivPfad, datei], { encoding: 'utf8' }).stdout;
}

test('Archiv enthält Zustand, Manifest und geschwärzte Zugangsdaten', () => {
  const env = umgebung();
  try {
    const r = lauf(env, ['--grund', 'Test']);
    assert.equal(r.status, 0, r.stderr);
    const [datei] = archive(env.snapshots);
    assert.ok(datei, 'ein Archiv liegt vor');
    const pfad = join(env.snapshots, datei);
    assert.ok(existsSync(`${pfad}.sha256`), 'Prüfsumme liegt daneben');
    assert.match(inhalt(pfad, './state/lobbies.json'), /wichtig/);
    const manifest = JSON.parse(inhalt(pfad, './manifest.json'));
    assert.equal(manifest.grund, 'Test');
    assert.match(manifest.gitHash, /^[0-9a-f]{40}$/);
    const geschwaerzt = inhalt(pfad, './config/betrieb.env.geschwaerzt');
    assert.match(geschwaerzt, /PORT=3000/);
    assert.doesNotMatch(geschwaerzt, /streng-geheim|auch-geheim/, 'keine Zugangsdaten im Archiv');
    // Das Archiv enthält sich nicht selbst (keine Snapshots im Snapshot).
    const liste = spawnSync('tar', ['-tzf', pfad], { encoding: 'utf8' }).stdout;
    assert.doesNotMatch(liste, /snapshots\//);
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

test('Es bleiben nur die neuesten N; die ältesten werden gelöscht', { timeout: 60_000 }, () => {
  const env = umgebung();
  try {
    mkdirSync(env.snapshots, { recursive: true });
    // Fünf ältere Snapshots, die Namen tragen die Zeit.
    const alt = ['20250101T000000Z', '20250102T000000Z', '20250103T000000Z', '20250104T000000Z', '20250105T000000Z'];
    for (const zeit of alt) {
      writeFileSync(join(env.snapshots, `pa-snapshot-${zeit}.tar.gz`), 'alt');
      writeFileSync(join(env.snapshots, `pa-snapshot-${zeit}.tar.gz.sha256`), 'x');
    }
    writeFileSync(join(env.snapshots, 'fremde-datei.txt'), 'bleibt');
    const r = lauf(env, [], { PA_SNAPSHOT_KEEP: '3' });
    assert.equal(r.status, 0, r.stderr);
    const uebrig = archive(env.snapshots);
    assert.equal(uebrig.length, 3, uebrig.join(', '));
    assert.ok(uebrig.includes('pa-snapshot-20250105T000000Z.tar.gz'), 'die zweitneueste bleibt');
    assert.ok(uebrig.includes('pa-snapshot-20250104T000000Z.tar.gz'));
    assert.ok(!uebrig.includes('pa-snapshot-20250101T000000Z.tar.gz'), 'die älteste ist weg');
    assert.ok(!existsSync(join(env.snapshots, 'pa-snapshot-20250101T000000Z.tar.gz.sha256')), 'Prüfsumme mit gelöscht');
    assert.ok(existsSync(join(env.snapshots, 'fremde-datei.txt')), 'fremde Dateien bleiben unberührt');
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

test('Ein ungültiges PA_SNAPSHOT_KEEP löscht NICHTS', () => {
  const env = umgebung();
  try {
    mkdirSync(env.snapshots, { recursive: true });
    writeFileSync(join(env.snapshots, 'pa-snapshot-20250101T000000Z.tar.gz'), 'alt');
    for (const falsch of ['0', '-1', 'abc', '99']) {
      const r = lauf(env, [], { PA_SNAPSHOT_KEEP: falsch });
      assert.notEqual(r.status, 0, `KEEP='${falsch}' muss abgelehnt werden`);
    }
    assert.equal(archive(env.snapshots).length, 1, 'der alte Snapshot ist noch da');
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

test('Zu wenig freier Platz: Abbruch, alte Snapshots bleiben', () => {
  const env = umgebung();
  try {
    mkdirSync(env.snapshots, { recursive: true });
    writeFileSync(join(env.snapshots, 'pa-snapshot-20250101T000000Z.tar.gz'), 'alt');
    const r = lauf(env, [], { PA_SNAPSHOT_MIN_FREI_MB: '999999999' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /frei/);
    assert.equal(archive(env.snapshots).length, 1);
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

test('Trockenlauf schreibt und löscht nichts', () => {
  const env = umgebung();
  try {
    mkdirSync(env.snapshots, { recursive: true });
    for (let i = 1; i <= 5; i++) writeFileSync(join(env.snapshots, `pa-snapshot-2025010${i}T000000Z.tar.gz`), 'alt');
    const r = lauf(env, ['--trocken'], { PA_SNAPSHOT_KEEP: '2' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(archive(env.snapshots).length, 5);
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

/** Platzhalter für `hcloud`: protokolliert die Aufrufe, kennt drei vorhandene Abbilder. */
function hcloudPlatzhalter(wurzel, { erstellenSchlaegtFehl = false } = {}) {
  const bin = join(wurzel, 'bin');
  mkdirSync(bin, { recursive: true });
  const logDatei = join(wurzel, 'hcloud.log');
  writeFileSync(join(bin, 'hcloud'), `#!/usr/bin/env bash
echo "$@" >> "${logDatei}"
case "$1 $2" in
  "server create-image") ${erstellenSchlaegtFehl ? 'exit 1' : 'exit 0'} ;;
  "image list") printf '101\\n103\\n102\\n104\\n105\\n' ; exit 0 ;;
  "image delete") exit 0 ;;
esac
exit 0
`);
  chmodSync(join(bin, 'hcloud'), 0o755);
  return { bin, logDatei };
}

test('Cloud-Abbild: erstellt, dann nur die ältesten über N gelöscht (nach ID)', () => {
  const env = umgebung();
  try {
    const { bin, logDatei } = hcloudPlatzhalter(env.wurzel);
    const r = lauf(env, ['--nur-cloud', '--grund', 'Test'], {
      PATH: `${bin}:${process.env.PATH}`,
      HCLOUD_TOKEN: 'streng-geheim',
      PA_HCLOUD_SERVER: 'spiel-1',
      PA_SNAPSHOT_KEEP: '3',
    });
    assert.equal(r.status, 0, r.stderr);
    const log = readFileSync(logDatei, 'utf8').trim().split('\n');
    assert.match(log[0], /^server create-image --type snapshot .*spiel-1$/);
    const geloescht = log.filter(z => z.startsWith('image delete')).map(z => z.split(' ')[2]).sort();
    assert.deepEqual(geloescht, ['101', '102'], 'bei 5 Abbildern und N=3 fallen die zwei mit den kleinsten IDs weg');
    assert.doesNotMatch(r.stderr + r.stdout, /streng-geheim/, 'das Token wird nie ausgegeben');
    assert.equal(archive(env.snapshots).length, 0, '--nur-cloud schreibt kein Archiv');
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

test('Cloud-Abbild schlägt fehl: es wird NICHTS gelöscht', () => {
  const env = umgebung();
  try {
    const { bin, logDatei } = hcloudPlatzhalter(env.wurzel, { erstellenSchlaegtFehl: true });
    const r = lauf(env, ['--nur-cloud'], {
      PATH: `${bin}:${process.env.PATH}`,
      HCLOUD_TOKEN: 't',
      PA_HCLOUD_SERVER: 'spiel-1',
      PA_SNAPSHOT_KEEP: '1',
    });
    assert.notEqual(r.status, 0);
    const log = readFileSync(logDatei, 'utf8');
    assert.doesNotMatch(log, /image delete/, 'nach einem Fehlschlag kein Löschen');
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

test('Cloud-Abbild ohne Token oder Servernamen: Fehler, nichts gelöscht', () => {
  const env = umgebung();
  try {
    const { bin, logDatei } = hcloudPlatzhalter(env.wurzel);
    const ohneToken = lauf(env, ['--nur-cloud'], { PATH: `${bin}:${process.env.PATH}`, PA_HCLOUD_SERVER: 's' });
    assert.notEqual(ohneToken.status, 0);
    const ohneServer = lauf(env, ['--nur-cloud'], { PATH: `${bin}:${process.env.PATH}`, HCLOUD_TOKEN: 't' });
    assert.notEqual(ohneServer.status, 0);
    assert.ok(!existsSync(logDatei), 'hcloud wurde gar nicht aufgerufen');
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

test('Idle-Bremse: Cloud-Abbild läuft VOR dem Abschalten, ein Fehlschlag hält das Abschalten nicht auf', () => {
  for (const schlaegtFehl of [false, true]) {
    const env = umgebung();
    try {
      const bin = join(env.wurzel, 'bin');
      mkdirSync(bin, { recursive: true });
      const ablauf = join(env.wurzel, 'ablauf.log');
      // Platzhalter: systemctl schaltet NICHTS ab, es protokolliert nur.
      writeFileSync(join(bin, 'systemctl'), `#!/usr/bin/env bash
case "$1" in
  is-active) exit 1 ;;
  poweroff) echo "ABSCHALTEN" >> "${ablauf}" ;;
esac
exit 0
`);
      chmodSync(join(bin, 'systemctl'), 0o755);
      const snapshot = join(env.wurzel, 'snapshot-platzhalter.sh');
      writeFileSync(snapshot, `#!/usr/bin/env bash
echo "SNAPSHOT $*" >> "${ablauf}"
${schlaegtFehl ? 'exit 1' : 'exit 0'}
`);
      chmodSync(snapshot, 0o755);
      writeFileSync(join(env.wurzel, 'ist-gemietet'), '');
      const r = spawnSync('bash', [join(process.cwd(), 'scripts/betrieb/idle-watch.sh'), '--once'], {
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          PA_STATE_DIR: join(env.wurzel, 'idle'),
          PA_ARMED_FILE: join(env.wurzel, 'ist-gemietet'),
          PA_IDLE_MINUTES: '0',
          PA_GRACE_MINUTES: '0',
          PA_PORT: '1',
          PA_HEALTH_URL: 'http://127.0.0.1:1/healthz',
          PA_BREMSE_DATEI: join(env.wurzel, 'bremse'),
          PA_ACTION: 'poweroff',
          PA_POWEROFF_CONFIRM: 'yes',
          PA_POWEROFF_DELAY_SECONDS: '0',
          PA_SNAPSHOT_CLOUD: 'yes',
          PA_SNAPSHOT_SKRIPT: snapshot,
        },
        encoding: 'utf8',
      });
      const zeilen = readFileSync(ablauf, 'utf8').trim().split('\n');
      assert.match(zeilen[0], /^SNAPSHOT --nur-cloud --grund Idle-Bremse/, `${r.stderr}`);
      assert.equal(zeilen[1], 'ABSCHALTEN', 'abgeschaltet wird erst NACH dem Abbild — und auch nach einem Fehlschlag');
    } finally {
      rmSync(env.wurzel, { recursive: true, force: true });
    }
  }
});

// ------------------------------------------------------------ Einrichtung auf dem Knoten

const EINRICHTEN = join(process.cwd(), 'scripts/betrieb/snapshot-einrichten.sh');

function einrichten(env, args, extra = {}, { listeFehler = false } = {}) {
  const bin = join(env.wurzel, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'hcloud'), `#!/usr/bin/env bash
if [ "$1 $2" = "server list" ]; then ${listeFehler ? 'exit 1' : 'printf "spiel-1\\nanderer\\n"; exit 0'}; fi
exit 0
`);
  chmodSync(join(bin, 'hcloud'), 0o755);
  const etc = join(env.wurzel, 'etc');
  const r = spawnSync('bash', [EINRICHTEN, ...args], {
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      PA_ETC: etc,
      PA_SNAPSHOT_DIR: env.snapshots,
      PA_STATE_DIR: env.zustand,
      PA_SYSTEMD_UNIT: 'gibt-es-nicht.service',
      ...extra,
    },
    encoding: 'utf8',
    stdin: 'ignore',
  });
  return { r, etc, datei: join(etc, 'betrieb.env') };
}

test('Einrichtung ohne Cloud: Archiv-Ebene eingetragen, Cloud aus, Rechte 600', () => {
  const env = umgebung();
  try {
    const { r, datei } = einrichten(env, []);
    assert.equal(r.status, 0, r.stderr);
    const inhalt = readFileSync(datei, 'utf8');
    assert.match(inhalt, /^PA_SNAPSHOT_KEEP=3$/m);
    assert.match(inhalt, /^PA_SNAPSHOT_CLOUD=no$/m);
    assert.equal(statSync(datei).mode & 0o777, 0o600);
    assert.equal(archive(env.snapshots).length, 0, 'ohne --erstes-abbild wird nichts erzeugt');
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

test('Einrichtung mit Cloud: Token geprüft und NUR in der Datei, zweiter Lauf ohne Doppelzeilen', () => {
  const env = umgebung();
  try {
    const extra = { HCLOUD_TOKEN: 'sehr$geheim"token', PA_HCLOUD_SERVER: 'spiel-1' };
    const { r, datei } = einrichten(env, ['--cloud'], extra);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr + r.stdout, /sehr\$geheim/, 'das Token wird nie ausgegeben');
    let inhalt = readFileSync(datei, 'utf8');
    assert.match(inhalt, /^PA_SNAPSHOT_CLOUD=yes$/m);
    assert.match(inhalt, /^PA_HCLOUD_SERVER=spiel-1$/m);
    assert.ok(inhalt.includes('HCLOUD_TOKEN=sehr$geheim"token'), 'Sonderzeichen bleiben unversehrt');
    assert.equal(statSync(datei).mode & 0o777, 0o600);

    const zweiter = einrichten(env, ['--cloud'], extra);
    assert.equal(zweiter.r.status, 0, zweiter.r.stderr);
    inhalt = readFileSync(datei, 'utf8');
    assert.equal(inhalt.split('\n').filter(z => z.startsWith('PA_SNAPSHOT_KEEP=')).length, 1);
    assert.equal(inhalt.split('\n').filter(z => z.startsWith('HCLOUD_TOKEN=')).length, 1);
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

test('Einrichtung: falscher Servername oder abgelehntes Token -> nichts gespeichert', () => {
  const env = umgebung();
  try {
    const falscherName = einrichten(env, ['--cloud'], { HCLOUD_TOKEN: 'tok', PA_HCLOUD_SERVER: 'gibt-es-nicht' });
    assert.notEqual(falscherName.r.status, 0);
    assert.match(falscherName.r.stderr, /spiel-1/, 'die vorhandenen Server werden genannt');
    assert.doesNotMatch(readFileSync(falscherName.datei, 'utf8'), /HCLOUD_TOKEN/);

    const abgelehnt = einrichten(env, ['--cloud'], { HCLOUD_TOKEN: 'tok', PA_HCLOUD_SERVER: 'spiel-1' }, { listeFehler: true });
    assert.notEqual(abgelehnt.r.status, 0);
    assert.doesNotMatch(readFileSync(abgelehnt.datei, 'utf8'), /HCLOUD_TOKEN/);
  } finally {
    rmSync(env.wurzel, { recursive: true, force: true });
  }
});

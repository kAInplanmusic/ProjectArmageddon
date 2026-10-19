"""Stufe 2: Bild-zu-Bild mit Maßprompts (massprompts.py), höchstens 4 Aufrufe parallel.

Aufruf:  python3 scripts/seitenansichten/kontext2.py [--max] --versuch N SCHLUESSEL [...]

Modell standardmäßig black-forest-labs/FLUX.1-kontext-pro (0,04 USD je Bild),
mit --max black-forest-labs/FLUX.1-kontext-max (0,08 USD je Bild, vorsichtig
angesetzt). Referenz ist ausschließlich das 256-px-Porträt der Figur
(`src/client/assets/characters/<fraktion>/NN_name.png`, auf Weiß gelegt und auf
512 px gebracht); nichts anderes wird gesendet. Rohbilder: $PA_SEITE_ARBEIT/roh/kontext/
`<fraktion>__<NN_name>.png__vN.png` (v4 und höher gehören zu Stufe 2). Kosten
im selben `kosten.jsonl` (Stufe "kontext2"). Harte Obergrenze: 5,0 USD in
dieser Stufe, 10,2 USD insgesamt. Schlüssel nur aus der Umgebung
(`TOGETHER_API_KEY` oder Datei in `PA_TOGETHER_ENV`), wird nie ausgegeben.
"""
import base64, io, json, os, sys, threading, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from massprompts import prompt, MASS

if "TOGETHER_API_KEY" not in os.environ and os.environ.get("PA_TOGETHER_ENV"):
    for zeile in Path(os.environ["PA_TOGETHER_ENV"]).read_text().splitlines():
        if zeile.startswith("TOGETHER_API_KEY="):
            os.environ["TOGETHER_API_KEY"] = zeile.split("=", 1)[1].strip().strip("\"'")

WURZEL = Path(__file__).resolve().parents[2]
PORTRAET = WURZEL / "src/client/assets/characters"
ARBEIT = Path(os.environ.get("PA_SEITE_ARBEIT", "arbeit-seitenansichten"))
PRO = ("black-forest-labs/FLUX.1-kontext-pro", 0.04)
MAX = ("black-forest-labs/FLUX.1-kontext-max", 0.08)
STUFE = "kontext2"
OBERGRENZE_STUFE_USD = 5.0
OBERGRENZE_GESAMT_USD = 10.2  # 4,89 USD Vorstufen + 5,0 USD diese Stufe, aufgerundet
SCHLOSS = threading.Lock()


def referenz(schluessel: str) -> str:
    p = Image.open(PORTRAET / schluessel).convert("RGBA").resize((512, 512), Image.LANCZOS)
    flaeche = Image.new("RGB", p.size, (255, 255, 255))
    flaeche.paste(p, (0, 0), p)
    puffer = io.BytesIO()
    flaeche.save(puffer, "PNG")
    return "data:image/png;base64," + base64.b64encode(puffer.getvalue()).decode()


def kosten() -> tuple[float, float]:
    log = ARBEIT / "kosten.jsonl"
    gesamt = stufe = 0.0
    for z in log.read_text().splitlines() if log.exists() else []:
        if z.strip():
            e = json.loads(z)
            gesamt += e["usd"]
            if e.get("stufe") == STUFE:
                stufe += e["usd"]
    return gesamt, stufe


def reservieren(modell: str, preis: float, schluessel: str, v: int, extra: dict) -> bool:
    """Bucht den Aufruf vorab (konservativ) unter Schloss; False bei Überschreitung der Obergrenze."""
    with SCHLOSS:
        gesamt, stufe = kosten()
        if stufe + preis > OBERGRENZE_STUFE_USD or gesamt + preis > OBERGRENZE_GESAMT_USD:
            return False
        with open(ARBEIT / "kosten.jsonl", "a") as f:
            f.write(json.dumps({"modell": modell, "k": schluessel, "v": v, "usd": preis, "stufe": STUFE,
                                "t": time.time(), **extra}) + "\n")
        return True


def erstatten(modell: str, preis: float, schluessel: str, v: int, grund: str) -> None:
    """Fehler vor Bearbeitung (HTTP 4xx/5xx ohne Ergebnis): Gegenbuchung, weil nichts berechnet wurde."""
    with SCHLOSS, open(ARBEIT / "kosten.jsonl", "a") as f:
        f.write(json.dumps({"modell": modell, "k": schluessel, "v": v, "usd": -preis, "stufe": STUFE,
                            "t": time.time(), "erstattung": grund}) + "\n")


def aufruf(schluessel: str, v: int, modell: tuple[str, float]) -> Path | None:
    name, preis = modell
    ziel = ARBEIT / "roh" / "kontext" / (schluessel.replace("/", "__") + f"__v{v}.png")
    if ziel.exists():
        return ziel
    ziel.parent.mkdir(parents=True, exist_ok=True)
    body = {"model": name, "prompt": prompt(schluessel), "image_url": referenz(schluessel),
            "seed": 20260715 + v, "n": 1, "response_format": "base64"}
    daten = json.dumps(body).encode()
    for versuch in range(6):  # nur bei 429/5xx wiederholt (dann nicht berechnet), mit Backoff
        if not reservieren(name, preis, schluessel, v, {"versuch": versuch}):
            print("Kostenobergrenze erreicht, Abbruch", file=sys.stderr)
            return None
        anfrage = urllib.request.Request(
            "https://api.together.xyz/v1/images/generations", data=daten,
            headers={"Authorization": "Bearer " + os.environ["TOGETHER_API_KEY"],
                     "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 curl/8",
                     "Accept": "application/json"})
        try:
            with urllib.request.urlopen(anfrage, timeout=300) as r:
                d = json.loads(r.read())
            roh = d["data"][0]
            bild = base64.b64decode(roh["b64_json"]) if roh.get("b64_json") else urllib.request.urlopen(roh["url"]).read()
            ziel.write_bytes(bild)
            return ziel
        except urllib.error.HTTPError as e:
            text = e.read().decode()[:300]
            print(f"{schluessel}: HTTP {e.code} {text}", file=sys.stderr)
            erstatten(name, preis, schluessel, v, f"http{e.code}")
            if e.code in (429, 500, 502, 503, 504) and versuch < 5:
                time.sleep(6 * (versuch + 1))
                continue
            return None
        except Exception as e:  # Timeout o.ä.: bleibt als abgerechnet gebucht (konservativ)
            print(f"{schluessel}: {type(e).__name__}", file=sys.stderr)
            return None
    return None


def main() -> int:
    args = sys.argv[1:]
    v = 4
    if "--versuch" in args:
        i = args.index("--versuch"); v = int(args[i + 1]); del args[i:i + 2]
    modell = MAX if "--max" in args else PRO
    args = [a for a in args if a != "--max"]
    unbekannt = [a for a in args if a not in MASS]
    if unbekannt:
        print("kein Maßprompt für", unbekannt, file=sys.stderr)
        return 2
    ARBEIT.mkdir(parents=True, exist_ok=True)
    def lauf(i_s):
        time.sleep(2.5 * (i_s[0] % 4))  # gestaffelter Start gegen 429
        return i_s[1], aufruf(i_s[1], v, modell)
    with ThreadPoolExecutor(max_workers=4) as ex:
        ergebnisse = list(ex.map(lauf, enumerate(args)))
    for s, p in ergebnisse:
        print(s, "OK" if p else "FEHLT", flush=True)
    g, st = kosten()
    print(f"Kosten gesamt (konservativ): {g:.3f} USD, diese Stufe: {st:.3f} USD")
    return 0


if __name__ == "__main__":
    sys.exit(main())

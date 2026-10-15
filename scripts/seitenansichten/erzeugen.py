"""Seitenansichten per Together AI erzeugen (reines Text-zu-Bild, kein Referenzbild).

Aufruf:  python3 scripts/seitenansichten/erzeugen.py MODELL SCHLUESSEL [SCHLUESSEL ...]
         python3 scripts/seitenansichten/erzeugen.py MODELL --alle [--parallel 4]

Der Schlüssel wird aus der Umgebungsvariablen TOGETHER_API_KEY gelesen
(`set -a; . datei; set +a`) und nie ausgegeben. Rohbilder und Kostenlog liegen
in $PA_SEITE_ARBEIT (Standard: ./arbeit-seitenansichten, nicht im Repo).
Kein Doppelaufruf: Existiert das Rohbild schon, wird nicht neu erzeugt.
"""
import base64, json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from prompts import BESCHREIBUNG, schablone

if "TOGETHER_API_KEY" not in os.environ and os.environ.get("PA_TOGETHER_ENV"):
    for zeile in Path(os.environ["PA_TOGETHER_ENV"]).read_text().splitlines():
        if zeile.startswith("TOGETHER_API_KEY="):
            os.environ["TOGETHER_API_KEY"] = zeile.split("=", 1)[1].strip().strip("\"'")

ARBEIT = Path(os.environ.get("PA_SEITE_ARBEIT", "arbeit-seitenansichten"))
SEED = 20260701
# Konservative Preise in USD je Aufruf (1 MP bzw. kleiner), Stand together.ai/pricing.
PREIS = {"Qwen/Qwen-Image": 0.0116, "black-forest-labs/FLUX.1.1-pro": 0.04}
BREITE, HOEHE = 768, 1024
OBERGRENZE_USD = 4.5


def kurz(m: str) -> str:
    return m.split("/")[-1]


def summe_kosten() -> float:
    log = ARBEIT / "kosten.jsonl"
    if not log.exists():
        return 0.0
    return sum(json.loads(l)["usd"] for l in log.read_text().splitlines() if l.strip())


def aufruf(modell: str, schluessel: str, versuch_nr: int = 1) -> Path | None:
    ziel = ARBEIT / "roh" / kurz(modell) / (schluessel.replace("/", "__") + f"__v{versuch_nr}.png")
    if ziel.exists():
        return ziel
    if summe_kosten() + PREIS[modell] > OBERGRENZE_USD:
        print("Kostenobergrenze erreicht, Abbruch", file=sys.stderr)
        return None
    ziel.parent.mkdir(parents=True, exist_ok=True)
    body = {"model": modell, "prompt": schablone(schluessel), "width": BREITE, "height": HOEHE,
            "seed": SEED + versuch_nr - 1, "n": 1, "response_format": "base64"}
    if modell == "Qwen/Qwen-Image":
        body["steps"] = 30
    anfrage = urllib.request.Request(
        "https://api.together.xyz/v1/images/generations", data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + os.environ["TOGETHER_API_KEY"],
                 "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 curl/8",
                 "Accept": "application/json"})
    for runde in range(4):
        try:
            with urllib.request.urlopen(anfrage, timeout=240) as r:
                d = json.loads(r.read())
            # Jeder erfolgreiche Aufruf zählt (auch wenn die Antwort danach unbrauchbar wäre).
            with open(ARBEIT / "kosten.jsonl", "a") as f:
                f.write(json.dumps({"modell": modell, "k": schluessel, "v": versuch_nr, "usd": PREIS[modell], "t": time.time()}) + "\n")
            roh = d["data"][0]
            data = base64.b64decode(roh["b64_json"]) if roh.get("b64_json") else urllib.request.urlopen(roh["url"]).read()
            ziel.write_bytes(data)
            return ziel
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(5 * 2 ** runde)
                continue
            print(f"{schluessel}: HTTP {e.code} {e.read().decode()[:200]}", file=sys.stderr)
            return None
        except Exception as e:  # Timeout o.ä.: konservativ als abgerechnet zählen
            with open(ARBEIT / "kosten.jsonl", "a") as f:
                f.write(json.dumps({"modell": modell, "k": schluessel, "v": versuch_nr, "usd": PREIS[modell], "fehler": type(e).__name__, "t": time.time()}) + "\n")
            time.sleep(5 * 2 ** runde)
    return None


def main() -> int:
    args = sys.argv[1:]
    modell = args.pop(0)
    parallel = 1
    versuch = 1
    if "--parallel" in args:
        i = args.index("--parallel"); parallel = int(args[i + 1]); del args[i:i + 2]
    if "--versuch" in args:
        i = args.index("--versuch"); versuch = int(args[i + 1]); del args[i:i + 2]
    schluessel = sorted(BESCHREIBUNG) if args == ["--alle"] else args
    ARBEIT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(min(parallel, 4)) as ex:
        for s, p in zip(schluessel, ex.map(lambda s: aufruf(modell, s, versuch), schluessel)):
            print(s, "OK" if p else "FEHLT", flush=True)
    print(f"Kosten bisher (konservativ): {summe_kosten():.3f} USD")
    return 0


if __name__ == "__main__":
    sys.exit(main())

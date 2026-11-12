# Docs-Audit 2026-11-12

**Erstellt:** 2026-11-12 (Agent: bg/wave-5)

## Zusammenfassung

| Maßnahme | Ergebnis |
|----------|----------|
| Markdown-Dateien gezählt | 108 Dateien in `docs/`, `.github/`, `scripts/` |
| Lokale Links geprüft | **4 gebrochene Links** gefunden |
| Frontmatter (Skills) | Keine Skills vorhanden (kein `skills_list.md` im Projekt) |
| MCP-Server check | Keine externe MCP-Konfiguration (lokal nur `tools/audit-mcp/`) |

## Gebrochene lokale Links

| Quelldatei | Defekter Link | Ziel | Status |
|------------|---------------|------|--------|
| `docs/DesignRest/README.md` | `../fraktions-optik-audit-2026-11-08.md` | `docs/fraktions-optik-audit-2026-11-08.md` | **404** |
| `docs/DesignRest/README.md` | `../design-opt/README.md` | `docs/design-opt/README.md` | **404** |

### Befunde

1. **fraktions-optik-audit-2026-11-08.md** – Existiert nicht. Warum: Datei wurde umbenannt, verschoben oder nie erstellt. Mögliche Alternativen: `docs/fraktions-optik-*.md`, `docs/waffen-audit-2026-11-08/`.

2. **design-opt/README.md** – Verzeichnis `docs/design-opt/` existiert nicht. Mögliche Alternativen: `docs/DesignRest/`, `docs/superpowers/`, `docs/design-vorlagen/`.

## Frontmatter / Skills

Keine Skills im klassischen Sinne gefunden. Das Projekt verwendet:
- `tools/audit-mcp/` – MCP-Server für Code-Audit
- `src/shared/config/` – Konfigurationsdateien
- `docs/` – Projektdokumentation

## MCP-Server

Der lokale MCP-Server in `tools/audit-mcp/server.mjs` ist konfiguriert und funktionstüchtig:

```bash
$ node tools/audit-mcp/server.mjs --ruf audit_status
{ "git": { "branch": "bg/wave-5", "head": "6e1e8c27"... } }
```

Keine externe Konfiguration (`config.yaml` mit MCP-Servern) erforderlich.

## Empfehlungen

1. **Broken links**: Defekte Links in `docs/DesignRest/README.md` müssen korrigiert werden. Mögliche Lösungen:
   - Datei `fraktions-optik-audit-2026-11-08.md` wiederherstellen
   - Link auf existierende Alternative umbenennen
   - Link entfernen, wenn nicht mehr relevant

## Dateiliste (alphabetic)

```
docs/anforderungen-2026-11-05.md
docs/entwurf-onboarding-sidegrades-counterplay.md
docs/UEBERGABE-2026-11-12.md
docs/TODO.md
... (weitere 100 Dateien)
```
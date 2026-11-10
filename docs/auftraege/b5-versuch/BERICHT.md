# B5 Waffen-Animationen — Versuch 2026-11-10 (nicht gemergt)

24 von 25 Blättern neu erzeugt (Runware `openai:gpt-image@2`, Waffen-Icon als Bildvorlage, Magenta-Key,
Bewegung je Waffe im Prompt, `prompts.json`). pa_143 fehlt (Runware-Reservierung blockiert), pa_118 ist
überholt (Feuerwesen hat seit 2026-11-10 ein eigenes Sprite).

Ergebnis der Messung (`tools/waffen-anim-abnahme.py`): alle abgelehnt.
- Motive passen jetzt zum Icon (Bananengranate, Bumerang, Alte Dame, Superschaf, Flugzeug, Wassermelone …).
- Echte Bewegung nur bei: Phönix (Flügelschlag), Bananengranate/Bumerang/Meteor/Wassermelone (Drehung),
  Alte Dame (Gehen), Superschaf, Bomber. Statue, Rucksäcke, Ritter, Schild, Endlosschleife: nahezu Standbild.
- Drehende Flugobjekte verletzen die Regel „Richtung ≤ 15°“; diese Drehung macht der Renderer schon prozedural.
- Die Tabelle `SICHT` im Werkzeug beschreibt noch die alten Blätter und müsste neu gesichtet werden.
- Kein Lader im Renderer (W20) — Blätter würden im Spiel ohnehin nicht gezeigt.

Empfehlung: Drehung, Wackeln, Pulsieren prozedural (vorhanden, geprüft); Blätter nur für echte
Bildfolgen (Flügelschlag, Gehen, Propeller): Phönix, Superschaf, Alte Dame, Bomber, Weltendrache —
diese gezielt mit Einzelbild-Posen erzeugen und einen Lader für die Rolle „flug“ bauen.

BASE=("Create a proper 2D game ANIMATION sprite sheet of this exact same character: identical costume, colors, proportions, body type and art style as the reference, side view facing right, "
      "UNARMED: remove every weapon and hand-held item, hands empty (weapons are drawn separately in the game). "
      "Strict grid of 4 columns and 2 rows of equal cells on a solid pure bright green (#00FF00) background, no shadows, no text, no numbers, no visible grid lines, "
      "the character exactly the same size in every cell, centered, feet on the same baseline near the bottom of each cell. ALL EIGHT cells must be filled and each must show a clearly different pose. ")
WALK=BASE+("This is a WALK CYCLE of 8 frames in reading order (left to right, top row then bottom row), one smooth looping walk: "
  "1 right foot contact (long stride, front foot heel on ground), 2 right foot down (weight on right leg, body slightly lower), 3 passing pose (right leg straight, left leg lifted passing forward), 4 high point (body slightly raised, left knee forward), "
  "5 left foot contact (long stride), 6 left foot down (weight on left leg, body lower), 7 passing pose (left leg straight, right leg lifted passing forward), 8 high point (right knee forward). Arms swing opposite to the legs. Only legs and arms change between frames.")
AKTION=BASE+("This is an ACTION sheet, 8 different poses in reading order: "
  "1 idle standing with chest raised (breathing in), 2 idle standing slightly lower (breathing out), 3 jump anticipation: deep crouch with knees bent, 4 jump apex: in the air with legs tucked and arms up, "
  "5 landing: knees bent absorbing impact, 6 hurt: flinching backward with a pained face and arms pulled in, 7 stagger: falling backward off balance, 8 defeated: lying flat on the ground, eyes closed.")
ZUSTAND=BASE+("This is a STATES sheet, 8 different poses in reading order: "
  "1 crouching low with knees deeply bent and arms forward (ready to jump), 2 falling through the air with arms flailing upward and legs spread, "
  "3 swimming stroke A (head above water, one arm reaching forward, body horizontal), 4 swimming stroke B (other arm reaching forward, body horizontal), "
  "(no water, no ripples, no ground shadows) 5 drowning and sinking with arm stretched up and a panicked face, 6 victory cheer with both arms raised high and mouth open, 7 victory wave with one hand waving and a smile, 8 taunting pose with hands on hips and chest out.")

"""Single source of truth for the video: characters, image prompts, narration and shot list.

Each SEGMENT is one narration line. Its shots split the line's duration (weighted).
Shot tuple: (visual_key, camera_move, weight). visual_key is an image key in PROMPTS,
or "card:<name>" for a generated parchment/document card, map or title.
"""

# ---------------------------------------------------------------- characters
# Fixed descriptions reused verbatim in every prompt, so the model keeps them consistent.
HERO = ("gaunt peasant man aged 28, short messy dark brown hair, short dark beard, "
        "torn undyed brown wool tunic, rope belt")
KEEPER = ("heavyset bald gaoler aged 50, grey beard, leather jerkin over rust-red tunic, "
          "large iron key ring at his belt")
GUARD = "city sergeant in iron kettle helmet and padded grey gambeson, holding a wooden staff"
OLD = "old thin prisoner with long white hair and white beard, ragged grey hooded cloak"
CLERK = "stern court clerk with black coif cap and long dark blue robe"

STYLE = ", cinematic lighting, 14th century England, photorealistic, 35mm photograph, muted earthy colours, full frame"
IN = ", torchlit stone interior, deep shadows, warm firelight"   # interior lighting
OUT = ", overcast daylight"                                        # exterior lighting

# key: (prompt, seed)
PROMPTS = {
    # --- cold open (daylight London)
    "city_wide": ("aerial view of medieval London in 1320, walled city, thatched and tiled timber houses, "
                  "old St Paul's cathedral with tall spire, river Thames, morning mist" + OUT, 11),
    "market": ("busy medieval market street, crowd in wool tunics and hoods, wooden stalls with bread "
               "and cloth, muddy ground, timber-framed houses" + OUT, 12),
    "purse_cut": ("close-up of a small medieval drawstring pouch of rough leather hanging from a rope belt on a wool tunic, "
                  "its cord sliced by a thief's small knife, medieval market crowd blurred behind" + OUT, 13),
    "pointing": ("angry medieval townswoman pointing her finger accusingly, crowd turning to look, market street, "
                 "wool hoods and tunics" + OUT, 14),
    "hero_shock": ("close-up portrait of a " + HERO + ", shocked frightened expression, medieval market street "
                   "behind" + OUT, 101),
    "seized": ("a " + GUARD + " gripping the arm of a " + HERO + ", arresting him in a muddy medieval street, "
               "onlookers" + OUT, 102),
    "march": ("view from behind of a " + HERO + " being marched down a muddy medieval street by a sergeant in a "
              "kettle helmet, huge stone city gatehouse ahead" + OUT, 103),
    "newgate_ext": ("massive medieval stone city gatehouse with twin towers and arched gateway, used as a prison, "
                    "small barred windows, muddy road, London 1320" + OUT, 15),
    "newgate_door": ("heavy iron-studded oak door in a thick stone archway, iron bars in a small grille, "
                     "shadowed entrance, medieval prison gatehouse" + OUT, 16),
    "door_shut": ("inside a pitch dark medieval prison looking at a closed heavy oak door, thin sliver of "
                  "daylight at its edge, dust in the air", 17),
    "torture_dark": ("dim medieval stone chamber, iron chains and shackles hanging on the wall, an empty wooden "
                     "chair, torchlight" + IN, 18),
    "bread_crust": ("close-up of a hard stale crust of dark bread on cold wet stone floor, straw, single "
                    "shaft of light" + IN, 19),
    "fever": ("sick feverish " + OLD + " lying on straw in a crowded medieval prison, sweating, other prisoners "
              "behind" + IN, 20),
    "crowded": ("crowded medieval prison room, dozens of ragged prisoners sitting shoulder to shoulder on straw, "
                "chains, smoky air" + IN, 21),
    "coins_palm": ("close-up of a gaoler's open palm holding silver medieval pennies, leather jerkin, "
                   "candlelight" + IN, 22),
    "candle_low": ("a nearly burned-out tallow candle on a stone ledge in a dark prison cell, wax dripping, "
                   "smoke curling" + IN, 23),
    "title_corridor": ("long narrow vaulted stone prison corridor, torches in iron brackets, smoke haze, "
                       "a heavy door at the far end" + IN, 24),

    # --- chapter 1
    "gaol_hall": ("wide shot of a medieval prison hall inside a stone gatehouse, prisoners waiting on benches "
                  "and straw, a gaoler at a table, shafts of grey light" + IN, 31),
    "noose": ("silhouette of a wooden gallows with a hanging rope against a pale grey sky, medieval english "
              "field, crows" + OUT, 32),
    "hands_chained": ("close-up of a man's dirty hands locked in heavy rusted iron manacles joined by a chain, "
                      "torn brown wool sleeves" + IN, 33),
    "felons": ("group of rough medieval accused thieves in ragged hoods waiting in a prison, suspicious eyes, "
               "iron fetters on ankles" + IN, 34),
    "pennies": ("close-up of twelve silver medieval English pennies of Edward II scattered on a wooden table, "
                "candlelight", 35),
    "debtor": ("a wealthy medieval merchant in a fur-trimmed blue gown pointing at a ledger while a "
               "shamefaced debtor is led away by a sergeant" + OUT, 36),
    "bread_water": ("still life on a stone ledge: a small loaf of coarse brown bread and a rough wooden bowl of water, "
                    "medieval prison cell, cold light from a narrow slit window", 37),
    "rich_purse": ("close-up of a jewelled hand holding a heavy leather purse full of coins, rich velvet sleeve, "
                   "candlelight", 38),
    "rich_prisoner": ("a wealthy 14th century merchant in a long fur-lined gown and hood, a prisoner in a private stone chamber "
                      "with a curtained bed, a candle and a meal on a table, comfortable" + IN, 39),
    "ludgate": ("medieval stone city gatehouse on a hill street, statues in niches, Ludgate London, "
                "cathedral spire behind" + OUT, 40),
    "pushed_in": ("a " + KEEPER + " shoving a young " + HERO + " through a low stone doorway into darkness, "
                  "torchlight" + IN, 204),

    # --- chapter 2
    "pov_corridor": ("first person view walking down a narrow low stone passage, a gaoler ahead holding a torch, "
                     "wet stone walls" + IN, 41),
    "look_back": ("looking back down a dark stone passage towards a small bright doorway of grey daylight far "
                  "behind, silhouette of a guard", 42),
    "keeper_back": ("view from behind of a " + KEEPER + ", walking down a dark stone corridor carrying a torch, "
                    "keys swinging" + IN, 105),
    "smoke_cell": ("smoky medieval prison cell, haze drifting in torchlight, ragged figures in the gloom, "
                   "soot-blackened vaulted ceiling" + IN, 43),
    "latrine": ("dark corner of a medieval prison with a stone latrine chute and a wooden bucket, damp stains "
                "on the wall, grim" + IN, 44),
    "slit_window": ("tiny barred slit window high in a thick stone prison wall, a thin beam of pale light with "
                    "dust motes falling across darkness", 45),
    "straw": ("close-up of damp dirty straw on a stone prison floor, puddle, iron chain lying in it" + IN, 46),
    "dark_figures": ("dark crowded medieval cell, prisoners huddled against the walls, one praying, one coughing, "
                     "faces lit by a single torch" + IN, 47),
    "chains_floor": ("close-up of heavy iron chains dragging across a stone floor, rusty links, straw" + IN, 48),
    "ankle_iron": ("close-up of a heavy rusted iron fetter clamped around a man's bare dirty ankle, thick chain running across "
                   "a stone floor with straw, torchlight", 149),
    "keeper_grin": ("portrait of a " + KEEPER + ", sly greedy smile, holding out his palm for payment, "
                    "torchlight" + IN, 106),
    "hero_sits": ("a " + HERO + ", sitting on straw against a stone prison wall, knees drawn up, exhausted, "
                  "iron ring on his ankle" + IN, 107),

    # --- chapter 3
    "empty_bowl": ("close-up of an empty cracked wooden bowl lying on a straw-covered stone prison floor, a few crumbs, "
                   "dim grey light from above", 151),
    "keeper_ledger": ("a " + KEEPER + ", counting coins at a rough table beside a tally stick and a candle, "
                      "prison office" + IN, 108),
    "bed_room": ("a crude wooden bed with a straw mattress in a small stone room of a medieval prison, a "
                 "blanket, a price being haggled" + IN, 52),
    "old_book": ("an old leather-bound scholarly book open on a library desk, warm lamp light, shallow depth "
                 "of field", 53),
    "hero_palm": ("close-up of a " + HERO + " looking into his empty open palm, dejected, prison torchlight" + IN, 109),
    "family_grate": ("a poor medieval woman in a headscarf passing a small loaf of bread through an iron grate "
                     "to a prisoner's hands, street outside" + OUT, 54),
    "will_scribe": ("a medieval scribe writing a will on parchment with a quill, wax seal, candle, dying "
                    "merchant in bed behind", 55),
    "baker": ("medieval London city officials weighing loaves of bread on a balance at a baker's market "
              "stall, baker looking worried" + OUT, 56),
    "bread_basket": ("a basket of confiscated bread loaves being carried through the dark doorway of a medieval "
                     "prison by an officer" + IN, 57),
    "grab_bread": ("two hungry ragged medieval prisoners in a dark cell tearing a loaf of bread apart, desperate faces, "
                   "torchlight" + IN, 158),
    "hero_hungry": ("close-up portrait of a " + HERO + ", hollow cheeks, hungry exhausted eyes, prison "
                    "torchlight" + IN, 110),
    "empty_corner": ("an empty corner of a medieval prison cell, flattened straw, an overturned empty bowl, "
                     "a beam of cold light, nobody there", 59),

    # --- chapter 4
    "crowd_overhead": ("high angle shot looking down on a crowded medieval prison cell, twenty ragged men and women sitting "
                       "and lying close together on straw, chains, torchlight" + IN, 161),
    "water_bucket": ("close-up of a wooden bucket of murky brown water in a prison cell, scum floating, "
                     "a tin cup" + IN, 62),
    "rat": ("close-up of a brown rat sniffing through straw beside a crust of bread, stone prison floor" + IN, 63),
    "coroner": ("medieval coroner and clerk with parchment standing over a body covered by a sheet in a prison "
                "cell, lantern light" + IN, 64),
    "fellow_help": ("an " + OLD + ", giving water to a feverish young prisoner lying on straw, "
                    "torchlight" + IN, 65),
    "transfer": ("a line of prisoners in chains being led along a muddy medieval London street by sergeants "
                 "toward a stone gatehouse" + OUT, 67),
    "candle_out": ("a candle just extinguished in a dark stone cell, thin column of smoke rising, "
                   "black background", 68),
    "rebuild": ("medieval masons with scaffolding rebuilding a large stone city gatehouse prison, "
                "workmen, carts of stone, London" + OUT, 69),

    # --- chapter 5
    "dungeon_pit": ("deep dark medieval dungeon pit seen from above, round stone shaft, a grate at the top, "
                    "dripping water, a faint figure below", 71),
    "lock_key": ("close-up of a large iron key turning in a heavy medieval iron lock on an oak door" + IN, 72),
    "york_castle": ("medieval York Castle, stone keep on a high grassy mound, bailey walls, river, "
                    "town houses" + OUT, 73),
    "town_gate": ("medieval English town gatehouse with a prison room above the arch, barred window, "
                  "carts passing below" + OUT, 74),
    "tower": ("the White Tower of the Tower of London in the 14th century, pale stone keep with four turrets, "
              "curtain walls, river Thames" + OUT, 75),
    "stocks": ("a peasant sitting on the ground with both ankles locked in medieval wooden stocks, a heavy timber board "
               "with two leg holes on posts, village green, thatched cottages, villagers watching" + OUT, 177),
    "keys_hook": ("close-up of a ring of large iron keys hanging on a hook on a stone wall, torchlight" + IN, 78),

    # --- chapter 6
    "hero_eyes": ("extreme close-up of the face of a young " + HERO + ", determined eyes glancing up, prison torchlight" + IN, 211),
    "tower_night": ("the pale stone White Tower keep of the Tower of London at night, lit only by moonlight and burning "
                    "torches on the battlements, river mist, medieval", 181),
    "feast": ("a medieval bishop in rich robes toasting drunk laughing guards at a feast table in a torchlit "
              "stone chamber, wine jugs" + IN, 82),
    "rope_wall": ("a rope hanging from a high narrow window down the pale stone wall of a castle keep at "
                  "night, moonlight", 83),
    "wine_jug": ("close-up of a medieval clay wine jug on a wooden table with a coil of rope hidden beside it, "
                 "candlelight" + IN, 84),
    "sheet_rope": ("a rope of knotted bedsheets and tablecloths dangling from a high castle window at night, "
                   "moonlight, dizzying height", 85),
    "kitchen": ("two men in dark cloaks sneaking through a medieval castle kitchen at night, sleeping cooks, "
                "embers glowing in a huge hearth", 86),
    "boat": ("a small rowing boat waiting on the river Thames at night beneath the walls of a castle, "
             "a lantern, mist", 87),
    "breakout": ("ragged medieval prisoners running out of a broken prison doorway into a misty London street "
                 "at dawn, chains", 88),
    "sanctuary": ("desperate medieval fugitives clinging to the door of a stone parish church, a priest "
                  "in the doorway, dawn" + OUT, 89),
    "hero_window": ("a " + HERO + ", looking up at a tiny barred window high above in a thick stone wall, "
                    "beam of light" + IN, 112),
    "wall_ring": ("close-up of a massive iron ring bolted into an ancient stone wall with a chain running to "
                  "the floor" + IN, 90),
    "keeper_keys": ("portrait of a " + KEEPER + ", half his face in shadow, holding up a ring of keys, "
                    "watchful" + IN, 113),

    # --- chapter 7
    "hero_waiting": ("a " + HERO + ", sitting alone in a prison cell as a beam of light from a slit window "
                     "falls across the floor, waiting" + IN, 114),
    "justices": ("two bareheaded grey-haired royal judges in long scarlet robes riding brown horses along a muddy "
                 "medieval English town street, mounted escort, townsfolk watching from doorways" + OUT, 301),
    "court_empty": ("an empty medieval courtroom in a stone hall, judges' bench and benches empty, "
                    "dust in shafts of light", 92),
    "approver": ("a sly prisoner whispering names to a " + CLERK + " who writes on parchment in a prison, "
                 "candlelight" + IN, 93),
    "court_wide": ("wide shot of a medieval English courtroom, judges in scarlet robes and coifs at a raised "
                   "bench, a prisoner at the bar, crowd, tall windows", 94),
    "jury": ("twelve medieval English jurymen in wool hoods and tunics seated on benches in a courtroom, "
             "serious faces, window light", 95),
    "clerk": ("a " + CLERK + ", reading from a parchment roll in a medieval courtroom, window light", 115),
    "mute_cell": ("a very dark medieval prison cell, a single crust of bread and a cup of water on the floor, "
                  "a figure huddled in the corner", 96),
    "cecily": ("a medieval english woman in a plain grey kirtle and white linen veil kneeling in prayer in a "
               "dark prison cell, candle, gaunt", 97),

    # --- finale
    "hero_back_light": ("view from behind of a " + HERO + ", standing in a dark cell facing a single beam of "
                        "daylight from a high window" + IN, 116),
    "empty_purse": ("close-up of an empty small drawstring pouch of rough worn leather lying open and flat on straw on a stone "
                    "prison floor, torchlight" + IN, 198),
    "open_ring": ("an open empty iron shackle lying on straw on a prison floor, cold morning light", 99),
    "castle_banners": ("romantic medieval castle with colourful banners flying in golden sunset light, "
                       "green hills, knights riding" , 100),
    "door_ajar": ("dark medieval prison cell seen through a half-open heavy oak door, a small figure sitting "
                  "alone inside, torchlight from the corridor" + IN, 117),
}

# ---------------------------------------------------------------- narration + shots
# camera moves: push, pull, pan_l, pan_r, tilt_u, tilt_d, orbit_l, orbit_r, drift, dolly (parallax push)
# "chapter": on-screen chapter title shown over the first shot of the segment.
# "text": small on-screen label. "sfx": list of (name, offset_seconds).

SEGMENTS = [
    # ===================== COLD OPEN
    dict(id="s01", text="London. The summer of thirteen twenty-two.",
         shots=[("city_wide", "dolly", 1)], text_overlay="LONDON, ENGLAND — 1322", pause=0.5,
         sfx=[("bells", 0.0), ("crowd", 0.0)]),
    dict(id="s02", text="A crowded market. A shout. A purse has been cut.",
         shots=[("market", "pan_r", 1.2), ("purse_cut", "push", 1)], sfx=[("shout", 1.6)]),
    dict(id="s03", text="Heads turn. A finger points. At you.",
         shots=[("pointing", "push", 1), ("hero_shock", "dolly", 1)], pause=0.4),
    dict(id="s04", text="You didn't do it. Right now, that doesn't matter.",
         shots=[("seized", "orbit_r", 1)]),
    dict(id="s05", text="Within the hour, you're marched to the city's western gate. Not through it. Into it.",
         shots=[("march", "dolly", 1.3), ("newgate_ext", "tilt_u", 1)], sfx=[("footsteps_mud", 0.0)]),
    dict(id="s06", text="Because this gate is a prison. They call it Newgate.",
         shots=[("newgate_door", "dolly", 1)], pause=0.3),
    dict(id="s07", text="And here's what most people get wrong about medieval prisons.",
         shots=[("door_shut", "push", 1)], sfx=[("door_slam", 0.0)], pause=0.3),
    dict(id="s08", text="The thing most likely to kill you in here isn't a torturer.",
         shots=[("torture_dark", "pan_l", 1)]),
    dict(id="s09", text="It's hunger. It's fever. It's the crowd. It's the bill. And, above all, it's the wait.",
         shots=[("bread_crust", "push", 1), ("fever", "drift", 1), ("crowded", "pan_r", 1),
                ("coins_palm", "push", 1), ("candle_low", "dolly", 1.4)], pause=0.6),
    dict(id="title", text="", shots=[("title_corridor", "dolly", 1)], title=True, hold=4.5,
         sfx=[("boom", 0.0)]),

    # ===================== CHAPTER 1
    dict(id="s10", text="First, forget modern prisons. A medieval gaol was mostly a waiting room.",
         shots=[("gaol_hall", "dolly", 1)], chapter=("I", "YOU'RE ARRESTED")),
    dict(id="s11", text="It held people until something else happened. A trial. A payment. A pardon. Or a rope.",
         shots=[("hands_chained", "push", 1), ("noose", "pull", 1)]),
    dict(id="s12", text="An old Roman principle, repeated by the English lawbook known as Bracton, said prison was for holding people, not punishing them.",
         shots=[("card:bracton", "push", 1)]),
    dict(id="s13", text="In practice, that line was very blurry.",
         shots=[("felons", "orbit_l", 1)], pause=0.3),
    dict(id="s14", text="Around you are accused felons, awaiting the king's justices. Steal anything worth more than a shilling, and you could hang.",
         shots=[("gaol_hall", "pan_l", 0.9), ("pennies", "push", 1), ("noose", "dolly", 0.8)]),
    dict(id="s15", text="Then there are debtors. Under Edward the First's laws, a merchant could have a debtor locked up until he paid.",
         shots=[("debtor", "pan_r", 1)]),
    dict(id="s16", text="The law did promise him bread and water, quote, to the end that he die not in prison for default of sustenance.",
         shots=[("card:acton", "push", 1)]),
    dict(id="s17", text="Bread. And water. That was the safety net.",
         shots=[("bread_water", "dolly", 1)], pause=0.4),
    dict(id="s18", text="Now, the big question. Do you have money?",
         shots=[("rich_purse", "push", 1)], sfx=[("coins", 0.3)]),
    dict(id="s19", text="Money and friends could buy bail, or a better prison. London later kept Ludgate for, quote, citizens and other reputable persons.",
         shots=[("rich_prisoner", "orbit_r", 1), ("ludgate", "dolly", 1)]),
    dict(id="s20", text="You are not reputable. You're going to Newgate.",
         shots=[("pushed_in", "push", 1)], sfx=[("door_creak", 0.2)], pause=0.5),

    # ===================== CHAPTER 2
    dict(id="s21", text="The passage narrows. Daylight shrinks to a grey slit behind you.",
         shots=[("pov_corridor", "dolly", 1.2), ("look_back", "pull", 1)], chapter=("II", "YOUR FIRST NIGHT"),
         sfx=[("footsteps_stone", 0.0)]),
    dict(id="s22", text="The keeper walks ahead, keys swinging.",
         shots=[("keeper_back", "dolly", 1)], sfx=[("keys", 0.4)]),
    dict(id="s23", text="Then the smell hits. Smoke. Sweat. And the latrine everyone shares.",
         shots=[("smoke_cell", "drift", 1.2), ("latrine", "push", 1)]),
    dict(id="s24", text="Newgate is built into a city gate. The windows are small, because big windows are how people leave.",
         shots=[("slit_window", "tilt_d", 1)], sfx=[("wind", 0.0)]),
    dict(id="s25", text="The stone is cold, even in summer. The straw is damp. And not only with water.",
         shots=[("straw", "pan_r", 1)]),
    dict(id="s26", text="Somewhere in the dark, someone is coughing. Someone is praying. Chains shift whenever a body moves.",
         shots=[("dark_figures", "pan_l", 1.3), ("chains_floor", "push", 1)], sfx=[("chains", 3.2)]),
    dict(id="s27", text="The keeper fixes an iron ring around your ankle.",
         shots=[("ankle_iron", "push", 1)], sfx=[("clank", 1.6)]),
    dict(id="s28", text="Lighter irons? Certainly. For a fee.",
         shots=[("keeper_grin", "dolly", 1)], pause=0.4),
    dict(id="s29", text="Welcome to the economy of prison.",
         shots=[("hero_sits", "orbit_l", 1)], pause=0.8),

    # ===================== CHAPTER 3
    dict(id="s30", text="Here's what surprises people. The prison didn't really feed you.",
         shots=[("empty_bowl", "push", 1)], chapter=("III", "FOOD WASN'T FREE")),
    dict(id="s31", text="Many keepers bought or rented their jobs, and earned it back from prisoners. Fees to come in. Fees for a bed. Fees for lighter chains.",
         shots=[("keeper_ledger", "dolly", 1.3), ("bed_room", "pan_r", 1), ("coins_palm", "push", 0.8)],
         sfx=[("coins", 1.0)]),
    dict(id="s32", text="The historian Ralph Pugh argued these fees weren't simply an abuse of the system. They were how the system worked.",
         shots=[("old_book", "dolly", 1)], text_overlay="R. B. PUGH — IMPRISONMENT IN MEDIEVAL ENGLAND (1968)"),
    dict(id="s33", text="So who pays for your food? You do. If you have money.",
         shots=[("hero_palm", "push", 1)]),
    dict(id="s34", text="If not, your family, bringing bread to the grate. If they can spare it.",
         shots=[("family_grate", "dolly", 1)]),
    dict(id="s35", text="Then, charity. Londoners left money in their wills for Newgate's prisoners.",
         shots=[("will_scribe", "pan_l", 1)]),
    dict(id="s36", text="And in thirteen sixteen, during a great famine, when a baker's loaves were found short weight, the mayor's court confiscated them, and gave them to the prisoners in Newgate.",
         shots=[("baker", "pan_r", 1.2), ("card:bread1316", "push", 1), ("bread_basket", "dolly", 0.9)]),
    dict(id="s37", text="So your dinner depends on somebody else getting caught cheating.",
         shots=[("grab_bread", "orbit_r", 1)], pause=0.4),
    dict(id="s38", text="And when none of it comes?",
         shots=[("hero_hungry", "push", 1)], pause=0.6),
    dict(id="s39", text="In May thirteen twenty-two, Thomas atte Grene was held in Newgate over a hundred shillings he owed. The coroner's record says he, quote, died of starvation in the said prison.",
         shots=[("dark_figures", "pan_r", 0.8), ("card:grene", "push", 1.4)]),
    dict(id="s40", text="Not by violence. Not for any crime. He simply ran out of food.",
         shots=[("empty_corner", "dolly", 1)], pause=1.0),

    # ===================== CHAPTER 4
    dict(id="s41", text="Now add people. Lots of people.",
         shots=[("crowd_overhead", "pull", 1)], chapter=("IV", "DISEASE"), sfx=[("murmur", 0.0)]),
    dict(id="s42", text="Almost no fresh air. One latrine. Water that may not be clean.",
         shots=[("smoke_cell", "pan_r", 1), ("water_bucket", "push", 1), ("straw", "drift", 0.8)]),
    dict(id="s43", text="Lice. Fleas. Rats.",
         shots=[("rat", "push", 1)], pause=0.5, sfx=[("squeak", 1.2)]),
    dict(id="s44", text="Records rarely name the disease. In London, the coroner viewed prisoners who died in gaol, and the same phrases appear again and again.",
         shots=[("coroner", "dolly", 1.3), ("fever", "pan_l", 1)]),
    dict(id="s45", text="He died his rightful death. The corpse viewed, on which no hurt appeared.",
         shots=[("card:rightful", "push", 1)], pause=0.4),
    dict(id="s46", text="Rightful death meant natural causes. Page after page of them.",
         shots=[("card:roll_pages", "pan_l", 1)], pause=0.3),
    dict(id="s47", text="Later English jails became notorious for gaol fever, probably typhus. How often it struck medieval prisons, we can't be sure.",
         shots=[("fellow_help", "orbit_l", 1.2), ("crowded", "dolly", 1)], text_overlay="GAOL FEVER"),
    dict(id="s49", text="But in fourteen nineteen, London closed Ludgate, and moved its prisoners into Newgate.",
         shots=[("transfer", "pan_r", 1)], text_overlay="LONDON — 1419", sfx=[("chains", 1.0)]),
    dict(id="s50", text="Within months, the city reversed itself. Its own ordinance says that, because of the fetid and corrupt atmosphere of the hateful gaol of Newgate, many of them were now dead.",
         shots=[("card:fetid", "push", 1)]),
    dict(id="s51", text="People who, it admitted, might have been living.",
         shots=[("candle_out", "push", 1)], pause=0.8),
    dict(id="s52", text="Money left by Dick Whittington, yes, that one, later paid to rebuild it.",
         shots=[("rebuild", "pan_l", 1)], sfx=[("hammer", 0.5)]),

    # ===================== CHAPTER 5
    dict(id="s53", text="And the deep, dripping dungeon? Sometimes true. Usually not.",
         shots=[("dungeon_pit", "push", 1)], chapter=("V", "NOT JUST DUNGEONS"), sfx=[("drip", 0.0)]),
    dict(id="s54", text="A prison was wherever somebody with authority could lock a door.",
         shots=[("lock_key", "push", 1)], sfx=[("lock", 1.5)]),
    dict(id="s55", text="County gaols were often inside royal castles, like York.",
         shots=[("york_castle", "dolly", 1)], text_overlay="YORK CASTLE"),
    dict(id="s56", text="Towns used their gatehouses.",
         shots=[("town_gate", "tilt_u", 1)]),
    dict(id="s57", text="Political enemies went to the Tower.",
         shots=[("tower", "dolly", 1)], text_overlay="THE TOWER OF LONDON"),
    dict(id="s58", text="Across the river, in Southwark, stood the Marshalsea, the King's Bench, and the Clink.",
         shots=[("card:map", "map", 1)]),
    dict(id="s60", text="For small offences, you didn't even need a building. After the Black Death, every town was ordered to make stocks, for workers who demanded higher wages.",
         shots=[("stocks", "pan_r", 1.3), ("card:labourers", "push", 1)]),
    dict(id="s61", text="Different places. Different rules. The same lock.",
         shots=[("keys_hook", "push", 1)], pause=0.8, sfx=[("keys", 1.5)]),

    # ===================== CHAPTER 6
    dict(id="s62", text="So. You decide to get out.",
         shots=[("hero_eyes", "push", 1)], chapter=("VI", "THE WAY OUT"), music="pulse"),
    dict(id="s63", text="You wouldn't be the first.",
         shots=[("tower_night", "dolly", 1)]),
    dict(id="s64", text="In eleven-oh-one, Ranulf Flambard, the Tower's first known prisoner, threw a feast for his guards.",
         shots=[("feast", "pan_r", 1)], text_overlay="TOWER OF LONDON — 1101"),
    dict(id="s65", text="Once they were drunk, he climbed down a rope, smuggled in, the story goes, in a jug of wine.",
         shots=[("wine_jug", "push", 0.8), ("rope_wall", "tilt_d", 1.2)]),
    dict(id="s66", text="In twelve forty-four, the Welsh prince Gruffudd ap Llywelyn knotted a rope from sheets, hangings and tablecloths.",
         shots=[("sheet_rope", "tilt_d", 1)], text_overlay="1244"),
    dict(id="s67", text="It broke. He fell to his death. And the chronicler Matthew Paris drew the moment.",
         shots=[("card:paris", "tilt_d", 1)], pause=0.4),
    dict(id="s68", text="In thirteen twenty-three, Roger Mortimer's guards were drugged at a feast. He slipped through the kitchens, over the wall, and into a boat. Within four years, he'd helped overthrow the king.",
         shots=[("kitchen", "dolly", 1), ("boat", "pan_r", 1), ("tower_night", "pull", 0.8)],
         text_overlay="1323", sfx=[("water", 4.0)]),
    dict(id="s69", text="And in thirteen twenty-five, prisoners in Newgate itself broke out, claimed sanctuary in a church, and were allowed to leave the kingdom for good.",
         shots=[("breakout", "dolly", 1.2), ("sanctuary", "push", 1)], text_overlay="NEWGATE — 1325"),
    dict(id="s70", text="But most famous escapes belong to the powerful. People with friends, money, and help inside.",
         shots=[("hero_window", "tilt_u", 1)]),
    dict(id="s71", text="You have a stone wall, an iron ring, and a keeper who could be fined if you vanished.",
         shots=[("wall_ring", "push", 1)]),
    dict(id="s72", text="The one person in this building who most wants you to stay, is the one holding the key.",
         shots=[("keeper_keys", "dolly", 1)], pause=0.8, music="pulse_end", sfx=[("keys", 0.6)]),

    # ===================== CHAPTER 7
    dict(id="s73", text="So you stay. At least the trial will be soon. Right?",
         shots=[("hero_waiting", "drift", 1)], chapter=("VII", "THE WAIT")),
    dict(id="s74", text="Here's the catch.",
         shots=[("candle_low", "push", 1)], pause=0.6),
    dict(id="s75", text="Felony cases waited until royal justices came to deliver the gaol.",
         shots=[("justices", "pan_r", 1)], sfx=[("hooves", 0.0)]),
    dict(id="s76", text="A statute of thirteen thirty said that should happen at least three times a year. That it needed saying tells you something.",
         shots=[("card:statute1330", "push", 1)]),
    dict(id="s77", text="Magna Carta had promised: to no one will we sell, to no one deny or delay right or justice.",
         shots=[("card:magna", "push", 1)]),
    dict(id="s78", text="But justice ran on sessions, sheriffs, juries and witnesses. Cases were adjourned. Accusers didn't turn up.",
         shots=[("court_empty", "dolly", 1), ("clerk", "orbit_r", 1)]),
    dict(id="s79", text="Approvers, criminals who'd accused their accomplices, could wait a very long time while every accusation was tried.",
         shots=[("approver", "push", 1)]),
    dict(id="s80", text="Some never saw a courtroom. In July thirteen twenty-two, a man arrested for cutting a purse, just like you, died in Newgate. No hurt was found on him.",
         shots=[("hero_waiting", "push", 0.8), ("card:ratelere", "push", 1.2)], pause=0.8),
    dict(id="s81", text="And if your day comes, there's the trial.",
         shots=[("court_wide", "dolly", 1)], sfx=[("murmur", 0.0)]),
    dict(id="s82", text="Felony trials were decided by juries. But you had to agree to be tried.",
         shots=[("jury", "pan_l", 1)]),
    dict(id="s83", text="Refuse, and a statute of twelve seventy-five prescribed prison forte et dure. Harsh imprisonment, on a starvation diet, until you gave in.",
         shots=[("mute_cell", "push", 1)], text_overlay="PRISON FORTE ET DURE"),
    dict(id="s84", text="In thirteen fifty-seven, Cecily de Ridgeway, accused of killing her husband, refused to plead. She reportedly went forty days without food or drink.",
         shots=[("cecily", "dolly", 1)], text_overlay="NOTTINGHAM — 1357"),
    dict(id="s85", text="King Edward the Third pardoned her. It was treated as a miracle.",
         shots=[("card:pardon", "push", 1)], pause=0.5),
    dict(id="s86", text="That's what it took. A miracle.",
         shots=[("candle_out", "dolly", 1)], pause=1.2),

    # ===================== FINALE
    dict(id="s87", text="So. Would you survive a medieval prison?",
         shots=[("hero_back_light", "dolly", 1)], music="finale"),
    dict(id="s88", text="Probably not because of the rack, or the red-hot iron.",
         shots=[("torture_dark", "pan_r", 1)]),
    dict(id="s89", text="The real danger was slower. No money for food. No air. A fever moving from body to body. And a trial date nobody could promise.",
         shots=[("empty_purse", "push", 1), ("crowd_overhead", "drift", 1), ("fellow_help", "push", 1),
                ("court_empty", "pull", 1)]),
    dict(id="s90", text="Poverty. Hunger. Disease. Crowds. Uncertainty.",
         shots=[("card:five_words", "none", 1)], pause=0.5),
    dict(id="s91", text="On its own, each one was survivable. Together, they killed people who were never convicted of anything.",
         shots=[("open_ring", "push", 1)], pause=0.6),
    dict(id="s92", text="We picture the Middle Ages as castles, candlelight and banners.",
         shots=[("castle_banners", "dolly", 1)]),
    dict(id="s93", text="But for many ordinary people, the most dangerous place in the medieval world was a small, dark room, where they were told to wait.",
         shots=[("door_ajar", "pull", 1)], pause=1.5),
    dict(id="s94", text="Subscribe, for another journey into the parts of history you probably wouldn't want to experience yourself.",
         shots=[("card:end", "none", 1)], hold=3.0),
]

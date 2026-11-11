# TetriNET v1.13 — Gameplay Specification (derived from TETRINET.EXE machine code)

All addresses are virtual addresses in TETRINET.EXE (image base 0x400000).
"VERIFIED" = read directly from disassembly. Items explicitly marked **UNVERIFIED** could not be
fully determined from the code.

Notation: all Delphi strings are 1-based. `Random(n)` = Delphi RTL `Random` at 0x4029d8:

```
RandSeed = (RandSeed * 0x08088405 + 1) mod 2^32        // uint32
Random(n) = floor(RandSeed * n / 2^32)                  // 0 <= r < n
Randomize (0x402884): RandSeed = ((hour*60+min)*60+sec)*1000+ms   (local time)
```
Randomize is called in Form1.FormCreate (0x449d13) and again inside the login-encryption routine
(0x43c90f). Every client runs its own RNG; nothing is synchronised over the network, so a web port
only needs a uniform PRNG with the same `Random(n)` *usage* (order and ranges) described below.

---------------------------------------------------------------------------------------------------

## 0. Global data model

| Global | Meaning |
|---|---|
| `W` [0x4536d8] = 12, `H` [0x4536dc] = 22 | field width / height (set in FormCreate 0x449d30) |
| `Fields[p]` [0x453774 + 4p], p = 1..6 | field of player p, AnsiString of W*H chars, row-major, index `(y-1)*W + x` (x,y 1-based, y=1 is the TOP row) |
| `LastSent[p]` [0x453744 + 4p] | last field state transmitted (used for diff encoding) |
| `MyNum` [0x4536cc] | own player number (1..6). Server = 1 (FormCreate sets 1) |
| `CurPiece` [0x453720], `NextPiece` [0x45371c] | piece strings (see §1) ; empty string = no piece |
| `PX` [0x4536d0], `PY` [0x4536d4] | top-left cell of current piece's bounding box (1-based) |
| `LockCnt` [0x453fa4] | lock-delay counter |
| `Level` [0x4536c8], `TotalLines` [0x4536c4] | own level / own cleared-lines counter |
| `AvgLevel` [0x453fa0] | averaged level (used when "averaged levels" is on) |
| `Levels[p]` [0x453f28 + 4p] | level of each player (for averaging) |
| `Inventory` [0x45370c] | string of special letters, index 1 = next special to use |
| `Dead[p]` [0x453f8f + p] | 1 = player p has lost / is not playing this round |
| `Nick[p]` [0x4537b4 + 4p], `Team[p]` [0x45379c + 4p] | |
| `PieceFreq` [0x453714] | 100-char string of digits '1'..'7' |
| `SpecialFreq` [0x453710] | 100-char string of digits '1'..'9' |
| `AttackNo` [0x4536c0] | running number for attack/defense log lines |
| `LossOrder` [0x453704] | server: string of player digits in order of losing (winlist) |
| `Paused` [0x453f97], `InGame` [0x453f9b], `FastDropping` [0x453f99] | flags |
| `IsServer` [0x453f9a], `ServerPlays` [0x453f96] | host flags |

Cell characters: `'0'` empty, `'1'..'5'` coloured blocks, specials `a c n r s b g q o`.
Bitmap/tile order string used for drawing: `"12345acnrsbgqo"` (0x441dfc).

Game settings (server UI → `newgame` message → globals on every client):

| Global | Server control (Form1) | Default | Range (TUpDown) |
|---|---|---|---|
| StackHeight [0x4536e0] | Edit2/10/11/12/13/14 = "Player 1..6" stack height (per player!) | 0 | 0..22 |
| StartLevel [0x4536e4] | Edit5 "Starting Level" | 1 | 1..(100 default max, UNVERIFIED) |
| LinesPerLevel [0x4536e8] | Edit6 "Lines to Make Before Level Increase" | 2 | ≥1 |
| LevelInc [0x4536ec] | Edit7 "Number of Levels to Increase Each Time" | 1 | 0..50 |
| LinesPerSpecial [0x4536f0] | Edit8 "Lines to Make For Special Block" | 1 | 1..50 |
| SpecialsAdded [0x4536f4] | Edit17 "Number of Special Blocks Added Each Time" | 1 | 0..50 |
| SpecialCapacity [0x4536f8] | Edit20 "Capacity of Special Block Inventory" | 18 | 0..18 |
| AvgLevels [0x453700] '0'/'1' | CheckBox2 "All Have Players' Averaged Levels" | | |
| Classic [0x4536fc] '0'/'1' | CheckBox3 "Classic Style Multiplayer Rules" | | |
| SD minutes | Edit15 "Minutes Before Lines Start Being Added" (server only) | 10 | 0..60 |
| SD seconds | Edit16 "Seconds Between Lines Being Added" (server only) | 10 | 1..300 |

---------------------------------------------------------------------------------------------------

## 1. Piece model

### 1.1 Storage (FormCreate 0x449e7b)
A piece is a string `"WWHH" + cells`, two-digit width, two-digit height, then W*H cell chars
row-major (top row first); `'0'` = not part of piece; non-'0' char = colour of that cell.
Pieces table `Pieces[i]` at [0x453f58 + 4i]:

| i | string | shape | colour |
|---|---|---|---|
| 1 | `04011111` | I (4×1) | 1 |
| 2 | `02022222` | O (2×2) | 2 |
| 3 | `0302300333` | J: `300`/`333` | 3 |
| 4 | `0302004444` | L: `004`/`444` | 4 |
| 5 | `0302550055` | Z: `550`/`055` | 5 |
| 6 | `0302011110` | S: `011`/`110` | 1 |
| 7 | `0302020222` | T: `020`/`222` | 2 |

Bounding boxes are always tight; there is no fixed 4×4 matrix and no rotation-state table.

### 1.2 Rotation primitive — `Rotate(p, n)` at 0x441b70
Performs **n−1** clockwise rotations (n=1 → unchanged).
One CW rotation: `newW = oldH, newH = oldW`;
```
new = ""
for col = 1..oldW:            // becomes new row
  for row = oldH downto 1:
     new += old[(row-1)*oldW + col]
piece = HH + WW + new          // header swapped
```
(T `020/222` → `20/22/20`, i.e. clockwise.)

### 1.3 Rotation keys (FormKeyDown 0x4501ee / 0x450338)
* "Rotate Piece Right" (default key UP, key code at [0x453790]) → `R = Rotate(cur, 2)` = 1× CW.
* "Rotate Piece Left" (default CONTROL, [0x453792]) → `R = Rotate(cur, 4)` = 3× CW = 1× CCW.

Placement rule (identical for both directions):
```
newX = PX + (oldW div 2) - (newW div 2)      // PY unchanged (top edge fixed)
if !Collides(newX, PY, R): PX=newX; cur=R; PlaySound(5); return
// "wall kick" — only a clamp into the field, nothing else:
if newX > W - newW + 1:
    newX = W - newW + 1
    if !Collides(newX, PY, R): PX=newX; cur=R; PlaySound(5)
else if newX < 1:
    newX = 1
    if !Collides(newX, PY, R): PX=newX; cur=R; PlaySound(5)
// otherwise rotation fails silently (no sound). No vertical kicks, no other offsets.
```

### 1.4 Collision — `Collides(x, y, piece)` at 0x441a44
```
if x + w - 1 > W or y + h - 1 > H or x < 1 or y < 1: return true
for each piece cell (r,c) != '0':
   if Fields[MyNum][(y+r-2)*W + (x+c-1)] != '0': return true
return false
```
Note: y < 1 always collides (pieces can never be above the field).

### 1.5 Place — `PlacePiece(piece, x, y, &field)` at 0x441d00
Writes every non-'0' piece cell into the field (overwrites whatever is there).

### 1.6 Piece selection — `NewPiece()` at 0x449a3c
```
FastDropping = 0; FastDropTimer.Enabled = false
// gravity interval, see §2
lvl = (AvgLevels == '0') ? Level : AvgLevel
droptimer.Interval = (lvl*10 < 1010) ? 1010 - lvl*10 : 1        // 16-bit arithmetic

function RandomPiece():
   d = PieceFreq[Random(100) + 1]          // char '1'..'7'
   return Rotate(Pieces[d], Random(4) + 1) // random initial orientation 0..3 CW turns

if NextPiece == "":            // first piece of a game
   CurPiece  = RandomPiece()   // RNG order: Random(100), Random(4)
   NextPiece = RandomPiece()   //            Random(100), Random(4)
else:
   CurPiece  = NextPiece
   NextPiece = RandomPiece()
DrawNextPiece()                 // 0x441ec8
PX = (W + 2) div 2 - (pieceW div 2)   // = 7 - w div 2 (I horiz → col 5, 3-wide → col 6, O → col 6)
PY = 1
if Collides(PX, PY, CurPiece): PlayerLost()     // the only "top-out" check at spawn
```

PieceFreq string construction (Form3 "Block Occurancy" dialog, 0x442ea0): concatenation, in this
exact order, of `StringOfChar(digit, percent)`:
`'3'×J%, '5'×Z%, '2'×O%, '4'×L%, '6'×S%, '7'×T%, '1'×I%`.
Defaults (Form3 DFM): I 15, O 15, J 14, L 14, Z 14, S 14, T 14 →
`"3"*14 + "5"*14 + "2"*15 + "4"*14 + "6"*14 + "7"*14 + "1"*15` (100 chars).
The server sends its string verbatim in `newgame`; clients use it as-is. (Image-to-edit mapping of
the dialog is inferred from vertical positions; digit→piece mapping itself is VERIFIED.)
Server refuses to start unless both freq strings are exactly 100 chars (0x44b856).

### 1.7 Game over detection
`PlayerLost()` (0x447148) is called when:
* spawn position collides (NewPiece);
* at lock time (gravity / soft-drop lock) no non-colliding row exists from PY up to row 1 (§2.4);
* hard drop finds collision already at row ≤ 1 (§2.3);
* Add Line special (`a`) or classic line add (`cs`) is applied while the top row(s) being pushed out
  contain any block (§5);
* client joined a game already in progress (`ingame`, 0x447414).

---------------------------------------------------------------------------------------------------

## 2. Timing

Timers are `TSuperTimer` (thread + `timeGetTime`; constructor 0x42eb54 default Interval = 1000,
Enabled = false). Timer phase: on Enabled := true the first fire is at now+Interval; afterwards
each fire schedules next = fireTime + Interval. Changing Interval does **not** restart the timer
(new value takes effect after the next fire).

| Timer | Interval | Handler |
|---|---|---|
| droptimer (Form1+0x1b0) | DFM 1010; set by NewPiece to `1010 − 10·lvl` (min 1) | 0x44a740 |
| FastDropTimer (+0x31c) | 100 ms | 0x44a9c0 |
| newpiecewait (+0x1b8) | **1000 ms** (TSuperTimer default; not in DFM, never changed in code) | 0x44a3e8 |
| GameEnd (+0x39c) | 1000 ms (server only, sudden death) | 0x44f4c8 |

Gravity: level 1 = 1000 ms/row, level 50 = 510 ms, level 100 = 10 ms, level ≥ 101 = 1 ms.
There is **no level cap** in the code (Level += LevelInc forever). droptimer runs continuously
from game start to game end; it is not reset when a piece spawns, so the first gravity step of a
new piece happens at an arbitrary phase.

Common gate for droptimer, FastDropTimer and FormKeyDown (0x44a75c):
`allowed = (!IsServer || ServerPlays) && !Paused` (and InGame for keys).

### 2.1 droptimer tick (0x44a740)
```
if !allowed or FastDropping: return
if CurPiece == "": FastDropping=0; FastDropTimer.Enabled=false; return
if !Collides(PX, PY+1): PY++; LockCnt = 0; redraw; return
if LockCnt <= 0: LockCnt++; redraw; return           // one-tick grace
LockPiece(sound=2)                                     // see 2.4
```
**Lock delay**: when the piece is resting, it locks on the *second* blocked gravity tick
(≈ one gravity interval of grace). `LockCnt` is a single global; it is reset only by a successful
gravity step (not by spawn, sideways moves, rotation or soft drop). Thus a new piece that cannot
fall on its very first gravity tick while LockCnt is still ≥1 from the previous piece locks
immediately. Moving/rotating during the grace tick does not extend it.

### 2.2 Soft drop ("Speed up Piece Falling", default DOWN, [0x453794])
KeyDown (0x450482): if FastDropTimer not already enabled:
`FastDropping = 1; if !Collides(PX,PY+1) PY++; FastDropTimer.Enabled = true`.
KeyUp (0x450d9c): `FastDropTimer.Enabled = false; FastDropping = 0`.
FastDropTimer tick (0x44a9c0), every 100 ms while key held:
```
if CurPiece == "": FastDropping=0; disable; return
if !Collides(PX,PY+1): PY++   (LockCnt NOT touched)
else LockPiece(sound=2)       // NO grace when soft-dropping
```
While FastDropping, droptimer does nothing. OS key auto-repeat re-fires KeyDown but it is ignored
because the timer is already enabled.

### 2.3 Hard drop ("Drop Pieces", default SPACE, [0x453796]) — 0x4504e3
```
lost = true
for y = PY to H:
   if Collides(PX, y):
       if y <= 1: break               // lost stays true
       lost = false; PY = y - 1; break
   else if y == H:                    // only possible for height-1 piece at bottom row
       lost = false; PY = H
if lost: PlayerLost(); return
PlaySound(1)
PlacePiece(CurPiece, PX, PY)          // quirk: if piece was already overlapping, it is placed
CurPiece = ""                         //   at PY-1 without re-checking
CheckLines(false); send field diff; newpiecewait.Enabled = true
FastDropping = 0; FastDropTimer.Enabled = false
```
No lock delay; sound 1 only (no sound 2).

### 2.4 LockPiece (inline in 0x44a7dc and 0x44aa3b)
```
// pieces can be overlapped by specials applied while falling; push up to find a free spot:
atTop = false
for y = PY downto 0:
   if y == 0: atTop = true
   if !Collides(PX, y): PY = y; break       // y=0 always collides
if atTop: PlayerLost(); return
PlaySound(2)
PlacePiece(CurPiece, PX, PY); CurPiece = ""
CheckLines(false)
send "f MyNum <diff>"
newpiecewait.Enabled = true                  // next piece after 1000 ms
FastDropping = 0; FastDropTimer.Enabled = false
```
newpiecewait tick (0x44a3e8): `if InGame { newpiecewait.Enabled=false; NewPiece(); redraw }`
(it does not check Paused).

### 2.5 Left / right (0x450180)
`if !Collides(PX∓1, PY): PX∓=1` — no sound. Key repeat = Windows keyboard auto-repeat (KeyDown
re-fires); TetriNET has no own DAS/ARR. Exact OS repeat delay/rate: **UNVERIFIED** (OS setting).
All movement keys are ignored while `CurPiece == ""` (i.e. during the 1 s newpiecewait), but
special-use keys still work.

Default keys (Form1 Key Configuration): rotate right = UP, rotate left = CONTROL, soft drop = DOWN,
hard drop = SPACE, left = LEFT, right = RIGHT. Fixed keys: `1`..`6` use special on player n,
`D` discard special, `T` open game-chat box (Form2 msgbox), Esc closes it.

---------------------------------------------------------------------------------------------------

## 3. Line clear, counting, levels — `CheckLines(noCredit)` at 0x44931c

```
lines = 0; S = ""                               // specials found in cleared rows
for y = 1 to H:                                  // top to bottom
   if row y has no '0':
       lines++
       for x = 1..W: if cell is special: S += cell     // left→right
       delete row y; insert an empty row at the top   // rows above shift down 1
if lines == 0: redraw; return
if noCredit: S = ""
PlaySound(lines >= 4 ? 4 : (S != "" ? 6 : 3))
if noCredit: lines = 0
// inventory gain
for each char c in S (in order):
   repeat lines times:
      if Length(Inventory) != SpecialCapacity:
          pos = Random(Length(Inventory) + 1) + 1
          if pos <= Length(Inventory): Insert(c, Inventory, pos) else Inventory += c
DrawInventory()
// counters, level, field specials
repeat lines times:
   TotalLines++
   if TotalLines mod LinesPerLevel == 0: Level += LevelInc
   if TotalLines mod LinesPerSpecial == 0: AddSpecials(SpecialsAdded)
// classic line sending (only if Classic == '1')
if Classic == '1':
   if lines <= 1: lines = 0
   else: if lines == 2: lines = 1; else if lines == 3: lines = 2   // 4 stays 4
   if lines > 0: send "sb 0 cs<lines> <MyNum>" (client→server; server→all sockets)
   if lines > 0: AttackNo++; log "<AttackNo>. \x02\x13<lines> Line[s] Added to All\x13\x02 from \x02\x11<MyNick>"
                 ("s" appended iff lines != 1)
// averaged levels
if AvgLevels == '1':
   client: send "lvl <MyNum> <Level>"                    (every time lines>0)
   server (if ServerPlays): Levels[MyNum]=Level; a=AvgLevelCalc(); if a != AvgLevel:
           AvgLevel=a; send "lvl <MyNum> <Level>" to every connected, alive player
redraw
```
So: a single clear credits each special in each cleared row `lines` times (e.g. a 3-line clear
containing one `n` gives 3 `n`s). Specials in cleared rows go to inventory (unless full); they
are not otherwise triggered. Inventory capacity check is `!=` (skip when exactly full).

`AvgLevelCalc` (0x4459ac): integer mean (truncating) of `Levels[p]` over players that have a nick
and are not Dead; 0 if none.

Line sound: 3 (normal), 6 (any cleared line contained a special), 4 (≥4 lines, takes precedence).

---------------------------------------------------------------------------------------------------

## 4. Special blocks

### 4.1 Adding specials to own field — `AddSpecials(count)` at 0x44756c
Called after line clear (above), on the post-clear field.
```
snap = copy of Fields[MyNum]
L = list of (x,y) for every cell of snap that is a normal block '1'..'5',
    scanned y = 1..H, x = 1..W
repeat count times:
   if L not empty:
       k = Random(len(L)) + 1                       // uniform over remaining normal blocks
       (x,y) = L[k]
       d = SpecialFreq[Random(100) + 1]             // '1'..'9'  ('A' would mean 10 – unused)
       Fields[MyNum][(y-1)*W + x] = "acnrsbgqo"[d]
       remove L[k]                                   // never picks the same cell twice
   else:                                             // field has no normal blocks
       x = Random(W)                                 // 0-based
       d = SpecialFreq[Random(100) + 1]
       Fields[MyNum][(H-1)*W + x + 1] = "acnrsbgqo"[d]   // bottom row, even if empty
```
RNG order per special: position random first, then type random.

SpecialFreq construction (0x4430d8): `'1'×a%, '2'×c%, '3'×n%, '4'×r%, '5'×s%, '6'×b%, '7'×g%,
'8'×q%, '9'×o%`; digit d ↦ `"acnrsbgqo"[d]`. Defaults (Form3 DFM): a 19, c 16, n 3, r 14, s 3,
b 14, g 6, q 11, o 14 (=100).

### 4.2 Inventory
* Gained only via CheckLines (§3); random insertion position as shown.
* Capacity = SpecialCapacity (max 18; the bar draws 18 slots of 16 px).
* Position 1 is the active special.
* **Discard** `D` (0x45069e): if Inventory != "" and alive and InGame: `Inventory = Copy(Inventory, 2, 800)`.
* Nothing else removes or reorders the inventory; inventory is cleared at game start.

### 4.3 Using a special — keys `1`..`6` (0x4506e2..0x450cb3)
```
target = key digit; valid only if Nick[target] != "" and !Dead[target]
require Inventory != "" and !Dead[MyNum] and InGame and !Paused
c = Inventory[1]
if target == MyNum:
    if c != 's': ApplySpecial(c)       // own effect applied immediately; 's' on self = no-op
    AttackNo++; log "<n>. \x02\x13<Name(c)>\x13\x02 on \x02\x11<MyNick>\x11\x02 from \x02\x11<MyNick>"
    send "sb <MyNum> <c> <MyNum>"
    send "f <MyNum> <diff>"
else:
    send "sb <target> <c> <MyNum>"
    if c == 's': SwitchWith(target)    // local half of the switch (§5.5)
    AttackNo++; log "<n>. \x02\x13<Name(c)>\x13\x02 on \x11<TargetNick>\x11 from \x02\x11<MyNick>"
Inventory = Copy(Inventory, 2, 800)
DrawInventory()
```
Special names (FormCreate 0x449eeb): a "Add Line", c "Clear Line", n "Nuke Field",
r "Random Blocks Clear", s "Switch Fields", b "Clear Special Blocks", g "Block Gravity",
q "Blockquake", o "Block Bomb".
Specials can be used on teammates (no team check for targeted specials).

### 4.4 Receiving `sb` (parser 0x44c4b1)
`sb <target> <special> <sender>`
* target == MyNum and I am a player: if !Dead[MyNum]: `s = special; if s == "s": s += sender`;
  `ApplySpecial(s)`; log `"<n>. \x02\x13<Name>\x13\x02 on \x02\x11<MyNick>\x11\x02 from \x11<SenderNick>"`.
* special starts with `cs` (classic lines, target 0): log
  `"<n>. \x02\x13<k> Line[s] Added to All\x13\x02 from \x11<SenderNick>"`; if I'm an alive player
  and (Team[sender]=="" or Team[me]=="" or upper(Team[sender]) != upper(Team[me])) → ApplySpecial.
* target == 0 and special not `cs` (sudden death `sb 0 a 0`): if alive → ApplySpecial, no log.
* other target: log `"<n>. \x02\x13<Name>\x13\x02 on \x11<TargetNick>\x11 from \x11<SenderNick>"`.
* Server relays the message unchanged to every socket except the sender's.

`ApplySpecial(s)` (0x448e40) dispatch: a→0x447bdc, c→0x447fb4, n→0x448164, r→0x4482d0,
`s<d>`→SwitchWith(d) 0x448644, b→0x448420, g→0x447968, q→0x4488b8, o→0x448b88,
`cs<k>`→ClassicAddLines(k) 0x447d90. Every effect ends with redraw and sending
`f <MyNum> <diff>` (a/cs send nothing extra if they caused a loss — PlayerLost sends the field).

---------------------------------------------------------------------------------------------------

## 5. Special effect algorithms (own field F, all on Fields[MyNum])

### 5.1 `a` Add Line (0x447bdc)
```
ok = top row (cells 1..W) all '0'
row = GenGarbage(1)          // one row: each cell = char('0'+Random(6)) i.e. '0'..'5',
                             //  then cell[Random(W)+1] = '0' (guaranteed hole)
F = F[W+1 .. end] + row      // drop top row, append at bottom (everything moves up)
redraw
if !ok: PlayerLost() else send field
```
Junk row RNG order: W × Random(6) (left→right), then Random(W). The row can contain several
empty cells (each cell 1/6 chance) plus the forced hole. The falling piece is not moved.

### 5.2 `c` Clear Line (0x447fb4)
`F = "0"*W + F[1 .. W*H-W]` — bottom row removed, everything shifts down one row. No line check,
no special credit.

### 5.3 `n` Nuke Field (0x448164)
`F = "0" * (W*H)`.

### 5.4 `r` Clear Random Blocks (0x4482d0)
`repeat 10: F[Random(W*H) + 1] = '0'` — may hit empty cells or the same cell twice.

### 5.5 `s` Switch Fields — `SwitchWith(other)` (0x448644)
```
Fields[MyNum] = Fields[other]                 // take my local copy of other's field
Fields[MyNum] = Lower(Fields[MyNum]); redraw; send "f MyNum <diff>"
Fields[other] = Fields[MyNum]                 // local display only (quirk, see note)
Fields[other] = Lower(Fields[other]); redraw other
Lower(F):  h = Height(F)
           if h > 16: k = h - 16; F = "0"*(k*W) + F[1 .. W*H - k*W]   // shift DOWN k rows,
           return F                                                    //  bottom k rows deleted
Height(F) (0x4485b0): i = index of first non-'0' cell (1-based); 0 if none;
                      row0 = (i-1) div W; return H - row0
```
Both sides perform their half: the user calls SwitchWith(target) locally right after sending
`sb target s me`; the target receives it and calls SwitchWith(sender). Because each side only
transmits its own field, the result is a correct swap. Quirk: the originator's *display* of the
target shows the originator's new field until the target's `f` update arrives. Max height after
switch = 16 rows (top 6 rows empty). Port recommendation: do a proper swap.

### 5.6 `b` Clear Special Blocks (0x448420)
For every cell i = 1..W*H in order: if cell is a letter (StrToIntDef(cell,-1) == -1):
`cell = char('0' + Random(5) + 1)` → specials become random normal blocks '1'..'5' (not removed).

### 5.7 `g` Block Gravity (0x447968)
Per column x = 1..W: compact all non-'0' cells to the bottom, preserving order (implemented as
repeatedly removing the lowest empty cell below the highest "floating" block). Specials fall too.
Then `CheckLines(noCredit = true)`: full rows are removed (sound 3 or 4 plays) but **no** lines are
counted, no level progress, no specials credited/added, no classic lines sent. Then send field.

### 5.8 `q` Blockquake (0x4488b8)
`Q = "3222111111100000000000"` (22 chars: P(0)=11/22, P(1)=7/22, P(2)=3/22, P(3)=1/22)
```
for y = 1 to H:
   dir = Random(2)                         // RNG order per row: Random(2) then Random(22)
   d   = int(Q[Random(22) + 1])
   if d == 0: continue
   if dir == 0:                            // shift row LEFT by d
       for x = d+1 to W: cell(x-d, y) = cell(x, y); cell(x, y) = '0'
       // cells in columns 1..d are overwritten (lost off the left edge)
   else:                                   // shift row RIGHT by d
       for x = W-d downto 1: cell(x+d, y) = cell(x, y); cell(x, y) = '0'
       // cells in columns W-d+1..W are lost off the right edge
```
Note: the random is drawn even for empty rows. No line check afterwards.

### 5.9 `o` Block Bomb (0x448b88)
```
loop:
   found = false
   scan y = 1..H, x = 1..W for first cell == 'o':
      found = true
      cell(x,y) = '0'
      x0 = max(x-1, 1); if x0+2 > W: x0 = W-2
      y0 = max(y-1, 1); if y0+2 > H: y0 = H-2
      for yy = y0..y0+2: for xx = x0..x0+2:          // always a full 3×3 window, clamped inside
          src = (yy-1)*W + xx
          dst = Random(W*H - 6*W) + 1 + 6*W           // random cell in rows 7..22 (1-based idx)
          F[dst] = F[src]; F[src] = '0'               // empty cells are "scattered" too
      break out of scan (restart from top)
   if !found: exit loop
send field
```
Consequences: each bomb clears its 3×3 area (including the bomb itself, already '0') and drops
the 9 cell values onto random positions in the lower 16 rows, overwriting what is there (an
empty value overwrites a block). Scattered `o` blocks explode later (chain reaction). Copying to
`dst == src` leaves the cell empty. No line check afterwards.

### 5.10 Classic mode lines — `cs<k>` → ClassicAddLines(k) (0x447d90)
```
ok = first k*W cells (top k rows) all '0'
junk = ""
repeat k:
   row = W × char('0' + Random(5) + 1)      // all cells filled '1'..'5'
   row[Random(W) + 1] = '0'                  // exactly one hole
   junk += row                               // first generated row ends up highest
F = F[k*W+1 .. end] + junk
redraw; if !ok: PlayerLost() else send field
```
Sender mapping in CheckLines: 1 line → nothing, 2 → 1, 3 → 2, 4 → 4. Recipients: every alive player
except the sender, excluding the sender's teammates (§4.4). Classic mode does not disable
specials (specials keep being added per §4.1 if SpecialsAdded > 0).

---------------------------------------------------------------------------------------------------

## 6. Game start / sudden death / losing / winning

### 6.1 Starting garbage — `GenGarbage(h, onlyRows)` (0x442d40)
```
F = "0"*(W*H)
for y = H-h+1 to H:                           // top garbage row first
    for x = 1..W: F[y][x] = char('0' + Random(6))   // '0'..'5'
    F[y][Random(W) + 1] = '0'                        // forced hole
return onlyRows ? F[(H-h)*W+1 ..] : F
```
At game start every player sets `Fields[MyNum] = GenGarbage(StackHeight, false)` where
StackHeight is the per-player value the server sent in that player's `newgame` message.

### 6.2 Game start sequence (0x445a10, both server and client)
PlaySound(10). Server reads settings from UI. Then on all: NextPiece=CurPiece="", TotalLines=0,
Paused=0, Level=StartLevel, Inventory="", AttackNo=0, clear attack log, for p=1..6:
`Levels[p]=StartLevel, Dead[p]=0, Fields[p]=empty` (LastSent is NOT reset — see §7.3 quirk).
Server sends `newgame` to every connected socket (with that player's stack height).
`AvgLevel = (AvgLevels=='1') ? AvgLevelCalc() : 0`. If this machine plays: own garbage field,
send `f`, InGame=1, droptimer on, NewPiece() immediately (no 1 s wait). Log
`"\x14*** The Game Has \x02Started\x02"`. Server with SD minutes != "0": GameEnd timer on (1000 ms),
SD counter [0x453f9c] = 0.

### 6.3 Sudden death (server GameEnd tick 0x44f4c8, every 1000 ms; disabled while paused)
```
secs++
if secs >= minutes*60 and secs mod seconds == 0:
    if ServerPlays and !Dead[1]: ApplySpecial("a")          // server is player 1
    send "sb 0 a 0" to every connected socket whose player is alive
```
Clients apply `a` (Add Line, §5.1 junk with random holes) on receipt with no log line.

### 6.4 Losing — PlayerLost (0x447148)
```
Dead[MyNum]=1; PlaySound(8)
newpiecewait, FastDropTimer, droptimer disabled; CurPiece = NextPiece = ""; redraw next box
for i = 1..W*H: F[i] = char('0' + Random(5) + 1)     // whole field filled with random colours
send "f MyNum <diff>"
client: send "playerlost <MyNum>"
server: LossOrder += MyNum; send "playerlost <MyNum>" to all sockets; CheckWinner();
        if no other players are connected at all: EndGame()
```

### 6.5 Winner detection — 0x442074 (server calls via CheckWinner 0x44703c after every loss)
```
alive = players with Nick != "" and !Dead, in number order; total = players with Nick != ""
first = alive[0]; mixed = any other alive p with (Team[p]=="" or Team[first]=="" or
                                                 upper(Team[p]) != upper(Team[first]))
winner = (!mixed and first != 0 and len(alive) != total) ? first : 0
```
On winner: server sends `playerwon <winner>` to all, plays sound 7 if it is the winner,
`LossOrder += winner`, winlist `incwins`, EndGame(). Client on `playerwon p`: sound 7 if p == me
or same (non-empty, case-insensitive) team. Solo game (1 player) never produces a winner; it ends
via the "no other players" path.

### 6.6 EndGame (0x446d08)
InGame=0; all timers off; button captions reset; log `"\x14*** The Game Has \x02Ended\x02"`;
CurPiece=NextPiece=""; server sends `endgame` to all sockets. **If there was no winner, all six
fields are cleared to empty; if there was a winner, fields are left as they are.**
Header panels show `"<n>. <nick> WON!"` for the winner and his teammates.

### 6.7 Winlist scoring (`incwins`, 0x441456)
Walk `LossOrder` from the END (winner first, then last to die, …). For each player:
key = `"t" + Team[p]` if team non-empty else `"p" + Nick[p]`. Skip keys already seen (compared
upper-case) and skip key `"p"` (empty nick). The 1st distinct key gets **3** points, 2nd **2**,
3rd **1**, then stop. Each award: remove existing entry for the key (case-insensitive), add points,
re-insert into the list sorted descending (inserted before the first entry with fewer points;
appended at end only if fewer than 10 entries). Stored as space-separated `key;points` tokens and
broadcast as `winlist <tokens>`. Display shows top 10; team keys displayed with `<T> ` prefix.
LossOrder is then cleared.

---------------------------------------------------------------------------------------------------

## 7. Network protocol

TCP port 31457. Every message is ASCII text terminated by byte **0xFF** (0x440b7c); long messages
are written in 250-byte chunks. Words are space separated; parser indexes words 1-based
(`Word(1)` = command). Server is authoritative relay; clients only talk to the server.

### 7.1 Login (encrypted, client → server)
Client builds `"tetrisstart <nick> 1.13"` and encodes it with key `K = str(h) + str(h)`,
`h = 54*ip1 + 41*ip2 + 29*ip3 + 17*ip4` of the **server's** IP address (dots → spaces, 0x44d4af).
Encode (0x43c89c, mode 'E'):
```
salt = Random(256) (after Randomize); out = hex2(salt); prev = salt; j = 0
for each char ch: v = ((ord(ch) + prev) mod 255) XOR ord(K[j % len(K)]); j++
                  out += hex2(v); prev = v           // hex2 = "%1.2x" lowercase, 2 digits
```
Decode ('D'): `prev = hex(0..1)`; for each subsequent hex pair v: `c = v XOR K[j]`;
`ch = (prev >= c) ? c + 255 - prev : c - prev`; prev = v.
Server decodes with its own local IP. Replies on failure: `noconnecting Server is full!`,
`noconnecting Nickname already exists on server!`,
`noconnecting TetriNET version (<v>) does not match Server's (1.13)!`,
`noconnecting You are banned from server!`. (A web port may drop the encryption.)

On successful join of player n (slot = first free 1..6) the server sends to the new client:
`winlist <tokens>`, `playernum <n>`, `playerjoin 1 <serverNick>` (if server plays),
`playerjoin <i> <nick>` and `team <i> <team>` for every other player, `f <i> <fullfield>` for
every other player; if a game is running: `ingame`, `pause 0|1`, `playerlost <i>` for every dead
player (and the newcomer is marked dead). To all other clients: `playerjoin <n> <nick>`.
Client answers `playernum` by sending `team <MyNum> <team>` (0x440c44).

### 7.2 Message list

| Message | Direction | Semantics |
|---|---|---|
| `tetrisstart <nick> <ver>` | C→S (encrypted) | login |
| `noconnecting <text>` | S→C | refusal; client disconnects and shows text |
| `playernum <n>` | S→C | your number |
| `playerjoin <n> <nick>` | S→C | player n present (resets that player's team, field display) |
| `playerleave <n>` | S→C | player n left (field/nick/team cleared; log `"\x0c*** \x02<nick>\x02 has Left"`) |
| `kick <n>` | S→C | player n kicked (nick set to " kicked") |
| `team <n> <name>` | C→S→others | team change; empty name = alone |
| `pline <n> <text>` / `plineact <n> <text>` | both | party-line chat / action; n=0 shows "Server"; relayed to all but sender |
| `gmsg <text>` | both | in-game chat (`<nick> text` or `* nick text`); plays sound 9; server relays to all |
| `startgame 1 <n>` / `startgame 0 <n>` | C→S | start / stop request; accepted only from the moderator (lowest-numbered present player) |
| `newgame <h> <startLvl> <linesPerLvl> <lvlInc> <linesPerSpecial> <specialsAdded> <capacity> <pieceFreq100> <specialFreq100> <avg01> <classic01>` | S→C | start; `h` = this recipient's own stack height |
| `ingame` | S→C | game already running → client immediately PlayerLost (spectates) |
| `pause <0|1>` | S→C ; `pause <0|1> <n>` C→S | pause toggle (moderator only); stops GameEnd timer on server |
| `endgame` | S→C | EndGame() |
| `f <n> <data>` | both | field update of player n, relayed to all but n |
| `sb <target> <special> <sender>` | both | special/attack; target 0 = everyone; `special` = letter or `cs1`/`cs2`/`cs4` |
| `lvl <n> <level>` | C→S→alive | level report (only sent when averaging on); updates Levels[n] and AvgLevel |
| `playerlost <n>` | both | player n lost |
| `playerwon <n>` | S→C | round winner |
| `winlist <key;pts> ...` | S→C | winlist replacement |

### 7.3 Field encoding (`f`) — FieldDiff 0x44a548 / Apply 0x44a410
Full form: the raw W*H (=264) char field string.
Diff form, built against `LastSent[MyNum]` (then `LastSent = Fields`):
```
groups[t] for t in "012345acnrsbgqo" (15 types)
for y=1..H, x=1..W: if F[y][x] != LastSent[y][x]:
    groups[type] += chr(x + 0x32) + chr(y + 0x32)     // x:'3'..'>' , y:'3'..'H'
out = concat over t=1..15 with non-empty group of chr(0x20 + t) + group
     // '!'=empty '"'=1 '#'=2 '$'=3 '%'=4 '&'=5 '\''=a '('=c ')'=n '*'=r '+'=s ','=b '-'=g '.'=q '/'=o
send diff if Length(out) < W*H else send full field (an empty diff "f n " is sent as-is)
```
Decode: if len == W*H → full replace; else walk: byte < '3' → set current type
`"012345acnrsbgqo"[b-0x21]`; else `x=b-0x32, y=next-0x32`, set cell, advance 2.
Quirk: LastSent is never reset between games while receivers reset their copies to empty at
`newgame`, so cells unchanged since the previous round are not transmitted at the next start
(display glitch). Port recommendation: send a full field at game start.

---------------------------------------------------------------------------------------------------

## 8. Playing-fields window (Form2) drawing

* Own field: slot 1, 16×16 px tiles, field canvas at (1,20), 192×352. Header Panel1 (1,2,192×18,
  clSilver). Other players: 8×8 px tiles (96×176) at slots 2..6 = (304,20), (403,20), (502,20),
  (403,218), (502,218), headers Panel2/3/5/16/14 above them (96×18, "Small Fonts" 8px).
  Slot of player p: own → 1; p < MyNum → p+1; p > MyNum → p.
* Header text (0x4423b8): `"<p>. <nick>"` + `" WON!"` (winner/winner's team, only when >1
  player present), or `"Not Playing"` when slot empty.
* Team name is drawn on the field canvas at (1,1), Arial 7, white, if Team[p] != "" (0x442c17).
* Tiles come from the graphics bitmap: big tile for char c: x = idx*16, y 0..15; small tile:
  x = idx*8, y 16..23, idx = position in `"12345acnrsbgqo"` − 1. Empty cells copy the background
  bitmap (big field background at y+24, small field background at x+W*16, y+24).
* Next Piece box (cnextpiece 217,37, 64×66): next piece drawn at top-left of a 6×6 grid of 16-px
  tiles (no centering).
* Labels: Lines (linescap) = TotalLines, Level (levelcap) = own Level; "Active Level:" panel shown
  only when AvgLevels == '1' and shows AvgLevel.
* Inventory bar (sbpb, 110,378, 288×16): 18 slots of 16 px, filled with special tiles left→right,
  empty slots black. A red/grey 3-pixel frame (PaintBox1) highlights slot 1. Description label
  (Label22, 1,380): `"No Special Blocks"` or `"<Special Name>:"` for Inventory[1].
* Attacks/Defenses log (`attacks` rich edit 197,204): lines formatted as in §3/§4
  (`\x02` = bold toggle; `\x11`, `\x13`, `\x14`, `\x0c`, `\x10`, `\x1f` are TSRichEdit colour /
  underline control codes — exact colours **UNVERIFIED**).
* Game messages (Label3, black bar at bottom) show `gmsg` lines; `T` opens msgbox input.

Sounds (0x44071c index): 1 hard drop, 2 piece locks (gravity/soft), 3 line(s), 4 four+ lines,
5 rotate success, 6 lines containing special, 7 won, 8 lost, 9 gmsg arrives, 10 game start.

---------------------------------------------------------------------------------------------------

## 9. UNVERIFIED / caveats
1. OS keyboard auto-repeat delay/rate for left/right/rotate (TetriNET relies on Windows repeat).
2. Piece-frequency dialog edit ↔ piece picture mapping (inferred from row order: J,Z,O,L,S,T,I);
   the digit→piece mapping and string order are verified.
3. newpiecewait = 1000 ms comes from the TSuperTimer constructor default (0x42eb74) plus absence
   of an Interval property in the DFM and of any runtime change; not observed at runtime.
4. Max StartLevel (TUpDown default max assumed 100); no in-game level cap exists in code.
5. Exact rich-edit colour codes for log lines; exact pixel positions of the 5 small fields' x
   offsets are from Form2.FormCreate SetBounds calls (0x44fcc4) — slot 1 left offset assumed 1.
6. Server-not-playing corner cases and kick/ban UI not fully traced (not gameplay relevant).

---------------------------------------------------------------------------------------------------

## 10. UI text & formatting

### 10.1 TSRichEdit control codes (`AddLine` 0x43a688, code handler 0x43a2a4)
`AddLine(text)`: remembers current font style+colour, clears a colour stack (TStringList at
+0x1a0) and pushes the current (default) colour; moves caret to end (EM_SETSEL 0xB1); walks the
text: every byte contained in the set
`03 04 05 06 08 0B 0C 0E 0F 10 11 12 13 14 15 17 18 19 1A 1B 02 16 1F` (string at 0x43a888)
flushes the pending plain text (EM_REPLACESEL 0xC2, in 250-byte chunks, 0x43a5b4) and is then
handled as below; all other bytes are text. Finally appends `"\r\n"` and restores the saved
style and colour. So formatting never leaks between lines; the codes themselves are not shown.

Style toggles (XOR on the current font style, bits from 0x43a5a8):
| byte | effect |
|---|---|
| 0x02 | toggle **bold** |
| 0x16 | toggle *italic* |
| 0x1F | toggle underline |

Colour codes (jump table 0x43a2dd; TColor is 0x00BBGGRR; RGB given as #RRGGBB):
| byte | TColor | RGB | Delphi name |
|---|---|---|---|
| 0x03 | 0xFFFF00 | #00FFFF | clAqua |
| 0x04 | 0x000000 | #000000 | clBlack |
| 0x05 | 0xFF0000 | #0000FF | clBlue |
| 0x06 | 0x808080 | #808080 | clGray |
| 0x08 | 0xFF00FF | #FF00FF | clFuchsia |
| 0x0B | 0x808080 | #808080 | clGray |
| 0x0C | 0x008000 | #008000 | clGreen |
| 0x0E | 0x00FF00 | #00FF00 | clLime |
| 0x0F | 0xC0C0C0 | #C0C0C0 | clSilver |
| 0x10 | 0x000080 | #800000 | clMaroon |
| 0x11 | 0x800000 | #000080 | clNavy |
| 0x12 | 0x008080 | #808000 | clOlive |
| 0x13 | 0x800080 | #800080 | clPurple |
| 0x14 | 0x0000FF | #FF0000 | clRed |
| 0x15 | 0xC0C0C0 | #C0C0C0 | clSilver |
| 0x17 | 0x808000 | #008080 | clTeal |
| 0x18 | 0xFFFFFF | #FFFFFF | clWhite |
| 0x19 | 0x00FFFF | #FFFF00 | clYellow |
| 0x1A, 0x1B | — | — | swallowed, no effect (in the set but outside the table) |

Colour semantics = **stack/toggle**: if the code's colour equals the *current* colour, the
previous colour is popped from the stack and restored (closing tag); otherwise the current
colour is pushed and the new colour set (opening tag). E.g. `"\x02\x13Add Line\x13\x02"` =
bold purple "Add Line", then back to default. Default text colour = control's Font.Color
(clWindowText = black) and style regular, except rewinlist (see 10.5).
Chat input boxes (key handler 0x44f100): Ctrl+B inserts 0x02, Ctrl+I 0x16, Ctrl+U 0x1F.

### 10.2 Every generated line (exact bytes; `\xNN` = control byte)
Partyline box = Form1 `SRichEdit1` (+0x214). Attacks box = Form2 `attacks` (+0x210).
Game-message bar = Form2 `Label3` (+0x224, plain TLabel, codes not interpreted).

| Event | Text | Where | Addr |
|---|---|---|---|
| player joins (server side & `playerjoin` on clients) | `\x0c*** \x02<nick>\x02 is Now Playing` | partyline | 44b0c3, 44bdf1, 44df09 |
| player leaves | `\x0c*** \x02<nick>\x02 has Left` (suppressed if nick = " kicked") | partyline | 44c35f, 44dfb8, 44e5cf |
| other player kicked | `\x0c*** \x02<nick>\x02 Has Been Kicked` | partyline | 44bafd, 44dd97, 44e256 |
| you were kicked | `\x0c*** \x02You\x02 Have Been Kicked` | partyline | 44ba6b |
| team set | `\x10*** \x02<nick>\x02 is Now on Team \x02<team>\x02` | partyline | 440db6, 44b702 |
| team cleared | `\x10*** \x02<nick>\x02 is Now Alone` | partyline | 440dfa, 44b740 |
| game started | `\x14*** The Game Has \x02Started\x02` | partyline | 446152 |
| game ended | `\x14*** The Game Has \x02Ended\x02` | partyline | 446e21 |
| joined mid-game (`ingame`) | `\x14*** The Game is in \x02Progress\x02` | partyline | 4474d9 |
| server started (host) | `\x0c*** Server has Started` | partyline | 4465e6 |
| server shut down (host, and clients on server disconnect) | `\x0c*** Server has Shut Down` | partyline | 4469c1, 44e744 |
| pline (own echo & received) | `\x02<\x1f<nick>\x1f>\x02 <text>` | partyline | 44eb00, 44c243 |
| plineact (`/ME text`) | `\x13* \x02<nick>\x02 <text>` | partyline | 44e9b9, 44c054 |
| special used on self | `<n>. \x02\x13<Name>\x13\x02 on \x02\x11<me>\x11\x02 from \x02\x11<me>` | attacks | 4508b9 |
| special I used on X | `<n>. \x02\x13<Name>\x13\x02 on \x11<X>\x11 from \x02\x11<me>` | attacks | 450c95 |
| special received on me | `<n>. \x02\x13<Name>\x13\x02 on \x02\x11<me>\x11\x02 from \x11<sender>` | attacks | 44c62a |
| special between others | `<n>. \x02\x13<Name>\x13\x02 on \x11<target>\x11 from \x11<sender>` | attacks | 44c926 |
| classic lines I sent | `<n>. \x02\x13<k> Line[s] Added to All\x13\x02 from \x02\x11<me>` | attacks | 4497f9 |
| classic lines received | `<n>. \x02\x13<k> Line[s] Added to All\x13\x02 from \x11<sender>` | attacks | 44c765 |
| gmsg | `<nick> text` / `* nick text` (no codes) | Label3 bar | 440830 |

Notes: pline/plineact name = `Server` and number 0 when the host is not playing
(0x44e94f, `pline 0 …`); receivers also map number 0 → `Server` (0x44bfe2, 0x44c1d1). `/ME`
detection: first word upper-cased == `/ME` and a space follows; the rest becomes the act text.
`<n>` = running AttackNo (reset each game). There is no pause/unpause text line; pausing only
changes the button caption (`Pause Game` ↔ `Unpause Game`). When a partyline line arrives
while the partyline page is not visible, Form1 Panel11 font colour is set to clGreen (0x008000)
as an "unread" indicator (e.g. 0x44b0e7). Received gmsg also plays sound 9.

### 10.3 Game-message bar (Label3) — 0x440830
Plain label 595×43, black background, white Arial 11px, cleared at game start (0x445da3).
Keeps exactly **3 lines**:
```
if Caption == "": Caption = " \r \r" + msg          // two blank-ish lines, msg at bottom
else:            Caption = Copy(Caption, Pos("\r", Caption)+1, …) + "\r" + msg  // drop oldest
```
Newest line is at the bottom; each message scrolls the others up by one.
Sending (Form2 msgbox, 0x451070, only while InGame): Enter sends `gmsg <nick> <text>` or
`gmsg * <nick> <rest>` for `/ME`; the host displays it locally and sends to all sockets, a client
only sends to the server (server re-broadcasts to everyone including the sender). Nick =
`Server` if the host is not playing. When the typed text gets wider than the box, Enter is
simulated automatically (0x451381).

### 10.4 Pause and moderator rules
* Moderator = lowest-numbered present player (`0x44080c(n)`: no nick in slots 1..n-1). Host is
  always allowed. Only the moderator/host gets the Start and Pause buttons enabled
  (0x4421ec, 0x445cb1); the server enforces it for `startgame` and `pause` (0x44b5b4, 0x44b83c).
* Start: host not playing needs ≥2 players; freq strings must be 100 chars; not already InGame.
* Pausing (host button 0x44f2d8 or accepted `pause 1 <n>`): host sets Paused, disables the
  sudden-death GameEnd timer and broadcasts `pause 1`; clients set Paused=1 and caption
  `Unpause Game`. Paused blocks droptimer, FastDropTimer and all game keys (incl. specials);
  newpiecewait still fires (a piece may spawn while paused). No text shown, no field overlay.
  Unpause = same with 0 (GameEnd re-enabled).

### 10.5 Player list (Form1 ListBox1, 0x4421ec) and Label15
Rebuilt on every join/leave/team change. One item per present player in slot order:
`[*]<n>. <nick>` or `[*]<n>. <nick> - <team>`; `*` prefixes only the first (moderator) entry.
Label15 (above the list, host only, 0x44f27f): on selecting a list item shows
`IP: <remote address>` of that player's socket.

### 10.6 Winlist display (`rewinlist`, 0x44102e)
Whole control set bold. Lines cleared, then for entry i = 1..10 (tokens of the winlist string):
an empty line, then `<colour><padding><T-prefix>\x1f<name>\x1f with <pts> point[s]`
* `<T-prefix>` = `<T> ` for team keys (`t…`), empty for players; name = key without first char.
* `s` omitted when pts == "1".
* colour: entry 1 `\x14` (red), entries 2–3 `\x10` (maroon), entries 4–10 none (black).
* padding (0x440ed8): spaces added until TextWidth(spaces) ≥ ControlWidth/2 − TextWidth(line)/2
  using the control's font in bold — i.e. visually centred.
Note the colour code is not closed; it is reset at end of line by AddLine.

### 10.7 Field headers, team label, Active Level
* Header panels: Panel1 (own) colour clSilver, others clBtnFace; font "Small Fonts" 8 px,
  clBlack; text per §8 (`<n>. <nick>[ WON!]` / `Not Playing`). No runtime colour changes.
* Team name: drawn on the field canvas with TextOut at (1,1), font Arial size 7, colour
  clWhite (0xFFFFFF), brush style set via 0x419b30(0) (bsSolid, UNVERIFIED brush colour) — only
  if Team[p] != "" (0x442c17).
* Active Level: `avglevelpan` (Form2 199,160) is made visible on every redraw when
  AvgLevels == '1' (hidden otherwise); its Label2 shows AvgLevel. `levelcap` always shows the
  player's own Level, `linescap` TotalLines.

# Web TetriNET

A faithful browser recreation of **TetriNET v1.13** (St0rmCat, 1997). Up to six players, played **browser to browser**. You don't need to install anything or run a server.

### **[▶ Play now](https://github.com/jagantoe/web-tetrinet)**

---

## Playing together

The original needed one player to run a TetriNET server and the others to type in its IP address. Here, one player's browser does the server's job, and everyone connects to it directly over WebRTC by swapping two short codes:

1. **Host:** go to *Server Settings*, enter a nickname and press **Start Server**. Leave *Server Playing* checked to play yourself.
2. **Each joining player:** go to *Client Settings*, enter a nickname and press **Connect**. Send the **Join Code** you get to the host by chat, email or any other way.
3. **Host:** press **Accept Joining Player...**, paste the Join Code and press **Reply**. Send the **Reply Code** back.
4. **Joining player:** paste the Reply Code and press **Connect**. You're now on the partyline.
5. The host, or the moderator (the lowest-numbered player, marked `*`), presses **Start New Game** on the *Partyline* screen.

**Testing on one computer:** the host's *Server Settings* screen shows a 5-letter room code. Enter it under *Same-Computer Room* in another tab's *Client Settings*. That tab connects through `BroadcastChannel` and doesn't need the codes.

**Network notes:** a public STUN server (`stun.l.google.com`) only helps each browser discover its public address. Game traffic never passes through it. On the same LAN nothing external is needed at all. Very strict NATs, such as some corporate or mobile networks, need a TURN relay. Add one under *Client Settings → STUN/TURN Servers* as `turn:user:pass@host:port`.

## Controls

These are the defaults. You can change the movement keys in *Misc. Settings*. The Playing Fields window always shows your current bindings along its bottom edge.

| Key | Action |
|---|---|
| ← / → | move |
| ↑ / Ctrl | rotate right / left |
| ↓ | speed up falling |
| Space | drop |
| 1–6 | use the current special on player *n* (your own number for good specials) |
| D | discard the current special |
| T | in-game message (Esc to close) |

Partyline formatting: Ctrl+B bold, Ctrl+I italic, Ctrl+U underline, `/me` for actions.

## What's in it

- **Gameplay ported from the original executable:** piece shapes, colours and rotation, fall speed and lock timing, line clears and levels, every special block, classic mode, sudden death, teams and the win list. [`docs/ORIGINAL_SPEC.md`](docs/ORIGINAL_SPEC.md) records the code addresses each rule came from.
- **Pixel-accurate windows:** the layouts use the coordinates from the original Delphi form resources, with the original graphics, sounds and music.
- **Modern Angular:** Angular 22 with zoneless change detection, standalone components, signals, built-in control flow, and Signal Forms for the settings screens.

### Differences from the original

- **Connecting:** players connect with join and reply codes instead of an IP address and port 31457. The login encryption and IP ban list are gone, and **Ban** bans the nickname.
- **Bug fixes:** each round now starts with a full field update. The attacker's view of a Switch Fields swap now matches what the target sees.
- **Additions:** the Playing Fields window has an extra strip at the bottom showing your key bindings.
- **Title screen:** the 1997 donation address is replaced with a short credit.
- **Music:** `TETRINET.MID` is pre-rendered to MP3, because browsers can't play MIDI directly.

---

## Development

You need Node.js 22.22+, 24.15+ or 26+.

```bash
npm install
npm start            # dev server at http://localhost:4200
npm test             # engine unit tests (vitest, watch mode)
npm run build        # production build → dist/web-tetrinet/browser
```

The build output is a plain static site. All asset paths are relative, so it works from a domain root or from a subpath such as `/<repo>/`. To try the production build locally, run `npx serve dist/web-tetrinet/browser`. Opening `index.html` straight from disk won't work, because browsers block module scripts on `file://`.

### Deploying to GitHub Pages

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the tests, builds the site and publishes it on every push to `main`. You can also start it by hand from the *Actions* tab.

One-time setup:

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow by hand. The site appears at `https://<user>.github.io/<repo>/`. Put that URL in the link at the top of this README.

### Project layout

```
src/app/engine/     pure game logic (field ops, specials, timers, the local player's engine)
src/app/net/        connection abstraction, embedded host server, WebRTC & same-computer transports
src/app/services/   TetrinetService (client), settings (like tetrinet.ini), audio, theme
src/app/ui/         Win95-style windows: main window pages, playing fields, dialogs
public/assets/      default theme (tnetblks bitmap, WAVs, music) + UI images from the .exe
docs/               reverse-engineered spec of the original
```

### Themes / your own assets

`ThemeService` is the web version of a `.tnp` project file. To make a new look, copy `public/assets/default/` and keep the bitmap layout described in TETRINET.TXT:

- 16 px tiles in the top row
- 8 px tiles in the second row
- a 192×352 field background at (0,24)
- a 96×176 mini-field background at (192,24)

Then point a new `Theme` at the copy.

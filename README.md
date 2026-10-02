# ClaudeAmp

A Winamp-style player for Claude Code. It really whips the context window.

ClaudeAmp is an open source [Claude Code mod](https://code.claude.com/docs) (a plugin of function hooks) that docks a retro media player next to your session. Every turn is a song, every tool call is a track, and the spectrum analyzer dances to whatever Claude is streaming.

```
 ≡ CLAUDEAMP                                         _ □ ×
 ▶ 01:23   3. Bash - npm test *** 4. Edit - register.tsx ***
 128 kbps  14 kHz  stereo  7 turns
 ▆▆ ██ ▇▇ ▅▅ ▃▃ ▆▆ ▄▄ ▂▂ ▃▃ ▅▅ ▁▁ ▂▂ ▄▄ ▂▂ ▁▁ ▁▁ ▂▂ ▁▁
 [ |◀ ] [ ▶ ] [ ‖ ] [ ■ ] [ ▶| ] [ ⏏ ] [ skin: classic ]
 ── PLAYLIST (4) ─────────────────────────────────────────
     1. Read       README.md                          0.1s
     2. Grep       registerHook                       0.3s
 ▶   3. Bash       npm test                              …
     4. Edit       register.tsx                       0.2s
```

## What's on the player

| Winamp | ClaudeAmp |
| --- | --- |
| Play / stop state and the clock | A turn is running, and how long it has been going |
| Scrolling song title | The current tool call, or your prompt (a live LCD raster) |
| Spectrum analyzer | Bars driven by the model's streamed text and thinking, kicks on every tool call, falling peak caps |
| kbps | Output tokens per second of the last turn |
| kHz | Output tokens of the session, in thousands |
| mono / stereo | Lights up "stereo" while tools run in parallel |
| Playlist | Every tool call of the session, with duration and ✗ on failures |
| Skins | `classic`, `claude`, `llama`, `vapor` |

### Transport (Winamp's own hotkeys while the pane is focused)

| Key | Button | Does |
| --- | --- | --- |
| `z` | `\|◀` | Previous track: scroll the marquee back through the playlist |
| `x` | `▶` | Play: puts `continue` in your prompt box (press Enter) |
| `c` | `‖` | Pause the visualizer |
| `v` | `■` | Stop: aborts the running turn |
| `b` | `▶\|` | Next track (past the last one, follow live again) |
| `l` | `⏏` | Eject: close the pane |
| `s` | skin | Cycle skins |

Focus the pane with `ctrl+x tab`, close it with `ctrl+x x`.

## Install

Requires a Claude Code build with function-hook mods (2.1.287 or newer).

```sh
git clone https://github.com/katzboaz/ClaudeAmp ~/claudeamp
claude --plugin-dir ~/claudeamp
```

To load it in every session (including ones the desktop app starts), add it to `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/claudeamp" } }
```

Then `/claudeamp` opens the player. The pane docks in fullscreen terminals; opened on its own at session start it waits until the terminal is at least 144 columns wide.

## Commands and settings

- `/claudeamp` open the player
- `/claudeamp skin [classic|claude|llama|vapor]` switch skin (no name cycles)
- `/claudeamp close` eject

Options (in `/config`, or `pluginConfigs.claudeamp.options` in settings):

| Option | Default | |
| --- | --- | --- |
| `skin` | `classic` | Starting skin |
| `autoOpen` | `true` | Open the player when a session starts |
| `sounds` | `false` | Chime when a turn finishes (macOS, via `afplay`) |

## Surfaces

The terminal gets the full experience: the LCD and the visualizer are `Raster` elements repainted at ~10 fps with `$.ui.blit`, so animation never triggers a full redraw. Desktop, VS Code and mobile get the same window drawn in text, refreshed as state changes.

## Develop

```
.claude-plugin/plugin.json   manifest and options
hooks/hooks.json             points at the hooks module
hooks/register.tsx           the hooks: turns, tool calls, streaming, the pane
hooks/lib.ts                 pure helpers: skins, marquee, spectrum, raster packing
types/index.d.ts             the $.state contract
sounds/done.wav              an original synthesized chime
tests/claudeamp.test.ts      claude plugin test
```

```sh
claude plugin validate .
claude plugin test .
tsc -p .            # after the first load, which lays .claude-plugin/types/
```

Run `claude --plugin-dir . --debug` and saves hot reload the mod.

PRs welcome, especially new skins. A skin is one entry in `SKINS` in `hooks/lib.ts`.

## Disclaimer

A fan tribute. Not affiliated with or endorsed by Winamp or Anthropic. All code and the sound are original.

## License

MIT

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Player, Stats, Track } from '../types'
import {
  Spectrum,
  bandsFor,
  describeCall,
  formatMs,
  formatTime,
  marquee,
  nextSkin,
  parseHex,
  shortTool,
  skinOf,
  spectrumCells,
  spectrumLine,
  textCells,
} from './lib'

const PANE = 'claudeamp'
const TITLE = 'ClaudeAmp'
const IDLE_TRACK = 'ClaudeAmp *** It really whips the context window *** Ready'
const VIZ_ROWS = 4
const FRAME_MS = 100

const IDLE: Player = { status: 'stopped', turnId: null, elapsed: 0, track: IDLE_TRACK }

const player = atom({ plugin: 'claudeamp', key: 'player' } as const, IDLE)
const playlist = atom({ plugin: 'claudeamp', key: 'playlist' } as const, [] as Track[])
const stats = atom({ plugin: 'claudeamp', key: 'stats' } as const, { turns: 0, tokens: 0, tps: 0 } as Stats)
const skinName = atom({ plugin: 'claudeamp', key: 'skin' } as const, '')
const cursor = atom({ plugin: 'claudeamp', key: 'cursor' } as const, -1)
const isFrozen = atom({ plugin: 'claudeamp', key: 'isFrozen' } as const, false)

// The animation's own copies of what it draws, so a frame reads no state.
// A reload resets them; the next render sets them again.
const spectrum = new Spectrum(48)
let frame = 0
let isPlaying = false
let frozen = false
let marqueeText = IDLE_TRACK
let defaultSkin = 'classic'
let skin = skinOf(defaultSkin)
let mounted: { viz: number; lcd: number } | null = null
let ticker: { cancel: () => void } | null = null
let turnStartedAt = 0
let running = 0

function setStatus($: EngineInterface, p: Player): void {
  $.ui.status(p.status === 'playing' ? `♪ ▶ ${formatTime(p.elapsed)}  ${p.track.slice(0, 40)}` : undefined)
}

async function setTrack($: EngineInterface, track: string): Promise<void> {
  marqueeText = track
  await update($, player, p => ({ ...p, track }))
}

async function drawFrame($: EngineInterface): Promise<void> {
  frame += 1
  if (!frozen) {
    spectrum.tick(isPlaying)
  }
  if (mounted === null) {
    return
  }

  const quiet = spectrum.isQuiet && !isPlaying
  if (!quiet || frame % 10 === 0) {
    const res = await $.ui.blit({
      requestId: PANE,
      key: 'viz',
      cells: spectrumCells(spectrum, mounted.viz, VIZ_ROWS, skin),
    })
    if (res.deny !== undefined) {
      mounted = null

      return
    }
  }
  if (frame % 3 === 0) {
    const text = marquee(marqueeText, mounted.lcd, Math.floor(frame / 3))
    await $.ui.blit({ requestId: PANE, key: 'lcd', cells: textCells(text, mounted.lcd, parseHex(skin.lcd), skin.screen) })
  }
}

async function tickClock($: EngineInterface): Promise<void> {
  const elapsed = ((await $.clock.now()) - turnStartedAt) / 1000
  const p = await update($, player, (cur): Player => (cur.status === 'playing' ? { ...cur, elapsed } : cur))
  setStatus($, p)
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: TITLE })
}

async function closePane($: EngineInterface): Promise<void> {
  mounted = null
  await $.ui.close({ id: PANE })
}

// The transport. Winamp's own keys: z x c v b.
async function prev($: EngineInterface): Promise<void> {
  const n = (await read($, playlist)).length
  await update($, cursor, c => Math.max(0, (c < 0 ? n - 1 : c) - 1))
}

async function nextTrack($: EngineInterface): Promise<void> {
  const n = (await read($, playlist)).length
  await update($, cursor, c => (c < 0 || c + 1 >= n ? -1 : c + 1))
}

async function play($: EngineInterface): Promise<void> {
  if ((await read($, player)).status === 'playing') {
    $.ui.toast('ClaudeAmp: already playing')

    return
  }
  await $.prompt.fill({ text: 'continue' })
  $.ui.toast('ClaudeAmp: press Enter to play')
}

async function pause($: EngineInterface): Promise<void> {
  frozen = !(await read($, isFrozen))
  await update($, isFrozen, () => frozen)
}

async function stop($: EngineInterface): Promise<void> {
  const p = await read($, player)
  if (p.turnId === null) {
    $.ui.toast('ClaudeAmp: nothing playing')

    return
  }
  await $.turn.abort({ turnId: p.turnId })
}

async function cycleSkin($: EngineInterface): Promise<void> {
  skin = skinOf(nextSkin(skin.name))
  await update($, skinName, () => skin.name)
}

export const register: Register = (on, options) => {
  defaultSkin = String(options.skin ?? 'classic')
  skin = skinOf(defaultSkin)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'claudeamp',
      description: 'Open the ClaudeAmp player (args: close, skin [name])',
      argumentHint: '[close | skin <classic|claude|llama|vapor>]',
    })
    $.clock.every(FRAME_MS, () => void drawFrame($))
    if (options.autoOpen !== false) {
      void openPane($)
    }

    return next(e)
  })

  on('command.run', { command: 'claudeamp' }, async ($, e) => {
    const [verb, arg] = e.args.trim().split(/\s+/)

    if (verb === 'close' || verb === 'eject') {
      await closePane($)

      return { text: 'ClaudeAmp ejected.' }
    }
    if (verb === 'skin') {
      const name = arg && skinOf(arg).name === arg ? arg : nextSkin(skin.name)
      skin = skinOf(name)
      await update($, skinName, () => name)
      await openPane($)

      return { text: `ClaudeAmp skin: ${name}` }
    }

    await openPane($)

    return { text: 'ClaudeAmp opened. Hotkeys while focused: z prev, x play, c pause, v stop, b next, s skin.' }
  })

  on('turn.start', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    isPlaying = true
    const track = e.text.trim() !== '' ? `Prompt: ${e.text.replace(/\s+/g, ' ').slice(0, 120)}` : 'Thinking…'
    marqueeText = track
    const p: Player = { status: 'playing', turnId: e.turnId, elapsed: 0, track }
    await update($, player, () => p)
    setStatus($, p)
    spectrum.kick(0.8)

    ticker?.cancel()
    ticker = $.clock.every(1000, () => void tickClock($))

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    for await (const chunk of next(e)) {
      if (chunk.kind === 'text' || chunk.kind === 'thinking') {
        spectrum.feedText('text' in chunk ? chunk.text : '')
      } else if (chunk.kind === 'tool') {
        spectrum.kick()
      }
      yield chunk
    }
  })

  on('tool.call', async ($, e, next) => {
    const track: Track = {
      id: e.tool_use_id,
      n: 0,
      tool: String(e.tool),
      title: describeCall(e as unknown as Record<string, unknown>),
      status: 'running',
      ms: 0,
    }
    const startedAt = await $.clock.now()
    running += 1
    spectrum.kick(0.6)
    // Numbered inside the update, so parallel calls never share a number.
    const list = await update($, playlist, l => [...l, { ...track, n: (l.at(-1)?.n ?? 0) + 1 }].slice(-500))
    const n = list.find(t => t.id === track.id)?.n ?? list.length
    await setTrack($, `${n}. ${shortTool(track.tool)} - ${track.title || track.tool}`)

    const ran = await next(e)

    running = Math.max(0, running - 1)
    const ms = (await $.clock.now()) - startedAt
    const failed = ran.deny !== undefined || ran.isError === true
    await update($, playlist, l =>
      l.map(t => (t.id === track.id ? { ...t, status: failed ? 'error' : 'done', ms } : t)),
    )

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }

    isPlaying = false
    ticker?.cancel()
    ticker = null
    const out = e.usage?.output_tokens ?? 0
    await update($, stats, s => ({
      turns: s.turns + 1,
      tokens: s.tokens + out,
      tps: e.durationMs > 0 ? Math.round(out / (e.durationMs / 1000)) : s.tps,
    }))
    const p = await update($, player, (cur): Player => ({
      ...cur,
      status: 'stopped',
      turnId: null,
      elapsed: e.durationMs / 1000,
      track: e.isAborted ? 'Stopped' : cur.track,
    }))
    marqueeText = p.track
    setStatus($, p)

    if (options.sounds === true && !e.isAborted) {
      void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => undefined)
    }

    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      mounted = null
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const p = await read($, player)
    const list = await read($, playlist)
    const s = await read($, stats)
    const at = await read($, cursor)
    frozen = await read($, isFrozen)
    skin = skinOf((await read($, skinName)) || defaultSkin)
    isPlaying = p.status === 'playing'

    const width = Math.max(24, e.props.bodyColumns)
    const selected = at >= 0 && at < list.length ? list[at] : undefined
    marqueeText = selected ? `${selected.n}. ${shortTool(selected.tool)} - ${selected.title || selected.tool}` : p.track

    const glyph = isPlaying ? '▶' : '■'
    const clock = ` ${glyph} ${formatTime(p.elapsed)} `
    const lcdCols = Math.max(4, width - clock.length - 1)
    const vizCols = Math.min(width, bandsFor(width) * 3 - 1)
    const stereo = running > 1 ? 'stereo' : 'mono'
    const kbps = String(s.tps).padStart(3)
    const khz = String(Math.round(s.tokens / 1000)).padStart(2)
    const screen = `#${skin.screen.toString(16).padStart(6, '0')}`

    const title = ` ≡ CLAUDEAMP${' '.repeat(Math.max(1, width - 19))}_ □ × `.slice(0, width)
    const rows = Math.max(3, (e.viewport?.rows ?? 30) - 12)
    const focus = selected ? at : list.length - 1
    const first = Math.max(0, Math.min(focus - Math.floor(rows / 2), list.length - rows))
    const visible = list.slice(first, first + rows)

    const buttons = [
      { key: 'prev', label: '|◀', hotkey: 'z', onPress: () => prev($) },
      { key: 'play', label: '▶', hotkey: 'x', onPress: () => play($) },
      { key: 'pause', label: frozen ? '‖*' : '‖', hotkey: 'c', onPress: () => pause($) },
      { key: 'stop', label: '■', hotkey: 'v', onPress: () => stop($) },
      { key: 'next', label: '▶|', hotkey: 'b', onPress: () => nextTrack($) },
      { key: 'eject', label: '⏏', hotkey: 'l', onPress: () => closePane($) },
      { key: 'skin', label: `skin: ${skin.name}`, hotkey: 's', onPress: () => cycleSkin($) },
    ]

    const row = (t: Track) => {
      const mark = t.status === 'running' ? '▶' : t.status === 'error' ? '✗' : ' '
      const time = t.status === 'running' ? '…' : formatMs(t.ms)
      const left = `${mark}${String(t.n).padStart(3)}. ${shortTool(t.tool).slice(0, 10).padEnd(10)} `
      const room = Math.max(0, width - left.length - time.length - 1)
      const name = Array.from(t.title).slice(0, room).join('').padEnd(room)

      return `${left}${name} ${time}`
    }

    if (e.surface === 'terminal') {
      const { Box, Text, Button, Raster } = $.ui.resolve(e)
      mounted = { viz: vizCols, lcd: lcdCols }
      const lcdText = marquee(marqueeText, lcdCols, Math.floor(frame / 3))

      return (
        <Box flexDirection="column">
          <Text color={skin.titleFg} backgroundColor={skin.titleBg} bold>
            {title}
          </Text>
          <Box>
            <Text color={skin.lcd} backgroundColor={screen} bold>
              {clock}
            </Text>
            <Text> </Text>
            <Raster key="lcd" columns={lcdCols} rows={1} cells={textCells(lcdText, lcdCols, parseHex(skin.lcd), skin.screen)} />
          </Box>
          <Text color={skin.lcdDim}>
            {` ${kbps} kbps  ${khz} kHz  `}
            <Text color={running > 1 ? skin.lcd : skin.lcdDim}>{stereo}</Text>
            {`  ${s.turns} ${s.turns === 1 ? 'turn' : 'turns'}`}
          </Text>
          <Raster key="viz" columns={vizCols} rows={VIZ_ROWS} cells={spectrumCells(spectrum, vizCols, VIZ_ROWS, skin)} />
          <Box gap={1} flexWrap="wrap">
            {buttons.map(b => (
              <Button key={b.key} label={b.label} hotkey={b.hotkey} onPress={b.onPress} />
            ))}
          </Box>
          <Text color={skin.lcdDim}>{`── PLAYLIST (${list.length}) `.padEnd(width, '─')}</Text>
          {visible.length === 0 && <Text dimColor>  No tracks yet. Ask Claude to do something.</Text>}
          {visible.map(t => (
            <Text
              color={t.status === 'error' ? skin.titleBg : skin.lcd}
              inverse={t === (selected ?? list.at(-1))}
              wrap="truncate"
            >
              {row(t)}
            </Text>
          ))}
        </Box>
      )
    }

    // Surfaces without Raster: the same window in text, redrawn as state moves.
    const { Box, Text, Button } = $.ui.resolve(e)
    mounted = null

    return (
      <Box flexDirection="column">
        <Text color={skin.titleFg} backgroundColor={skin.titleBg} bold>
          {title}
        </Text>
        <Text color={skin.lcd} backgroundColor={screen} bold>
          {`${clock} ${marquee(marqueeText, lcdCols, Math.floor(p.elapsed))}`}
        </Text>
        <Text color={skin.lcdDim}>{` ${kbps} kbps  ${khz} kHz  ${stereo}  ${s.turns} ${s.turns === 1 ? 'turn' : 'turns'}`}</Text>
        <Text color={skin.lcd}>{spectrumLine(spectrum, width)}</Text>
        <Box gap={1} flexWrap="wrap">
          {buttons.map(b => (
            <Button key={b.key} label={b.label} onPress={b.onPress} />
          ))}
        </Box>
        <Text color={skin.lcdDim}>{`PLAYLIST (${list.length})`}</Text>
        {visible.map(t => (
          <Text color={skin.lcd} wrap="truncate">
            {row(t)}
          </Text>
        ))}
      </Box>
    )
  })
}

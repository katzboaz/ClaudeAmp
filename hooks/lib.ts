// Pure helpers: no `$`, so the tests can drive them directly.

export type Skin = {
  name: string
  /** Title bar: text on background. */
  titleFg: string
  titleBg: string
  /** The LCD: digits, marquee and the readouts. */
  lcd: string
  lcdDim: string
  /** Visualizer gradient, bottom to top, and the falling peak caps. */
  low: number
  mid: number
  high: number
  peak: number
  /** The LCD's and the visualizer's background. */
  screen: number
}

export const SKINS: Record<string, Skin> = {
  classic: {
    name: 'classic',
    titleFg: '#ffffff',
    titleBg: '#1c1c6c',
    lcd: '#00ff00',
    lcdDim: '#1d7a1d',
    low: 0x00d000,
    mid: 0xe0e000,
    high: 0xff2000,
    peak: 0xc0c0c0,
    screen: 0x000000,
  },
  claude: {
    name: 'claude',
    titleFg: '#1a1915',
    titleBg: '#d97757',
    lcd: '#f0b28c',
    lcdDim: '#8a5a40',
    low: 0xb05a3c,
    mid: 0xd97757,
    high: 0xffd2b8,
    peak: 0xfaf9f5,
    screen: 0x1a1915,
  },
  llama: {
    name: 'llama',
    titleFg: '#000000',
    titleBg: '#e8b923',
    lcd: '#ffd84a',
    lcdDim: '#7a6420',
    low: 0x8a5a00,
    mid: 0xe8b923,
    high: 0xfff3a0,
    peak: 0xffffff,
    screen: 0x0d0a00,
  },
  vapor: {
    name: 'vapor',
    titleFg: '#ffffff',
    titleBg: '#7b2cbf',
    lcd: '#5ef0ff',
    lcdDim: '#2b6c78',
    low: 0x3a0ca3,
    mid: 0xf72585,
    high: 0x4cc9f0,
    peak: 0xffffff,
    screen: 0x10002b,
  },
}

export const SKIN_ORDER = Object.keys(SKINS)

const CLASSIC = SKINS.classic as Skin

export const skinOf = (name: string | undefined): Skin => SKINS[name ?? ''] ?? CLASSIC

export const nextSkin = (name: string): string =>
  SKIN_ORDER[(SKIN_ORDER.indexOf(name) + 1) % SKIN_ORDER.length] ?? 'classic'

/** `m:ss`, or `h:mm:ss` past the hour, as Winamp's clock reads. */
export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')

  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`
}

export const formatMs = (ms: number): string =>
  ms < 1000 ? `${(ms / 1000).toFixed(1)}s` : formatTime(ms / 1000)

/**
 * A `width`-wide window over `text` scrolled `offset` cells, wrapping with a
 * separator, as the song title scrolls; text that fits stands still.
 */
export const marquee = (text: string, width: number, offset: number): string => {
  const chars = Array.from(text)

  if (width <= 0) {
    return ''
  }
  if (chars.length <= width) {
    return text.padEnd(width)
  }

  const loop = [...chars, ...Array.from(' *** ')]
  const start = ((offset % loop.length) + loop.length) % loop.length
  let out = ''
  for (let i = 0; i < width; i++) {
    out += loop[(start + i) % loop.length] ?? ' '
  }

  return out
}

const basename = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

const oneLine = (text: string, max = 80): string => {
  const flat = text.replace(/\s+/g, ' ').trim()

  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** The playlist title of a tool call: what it works on, in a few words. */
export const describeCall = (call: Record<string, unknown>): string => {
  const tool = String(call.tool)
  const str = (key: string): string | undefined =>
    typeof call[key] === 'string' && call[key] !== '' ? (call[key] as string) : undefined

  const path = str('file_path') ?? str('notebook_path') ?? str('path')
  const detail =
    str('description') ??
    str('command') ??
    (path && basename(path)) ??
    str('pattern') ??
    str('url') ??
    str('query') ??
    str('prompt') ??
    str('skill')

  if (tool.startsWith('mcp__')) {
    const [, server, name] = tool.split('__')

    return oneLine(detail ? `${server}/${name}: ${detail}` : `${server}/${name}`)
  }

  return oneLine(detail ?? '')
}

/** A short tool name for the playlist's second column. */
export const shortTool = (tool: string): string =>
  tool.startsWith('mcp__') ? (tool.split('__')[1] ?? 'mcp') : tool

/**
 * The spectrum analyzer: bands that jump on what the model streams and fall
 * back as Winamp's bars do, with peak caps that hang and then drop.
 */
export class Spectrum {
  readonly bands: number
  levels: number[]
  peaks: number[]
  private energy: number[]
  private seed = 0x2f6b
  private hold: number[]

  constructor(bands = 24) {
    this.bands = bands
    this.levels = new Array(bands).fill(0)
    this.peaks = new Array(bands).fill(0)
    this.energy = new Array(bands).fill(0)
    this.hold = new Array(bands).fill(0)
  }

  private random(): number {
    // xorshift: deterministic, so a frame reads the same in a test.
    let x = this.seed
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.seed = x >>> 0

    return this.seed / 0xffffffff
  }

  private bump(center: number, amount: number, spread = 2): void {
    for (let d = -spread; d <= spread; d++) {
      const i = center + d
      if (i >= 0 && i < this.bands) {
        const fall = 1 - Math.abs(d) / (spread + 1)
        this.energy[i] = Math.min(1, (this.energy[i] ?? 0) + amount * fall)
      }
    }
  }

  /** Streamed text: each character lands on a band by its code point. */
  feedText(text: string): void {
    const chars = Array.from(text)
    const amount = Math.min(0.9, 0.08 + chars.length * 0.015)
    for (const ch of chars.slice(0, 32)) {
      const code = ch.codePointAt(0) ?? 0
      this.bump((code * 7) % this.bands, amount / 3, 1)
    }
  }

  /** A tool call: the bass drum. */
  kick(strength = 1): void {
    this.bump(1, 0.9 * strength, 3)
    this.bump(Math.floor(this.random() * this.bands), 0.5 * strength, 2)
  }

  /** One frame: `isPlaying` keeps a low hum going so the bars never sit dead. */
  tick(isPlaying: boolean): void {
    for (let i = 0; i < this.bands; i++) {
      let energy = this.energy[i] ?? 0
      if (isPlaying) {
        // Pink-ish noise: more in the low bands, as music has.
        const tilt = 1 - (i / this.bands) * 0.6
        energy = Math.min(1, energy + this.random() * 0.12 * tilt)
      }

      const was = this.levels[i] ?? 0
      const level = energy > was ? energy : Math.max(0, was - 0.06)
      this.levels[i] = level
      this.energy[i] = energy * 0.72

      const peak = this.peaks[i] ?? 0
      const hold = this.hold[i] ?? 0
      if (level >= peak) {
        this.peaks[i] = level
        this.hold[i] = 6
      } else if (hold > 0) {
        this.hold[i] = hold - 1
      } else {
        this.peaks[i] = Math.max(0, peak - 0.025)
      }
    }
  }

  get isQuiet(): boolean {
    return this.levels.every(l => l < 0.005) && this.peaks.every(p => p < 0.005)
  }
}

const EIGHTHS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const DEFAULT_COLOR = 0x01000000

/** Visualizer layout: 2-cell bars with a 1-cell gap; how many fit. */
export const bandsFor = (columns: number): number => Math.max(1, Math.floor((columns + 1) / 3))

const toBase64 = (bytes: Uint8Array): string => {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (typeof native === 'function') {
    return native.call(bytes)
  }

  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }

  return btoa(binary)
}

/** Packs `[codePoint, fg, bg]` triplets as RasterProps' `cells` wants them. */
export const packCells = (words: Uint32Array): string => toBase64(new Uint8Array(words.buffer))

const gradient = (skin: Skin, t: number): number => (t < 0.45 ? skin.low : t < 0.8 ? skin.mid : skin.high)

/** The spectrum's frame as Raster cells, `columns` by `rows`. */
export const spectrumCells = (spectrum: Spectrum, columns: number, rows: number, skin: Skin): string => {
  const words = new Uint32Array(columns * rows * 3)
  const set = (x: number, y: number, ch: string, fg: number, bg: number): void => {
    const at = (y * columns + x) * 3
    words[at] = ch.codePointAt(0) ?? 32
    words[at + 1] = fg
    words[at + 2] = bg
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      set(x, y, ' ', DEFAULT_COLOR, skin.screen)
    }
  }

  const bands = Math.min(spectrum.bands, bandsFor(columns))
  for (let b = 0; b < bands; b++) {
    const level = (spectrum.levels[b] ?? 0) * rows * 8
    const peak = spectrum.peaks[b] ?? 0
    const peakRow = Math.min(rows - 1, Math.floor(peak * rows))
    for (let y = 0; y < rows; y++) {
      const fromBottom = rows - 1 - y
      const fill = Math.max(0, Math.min(8, Math.round(level - fromBottom * 8)))
      const color = gradient(skin, (fromBottom + 1) / rows)
      let ch = EIGHTHS[fill] ?? ' '
      let fg = color
      if (fill === 0 && fromBottom === peakRow && peak > 0.02) {
        ch = '▁'
        fg = skin.peak
      }
      for (let dx = 0; dx < 2; dx++) {
        const x = b * 3 + dx
        if (x < columns) {
          set(x, y, ch, fg, skin.screen)
        }
      }
    }
  }

  return packCells(words)
}

/** One line of text as Raster cells: the LCD marquee. */
export const textCells = (text: string, columns: number, fg: number, bg: number): string => {
  const words = new Uint32Array(columns * 3)
  const chars = Array.from(text)
  for (let x = 0; x < columns; x++) {
    const ch = chars[x] ?? ' '
    const code = ch.codePointAt(0) ?? 32
    // Raster cells are one width-1 BMP character each.
    words[x * 3] = code > 0xffff || code < 32 ? 0x3f : code
    words[x * 3 + 1] = fg
    words[x * 3 + 2] = bg
  }

  return packCells(words)
}

/** The spectrum as one line of block glyphs, for surfaces without Raster. */
export const spectrumLine = (spectrum: Spectrum, width: number): string => {
  let out = ''
  const bands = Math.min(spectrum.bands, bandsFor(width))
  for (let b = 0; b < bands; b++) {
    const glyph = EIGHTHS[Math.max(1, Math.round((spectrum.levels[b] ?? 0) * 8))] ?? ' '
    out += `${glyph}${glyph} `
  }

  return out.trimEnd()
}

export const parseHex = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16)

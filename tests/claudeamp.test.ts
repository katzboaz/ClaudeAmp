import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { Spectrum, describeCall, formatTime, marquee, nextSkin, spectrumLine } from '../hooks/lib'

const PANE_PROPS = {
  title: 'ClaudeAmp',
  isFocused: true,
  bodyColumns: 60,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

const mountPane = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({
    plugin: 'claudeamp',
    surface,
    component: 'Pane',
    requestId: 'claudeamp',
    props: PANE_PROPS,
    viewport: { columns: 60, rows: 30 },
  })

test('the clock reads as Winamp does', () => {
  expect(formatTime(0)).toBe('00:00')
  expect(formatTime(83)).toBe('01:23')
  expect(formatTime(3725)).toBe('1:02:05')
})

test('the marquee scrolls long titles and leaves short ones', () => {
  expect(marquee('hi', 5, 3)).toBe('hi   ')
  expect(marquee('abcdefgh', 4, 0)).toBe('abcd')
  expect(marquee('abcdefgh', 4, 2)).toBe('cdef')
  expect(marquee('abcdefgh', 4, 7)).toBe('h **')
})

test('a tool call is titled by what it works on', () => {
  expect(describeCall({ tool: 'Bash', command: 'npm test' })).toBe('npm test')
  expect(describeCall({ tool: 'Read', file_path: '/repo/src/index.ts' })).toBe('index.ts')
  expect(describeCall({ tool: 'mcp__github__get_me' })).toBe('github/get_me')
})

test('skins cycle and wrap', () => {
  expect(nextSkin('classic')).toBe('claude')
  expect(nextSkin('vapor')).toBe('classic')
})

test('the spectrum jumps on activity and falls back to rest', () => {
  const s = new Spectrum(8)
  s.kick()
  s.tick(false)
  expect(Math.max(...s.levels)).toBeGreaterThan(0.3)
  for (let i = 0; i < 200; i++) {
    s.tick(false)
  }
  expect(s.isQuiet).toBe(true)
  expect(spectrumLine(s, 23)).toBe('▁▁ ▁▁ ▁▁ ▁▁ ▁▁ ▁▁ ▁▁ ▁▁')
})

test('a tool call becomes a track in the playlist on every surface', async ($, on) => {
  mock.clock(on)
  on('tool.call', () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'Bash', command: 'npm test' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountPane($, surface)
    expect(await ui.find({ type: 'Text', text: /PLAYLIST \(1\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1\. Bash\s+npm test/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the skin button cycles the skin', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountPane($, surface)
    const before = (await ui.find({ key: 'skin' }))?.props.label
    await ui.press({ key: 'skin' })
    const after = (await ui.find({ key: 'skin' }))?.props.label
    expect(before).not.toBe(after)
    await ui.unmount()
  }
})

test('the terminal draws the visualizer and the LCD as rasters', async $ => {
  const ui = await mountPane($, 'terminal')
  expect(await ui.find({ type: 'Raster', key: 'viz' })).toBeDefined()
  expect(await ui.find({ type: 'Raster', key: 'lcd' })).toBeDefined()
  await ui.unmount()
})

test('a finished turn sets the kbps from its tokens per second', async ($, on) => {
  mock.clock(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  await $.turn.start({ text: 'hello', turnId: 't1' })
  await $.turn.complete({
    answer: 'hi',
    durationMs: 2000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { input_tokens: 10, output_tokens: 256, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'test' },
  })

  const ui = await mountPane($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /128 kbps/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 turn\b/ })).toBeDefined()
  await ui.unmount()
})

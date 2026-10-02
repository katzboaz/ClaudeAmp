// Renders promo.html to claudeamp-promo.mp4: python3 soundtrack.py && node render.mjs
// Stills for checking a frame: node render.mjs --stills 11.5,17.5
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const stillsAt = args.includes('--stills') ? args[args.indexOf('--stills') + 1].split(',').map(Number) : null
const out = path.join(here, 'claudeamp-promo.silent.mp4')
const FPS = 30

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto('file://' + path.join(here, 'promo.html'))
await page.evaluate(() => document.fonts.ready)

if (stillsAt) {
  for (const t of stillsAt) {
    await page.evaluate(t => window.render(t), t)
    await page.screenshot({ path: path.join(here, `still-${t}.png`) })
  }
  await browser.close()
  process.exit(0)
}

const duration = await page.evaluate(() => window.DURATION)
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] })
const frames = Math.round(duration * FPS)
for (let i = 0; i < frames; i++) {
  await page.evaluate(t => window.render(t), i / FPS)
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 })
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
  if (i % 150 === 0) console.log(`frame ${i}/${frames}`)
}
ff.stdin.end()
await new Promise(r => ff.on('close', r))
await browser.close()

// Lay the soundtrack under the frames.
const final = path.join(here, 'claudeamp-promo.mp4')
const mux = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-i', path.join(here, 'soundtrack.wav'),
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' })
const code = await new Promise(r => mux.on('close', r))
console.log(code === 0 ? `wrote ${final}` : 'mux failed: run python3 soundtrack.py first')

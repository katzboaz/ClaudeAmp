"""An original 30s chiptune for the promo, 120 BPM, synthesized from scratch.

Timed to promo.html: soft intro under the terminal, arpeggio build from 3s,
full beat from 6s, a tape-stop when Stop is pressed (23.4s), and the drop
back in with the logo at 25s. Writes soundtrack.wav.
"""
import wave

import numpy as np

SR = 44100
DUR = 30.0
BEAT = 0.5
N = int(SR * DUR)
t = np.arange(N) / SR
mix = np.zeros(N)


def note_hz(name):
    names = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[pitch] + (octave - 4) * 12) / 12)


def square(freq, length, duty=0.5):
    tt = np.arange(int(SR * length)) / SR
    return np.where((tt * freq) % 1 < duty, 1.0, -1.0)


def tri(freq, length):
    tt = np.arange(int(SR * length)) / SR
    return 2 * np.abs(2 * ((tt * freq) % 1) - 1) - 1


def env(n, attack=0.005, decay=0.15, sustain=0.6, release=0.05):
    e = np.ones(n) * sustain
    a, d, r = int(SR * attack), int(SR * decay), int(SR * release)
    e[:a] = np.linspace(0, 1, a)
    e[a:a + d] = np.linspace(1, sustain, len(e[a:a + d]))
    if r > 0:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def place(sig, start, gain):
    i = int(start * SR)
    j = min(N, i + len(sig))
    if i < N:
        mix[i:j] += sig[:j - i] * gain


# Am - F - C - G, one bar (2s) each.
CHORDS = [('A', ['A3', 'C4', 'E4', 'A4']), ('F', ['F3', 'A3', 'C4', 'F4']), ('C', ['C4', 'E4', 'G4', 'C5']), ('G', ['G3', 'B3', 'D4', 'G4'])]
BASS = {'A': 'A1', 'F': 'F1', 'C': 'C2', 'G': 'G1'}
MELODY = ['E5', 'D5', 'C5', 'D5', 'E5', 'E5', 'E5', None, 'D5', 'D5', 'E5', 'G5', 'G5', None, 'A5', 'G5']


def chord_at(time):
    return CHORDS[int(time // 2) % 4]


def section_on(time):
    """Full beat between 6s and the stop, and again with the logo."""
    return (6 <= time < 23.4) or (25 <= time < 29.6)


# Pad under everything: soft triangles.
for bar in range(15):
    start = bar * 2
    root, notes = chord_at(start)
    for nn in notes[:3]:
        if start < 23.4 or start >= 24:
            sig = tri(note_hz(nn), 2.0) * env(int(SR * 2.0), 0.3, 0.5, 0.7, 0.4)
            place(sig, start, 0.045)

# Arpeggio, 16ths, from 3s.
step = BEAT / 4
for k in range(int(DUR / step)):
    start = k * step
    if start < 3 or 23.4 <= start < 25 or start >= 29.6:
        continue
    _, notes = chord_at(start)
    nn = notes[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]]
    sig = square(note_hz(nn) * 2, step * 0.9, 0.25) * env(int(SR * step * 0.9), 0.002, 0.06, 0.3, 0.02)
    build = min(1.0, (start - 3) / 3) if start < 6 else 1.0
    place(sig, start, 0.05 * build)

for k in range(int(DUR / BEAT)):
    start = k * BEAT
    if not section_on(start):
        continue
    root, _ = chord_at(start)
    # Bass on the eighths.
    for half in (0, BEAT / 2):
        sig = square(note_hz(BASS[root]) * (2 if half else 1), BEAT / 2 * 0.9, 0.5)
        sig *= env(len(sig), 0.002, 0.08, 0.5, 0.02)
        place(sig, start + half, 0.09)
    # Kick on every beat: a falling sine.
    kt = np.arange(int(SR * 0.25)) / SR
    kick = np.sin(2 * np.pi * (50 + 120 * np.exp(-kt * 30)) * kt) * np.exp(-kt * 12)
    place(kick, start, 0.5)
    # Hats on the offbeat, snare on 2 and 4.
    rng = np.random.default_rng(k)
    hat = rng.uniform(-1, 1, int(SR * 0.04)) * np.exp(-np.arange(int(SR * 0.04)) / SR * 90)
    place(hat, start + BEAT / 2, 0.12)
    if k % 2 == 1:
        sn = rng.uniform(-1, 1, int(SR * 0.18)) * np.exp(-np.arange(int(SR * 0.18)) / SR * 22)
        place(sn, start, 0.18)

# Lead melody in the player section and the outro, half-beat notes.
for k in range(int(DUR / (BEAT / 2))):
    start = k * BEAT / 2
    if not (10 <= start < 23.4 or 25.5 <= start < 29.4):
        continue
    nn = MELODY[k % len(MELODY)]
    if nn is None:
        continue
    length = BEAT / 2 * 0.95
    vib = 1 + 0.004 * np.sin(2 * np.pi * 6 * np.arange(int(SR * length)) / SR)
    tt = np.arange(int(SR * length)) / SR
    sig = np.where((np.cumsum(vib) / SR * note_hz(nn)) % 1 < 0.5, 1.0, -1.0) * env(len(tt), 0.005, 0.1, 0.5, 0.03)
    place(sig, start, 0.05)

# Tape-stop at 23.4s: the last half second slows and drops in pitch.
stop_at, stop_len = int(23.4 * SR), int(0.6 * SR)
src = mix[stop_at - stop_len:stop_at].copy()
idx = np.cumsum(np.linspace(1.0, 0.0, stop_len))
idx = np.clip(idx.astype(int), 0, stop_len - 1)
mix[stop_at - stop_len:stop_at] = src[idx] * np.linspace(1, 0.2, stop_len)

# The ClaudeAmp chime on the logo (the same two notes as sounds/done.wav).
for freq, start, length in [(659.25, 25.0, 0.5), (987.77, 25.15, 0.9)]:
    tt = np.arange(int(SR * length)) / SR
    sig = (np.sin(2 * np.pi * freq * tt) + 0.3 * np.sin(4 * np.pi * freq * tt)) * np.exp(-tt * 4) * np.minimum(1, tt * 200)
    place(sig, start, 0.3)

# Master: fade in, fade out, soft clip.
fade = np.minimum(1, t / 0.4) * np.clip((DUR - t) / 0.8, 0, 1)
out = np.tanh(mix * 1.4) * fade * 0.85
pcm = (out * 32767).astype('<i2')
stereo = np.column_stack([pcm, pcm]).ravel()

with wave.open('soundtrack.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(stereo.tobytes())
print('wrote soundtrack.wav')

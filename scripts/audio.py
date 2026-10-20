#!/usr/bin/env python3
"""Turns the raw sound files (<name>.mp3, sources in LICENSES.txt) into seamless, loudness-matched HE-AAC files in public/audio/.
Run: python3 scripts/audio.py <folder with the mp3s>   (macOS: uses the built-in afconvert; Python stdlib only)."""
import array
import math
import os
import subprocess
import sys
import tempfile
import wave

SRC = sys.argv[1]
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../public/audio"))
RATE = 44100
XFADE = 3.0  # seconds of the loop's end blended into its start
# HE-AAC's decoder fades in over its first ~30 ms. Each loop file carries PAD seconds of its own start after the loop, and
# audio.ts plays from 0.05 s to 0.05 s + loop length, so the seam runs into that copy and never into the fade-in. Keep in step with audio.ts.
PAD = 0.1

# name: (loop seconds, channels, kbps). HE-AAC (SBR) keeps the highs plain AAC drops at these rates: crickets and blizzard
# hiss vanished at 32-48 kbps AAC. Noise-like layers lose nothing in mono; birds and crickets keep their width.
LOOPS = {
    "amb-rain-light": (30, 1, 24),
    "amb-rain-heavy": (30, 1, 24),
    "amb-wind-soft": (30, 1, 24),
    "amb-blizzard": (30, 1, 24),
    "amb-forest-autumn": (30, 1, 24),
    "amb-winter-quiet": (30, 1, 24),
    "amb-birds-spring": (30, 2, 32),
    "amb-crickets-night": (30, 2, 32),
}
THUNDER = ["sfx-thunder-1", "sfx-thunder-2", "sfx-thunder-3"]
# The music loops at its quietest moment in this window (seconds), most likely a phrase break.
MUSIC_LOOP = (140, 160)


def decode(name, channels):
    tmp = tempfile.mktemp(suffix=".wav")
    subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", str(channels), os.path.join(SRC, name + ".mp3"), tmp], check=True)
    with wave.open(tmp) as w:
        data = array.array("h", w.readframes(w.getnframes()))
    os.remove(tmp)
    # Floats in an array, not a list: the music alone is ~19M samples.
    return array.array("f", (x / 32768 for x in data))


def encode(name, samples, channels, kbps):
    tmp = tempfile.mktemp(suffix=".wav")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(array.array("h", (max(-32767, min(32767, round(x * 32767))) for x in samples)).tobytes())
    out = os.path.join(OUT, name + ".m4a")
    # 'aach' = HE-AAC v1. Not v2 (parametric stereo): it narrowed the birds' stereo image by ~40 %.
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aach", "-b", str(kbps * 1000), tmp, out], check=True)
    os.remove(tmp)
    print(f"{name}: {len(samples) / channels / RATE:.1f} s, {os.path.getsize(out) / 1024:.0f} KB")


def loop(x, channels, start, seconds, xfade=XFADE):
    """`seconds` of audio from `start` whose end runs into its beginning: the last `xfade` seconds are blended (equal power)
    over the first ones, so a sample-exact loop has no seam."""
    s, n, k = int(start * RATE) * channels, int(seconds * RATE) * channels, int(xfade * RATE) * channels
    c = x[s : s + n + k]
    y = c[:n]
    for i in range(k):
        a = (i // channels) / (k // channels) * math.pi / 2
        y[i] = c[i] * math.sin(a) + c[n + i] * math.cos(a)
    return y


def loudness(x, rms_db=-20.0, peak=0.95):
    rms = math.sqrt(sum(v * v for v in x) / len(x)) or 1e-9
    gain = min(10 ** (rms_db / 20) / rms, peak / (max(abs(v) for v in x) or 1e-9))
    return array.array("f", (v * gain for v in x))


def quietest(x, channels, lo, hi, window=0.5):
    """Start (seconds) of the quietest `window` between lo and hi."""
    best, at = float("inf"), lo
    t = lo
    while t < hi:
        a, b = int(t * RATE) * channels, int((t + window) * RATE) * channels
        e = sum(v * v for v in x[a:b])
        if e < best:
            best, at = e, t
        t += 0.25
    return at


os.makedirs(OUT, exist_ok=True)
for name, (seconds, channels, kbps) in LOOPS.items():
    # Skip the first seconds: recordings often start with handling noise.
    x = loudness(loop(decode(name, channels), channels, 2.0, seconds))
    encode(name, x + x[: int(PAD * RATE) * channels], channels, kbps)

for name in THUNDER:
    x = decode(name, 1)[: 10 * RATE]
    fade_in, fade_out = int(0.02 * RATE), 3 * RATE
    x = array.array("f", (v * min(1, i / fade_in, (len(x) - i) / fade_out) for i, v in enumerate(x)))
    encode(name, loudness(x, rms_db=-14.0, peak=0.9), 1, 24)

music = decode("music-theme", 2)
end = quietest(music, 2, *MUSIC_LOOP)
# Streamed, not padded: a stream can't skip the fade-in, so the score gets a ~20 ms gap at its phrase-break seam.
encode("music-theme", loudness(loop(music, 2, 0.0, end, xfade=4.0), rms_db=-18.0), 2, 40)

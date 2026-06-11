# Backlog

## Inbox

- **fix** Click-free bypass — the bypassed branch in ClipperEngine::process returns early without feeding either oversampler, so their filter state goes stale while the blade is up. Toggling bypass mid-audio clicks. Either keep feeding oversamplers during bypass or crossfade over a few ms. (2026-06-10)
- **chore** Exact host PDC via integer latency — min-phase oversampler latency is fractional and we round for setLatencySamples, so host alignment is off by up to half a sample. JUCE Oversampling has a shouldUseIntegerLatency mode that adds a fractional delay internally to make the total integer. Matters for parallel processing in the DAW. (2026-06-10)
- **chore** Bump `softprops/action-gh-release@v1` and `maxim-lobanov/setup-xcode@v1` in CI — these use Node 16/20, GitHub removes Node 20 support 2026-09-16. `checkout@v4`, `upload-artifact@v4`, `download-artifact@v4` are already fine. (2026-06-10)
- **chore** Wire up `release-notes/` to CI — pass `body_path` to `softprops/action-gh-release` if `release-notes/<version>.md` exists. Currently added manually after the draft. (2026-02-14)

## Up Next

- **chore** Remove old `Guillotine.vst3` and `Guillotine.component` from `/Library/Audio/Plug-Ins/` — prerequisite for the test suite fix below. Tests are silently passing against the stale pre-rename binary. (2026-02-13)
- **fix** Resurrect the pedalboard test suite — `get_vst3_path()` in `tests/conftest.py:50` still looks for `Guillotine.vst3`. Fix the path, remove the old binary (above), then triage ~50 newly-failing tests: most are ceiling assertions written before Match became the default (b95051d) — set `gain_mode = "Manual"` where tests probe the ceiling, then catch real regressions. (2026-06-09)
- **fix** Post-mix 0dBFS safety clamp — dry/wet mixing can push output above 0dBFS because the dry signal retains original peaks. Enforce ceiling clamps the wet path before mixing, but not the final output. When `enforceCeilingEnabled`, add `std::clamp(sample, -1.0f, 1.0f)` after output gain (after line 416 in ClipperEngine::process). (2026-02-16)
- **docs** README overhaul — current README reads like a reference manual. Add screenshots of the plugin UI, waveform examples showing curve shapes, before/after microscope views. Break up the walls of text with visuals. Goal: someone who just downloaded it can understand what it does and how it sounds before reading a word. (2026-06-11)

## Icebox

- **feature** Multiband clipping — configurable band count (2-3 bands), Linkwitz-Riley crossover filters. Per-band ceiling/threshold + solo/mute. Curve, exponent, oversampling, stereo mode stay global. UI: spectrogram strip above microscope with draggable crossover points; microscope splits into colored columns per band with draggable ceiling lines. Guillotine blade tracks active band only. (2026-02-13)

## Done

- ~~**test** Unit tests for computeAutoGain~~ — shipped, all 5 cases covered in `tests/unit/test_clipper_engine.cpp` (2026-06-11)
- ~~**feature** Gain modes — Manual/Match/Maximize with blended compensation~~ (shipped 4fe2afc)
- ~~**feature** Update detection — check GitHub releases for new versions~~ (shipped a1520a6)
- ~~**feature** Basic/Advanced view — collapsible right panel~~ (shipped 9ab0cf1)

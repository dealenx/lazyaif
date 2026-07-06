Created: 2026-07-06
Mode: fast
Branch: (current — no branch switching)

## Settings

- Testing: no
- Logging: minimal
- Docs: no

## Tasks

### Task 1: Replace video source in MimPlatformSection.astro
- [x] File: `src/components/widgets/MimPlatformSection.astro`
- In the "Готовый результат работы агента" block (around line 137), change `src="/videos/321.mp4"` → `src="/videos/0705.mp4"`
- Remove `data-clip-start="20"` and `data-clip-end="54"` attributes from the same `<video>` element (they were clip bounds for the old 321.mp4 and do not apply to 0705.mp4)
- Keep all other attributes (`autoplay`, `muted`, `loop`, `playsinline`, `data-video-visibility`, `preload`, `style`) unchanged

### Task 2: Another video change
- [ ] File: `src/components/widgets/HeroSection.astro`
- Change `src="/videos/old.mp4"` → `src="/videos/new.mp4"`
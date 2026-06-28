---
name: opentui-examples
description: Real, runnable OpenTUI example apps you can read and adapt. Covers layout, input/editing, scroll/navigation, text/documents, rendering effects, runtime tooling, terminal/native APIs, and 3D/physics. Use when user asks "show me an example", "how do I build X with OpenTUI", "reference implementation", or wants concrete code patterns for terminal UIs.
---

# OpenTUI Examples

Canonical, runnable example apps copied verbatim from the OpenTUI repository
(`packages/examples/src`). Each example is a standalone TypeScript module with
two exports: `run(renderer)` and `destroy(renderer)`. They can be executed
individually (each file has an `import.meta.main` entry that creates its own
renderer) or driven by the menu in `examples/index.ts`.

## Where the code lives

All example sources are in `examples/` relative to this skill root:

- `examples/*.ts` — individual demo modules
- `examples/lib/*.ts` — shared helpers (`setupCommonDemoKeys`, `tab-controller`,
  `HexList`, `PaletteGrid`)
- `examples/index.ts` — the full examples menu application

Asset images used by sprite/texture demos live in the original repo under
`packages/examples/src/assets/` and are NOT copied here. Reference them in the
upstream repo if you need textures for 3D demos.

## Shared keys convention

Most demos wire `setupCommonDemoKeys(renderer)` from `examples/lib/standalone-keys.ts`.
It binds:

- `` ` `` / `"` — toggle the console overlay
- `.` — toggle the debug overlay
- `Ctrl+G` — dump the hit grid
- `Shift+L` / `Shift+S` / `Shift+A` — renderer start/stop/auto
- `Ctrl+A` — log arena-allocated bytes

Keep this convention when you adapt examples so users get consistent debugging.

## Example catalog

The categories below mirror `ExampleCategory` in `examples/index.ts`. Use the
routing table to jump straight to the right file when the user asks for a
pattern.

### Layout & Composition

| Example | File | What it shows |
| --- | --- | --- |
| Input & Select Layout Demo | `examples/input-select-layout-demo.ts` | Interactive layout with input and select elements |
| Layout System Demo | `examples/simple-layout-example.ts` | Flex layout system with multiple configurations |
| Nested Z-Index Demo | `examples/nested-zindex-demo.ts` | z-index behavior with nested render objects |
| OpenTUI Demo | `examples/opentui-demo.ts` | Multi-tab demo with various features |
| Relative Positioning Demo | `examples/relative-positioning-demo.ts` | Child positions relative to parent containers |
| Split Footer Streaming Demo | `examples/split-footer-streaming-demo.ts` | Focused split-footer surface for progressive text/code/markdown |
| Split Mode Demo (Experimental) | `examples/split-mode-demo.ts` | Renderer confined to bottom area with normal output above |
| VNode Composition Demo | `examples/vnode-composition-demo.ts` | Declarative Box(Box(Box(children))) composition |

### Input & Editing

| Example | File | What it shows |
| --- | --- | --- |
| ASCII Font Selection Demo | `examples/ascii-font-selection-demo.ts` | Character-level selection across ASCII font types |
| Editor Demo | `examples/editor-demo.ts` | Interactive text editor with TextareaRenderable |
| Extmarks Demo | `examples/extmarks-demo.ts` | Virtual extmarks the cursor jumps over, with deletion handling |
| Input Demo | `examples/input-demo.ts` | InputElement with validation and multiple fields |
| Keymap Demo | `examples/keymap-demo.ts` | Global/local bindings, leader commands, centered `:` prompt, switchable textareas |
| Mouse Interaction Demo | `examples/mouse-interaction-demo.ts` | Mouse trails and clickable cells |
| Select Demo | `examples/select-demo.ts` | SelectElement with customizable options |
| Slider Demo | `examples/slider-demo.ts` | Slider components in various orientations/configurations |
| Tab Select | `examples/tab-select-demo.ts` | Tab selection demo |
| Text Selection Demo | `examples/text-selection-demo.ts` | Text selection across multiple renderables via mouse drag |

### Scroll & Navigation

| Example | File | What it shows |
| --- | --- | --- |
| ScrollBox Demo | `examples/scroll-example.ts` | Scrollable container with customization |
| Scrollbox Mouse Test | `examples/scrollbox-mouse-test.ts` | Mouse hit detection with hover and click events |
| Scrollbox Overlay Hit Test | `examples/scrollbox-overlay-hit-test.ts` | Hit detection with overlays and dialogs |
| Sticky Scroll Demo | `examples/sticky-scroll-example.ts` | ScrollBox maintains position at borders on content changes |

### Text & Documents

| Example | File | What it shows |
| --- | --- | --- |
| ASCII Font Demo | `examples/fonts.ts` | ASCII font rendering with various colors and text |
| Code Demo | `examples/code-demo.ts` | CodeRenderable + LineNumberRenderable with diff highlights and diagnostics |
| Diff Demo | `examples/diff-demo.ts` | Unified and split diff views, syntax highlighting, themes |
| Full Unicode Demo | `examples/full-unicode-demo.ts` | Draggable boxes over complex graphemes |
| HAST Syntax Highlighting Demo | `examples/hast-syntax-highlighting-demo.ts` | HAST trees to syntax-highlighted text via chunk generation |
| Link Demo | `examples/link-demo.ts` | OSC 8 hyperlinks, clickable links, link inheritance |
| Markdown Demo | `examples/markdown-demo.ts` | Markdown with table alignment, syntax highlighting, theme switching |
| Markdown Code Block Renderer Demo | `examples/markdown-code-block-renderer-demo.ts` | Custom fenced-code rendering for a fake taskflow DSL |
| QR Code Demo | `examples/qrcode-demo.ts` | Intrinsic QR code renderable with manual scaling and half-block output |
| Styled Text Demo | `examples/styled-text-demo.ts` | Template literals with styled text, colors, and formatting |
| Text Truncation Demo | `examples/text-truncation-demo.ts` | Middle truncation with ellipsis, responsive to resize |
| Text Wrap Demo | `examples/text-wrap.ts` | Text wrapping behavior |
| TextNode Demo | `examples/text-node-demo.ts` | TextNode API for complex styled text structures |
| TextTable Demo | `examples/text-table-demo.ts` | TextTable renderable with styled chunks, Unicode content, wrap/border toggles |
| Wide Grapheme Overlay Demo | `examples/wide-grapheme-overlay-demo.ts` | Drag transparent boxes over CJK/emoji, toggle dimming scrim with `D` |

### Rendering & Effects

| Example | File | What it shows |
| --- | --- | --- |
| Framebuffer Demo | `examples/framebuffer-demo.ts` | Framebuffer rendering techniques |
| Grayscale Buffer | `examples/grayscale-buffer-demo.ts` | Grayscale rendering with 1x vs 2x supersampled intensity |
| Opacity Demo | `examples/opacity-example.ts` | Box opacity with animated opacity transitions |
| Timeline Example | `examples/timeline-example.ts` | Animation timeline system |
| Transparency Demo | `examples/transparency-demo.ts` | Alpha blending and transparency effects |

### Runtime & Tooling

| Example | File | What it shows |
| --- | --- | --- |
| Console Demo | `examples/console-demo.ts` | Interactive console logging with clickable log-level buttons |
| Core Plugin Slots Demo | `examples/core-plugin-slots-demo.ts` | Framework-free plugin slots with cached renderables and deterministic ordering |
| Live State Management Demo | `examples/live-state-demo.ts` | Automatic renderer lifecycle management with live renderables |

### Terminal & Native

| Example | File | What it shows |
| --- | --- | --- |
| Audio Demo | `examples/native-audio-demo.ts` | WAV-based native mixer with sound groups and live meter stats |
| Clipboard & Paste Test Bed | `examples/clipboard-paste-demo.ts` | OSC 52 copy, paste transport, editor semantics diagnostics |
| Focus Restore Demo | `examples/focus-restore-demo.ts` | Alt-tab away and back to verify mouse tracking resumes |
| Keypress Debug Tool | `examples/keypress-debug-demo.ts` | Inspect keypress events, raw input, terminal capabilities |
| Notification Demo | `examples/notification-demo.ts` | Standalone OSC terminal notifications with capability detection |
| Terminal Palette Demo | `examples/terminal.ts` | Terminal color palette detection and visualization (256 colors) |
| Terminal Title Demo | `examples/terminal-title.ts` | Set/update the terminal window title via OSC sequences |

### 3D & Physics (require @opentui/three in Node.js)

These demos are Bun-only in the upstream bundle. The TS sources are copied
here for reference; running them outside Bun requires `@opentui/three`.

| Example | File | What it shows |
| --- | --- | --- |
| Draggable ThreeRenderable | `examples/draggable-three-demo.ts` | Draggable WebGPU cube with live animation |
| Fractal Shader | `examples/fractal-shader-demo.ts` | Fractal rendering with shaders |
| Golden Star Demo | `examples/golden-star-demo.ts` | 3D golden star with particle effects celebrating 5000 stars |
| Physics Planck | `examples/physx-planck-2d-demo.ts` | 2D physics with Planck.js |
| Physics Rapier | `examples/physx-rapier-2d-demo.ts` | 2D physics with Rapier |
| Phong Lighting | `examples/lights-phong-demo.ts` | Phong lighting model demo |
| Shader Cube | `examples/shader-cube-demo.ts` | 3D cube with custom shaders |
| Sprite Animation | `examples/sprite-animation-demo.ts` | Animated sprite sequences |
| Sprite Particles | `examples/sprite-particle-generator-demo.ts` | Particle system with sprites |
| Static Sprite | `examples/static-sprite-demo.ts` | Static sprite rendering demo |
| Texture Loading | `examples/texture-loading-demo.ts` | Loading and displaying textures |

## Quick routing by intent

| User intent | Start here |
| --- | --- |
| `flexbox`, `layout`, `positioning`, `z-index` | `examples/simple-layout-example.ts`, `examples/relative-positioning-demo.ts`, `examples/nested-zindex-demo.ts` |
| `input`, `form`, `validation`, `textarea`, `editor` | `examples/input-demo.ts`, `examples/editor-demo.ts` |
| `select`, `dropdown`, `tab`, `slider` | `examples/select-demo.ts`, `examples/tab-select-demo.ts`, `examples/slider-demo.ts` |
| `scroll`, `scrollbox`, `sticky`, `pagination` | `examples/scroll-example.ts`, `examples/sticky-scroll-example.ts`, `examples/scrollbox-overlay-hit-test.ts` |
| `text`, `styled`, `markdown`, `code`, `diff`, `qrcode`, `link` | `examples/styled-text-demo.ts`, `examples/markdown-demo.ts`, `examples/code-demo.ts`, `examples/diff-demo.ts`, `examples/qrcode-demo.ts`, `examples/link-demo.ts` |
| `table`, `texttable`, `grid` | `examples/text-table-demo.ts` |
| `unicode`, `graphemes`, `wide chars`, `cjk` | `examples/full-unicode-demo.ts`, `examples/wide-grapheme-overlay-demo.ts` |
| `mouse`, `click`, `drag`, `hover` | `examples/mouse-interaction-demo.ts`, `examples/scrollbox-mouse-test.ts` |
| `animation`, `timeline`, `transparency`, `opacity`, `framebuffer` | `examples/timeline-example.ts`, `examples/transparency-demo.ts`, `examples/opacity-example.ts`, `examples/framebuffer-demo.ts` |
| `plugins`, `slots`, `extensions` | `examples/core-plugin-slots-demo.ts` |
| `vnode`, `composition`, `declarative` | `examples/vnode-composition-demo.ts` |
| `console`, `logging`, `debug overlay` | `examples/console-demo.ts`, `examples/lib/standalone-keys.ts` |
| `audio`, `wav`, `mixer`, `pcm` | `examples/native-audio-demo.ts` |
| `clipboard`, `paste`, `osc 52`, `copy` | `examples/clipboard-paste-demo.ts` |
| `notification`, `osc`, `title`, `palette`, `capabilities` | `examples/notification-demo.ts`, `examples/terminal-title.ts`, `examples/terminal.ts` |
| `keypress`, `debug keys`, `raw input` | `examples/keypress-debug-demo.ts` |
| `focus`, `alt-tab`, `mouse tracking` | `examples/focus-restore-demo.ts` |
| `split`, `streaming footer`, `alt screen` | `examples/split-mode-demo.ts`, `examples/split-footer-streaming-demo.ts` |
| `3d`, `webgpu`, `shader`, `cube`, `sprite`, `texture`, `physics`, `planck`, `rapier` | `examples/shader-cube-demo.ts`, `examples/fractal-shader-demo.ts`, `examples/sprite-animation-demo.ts`, `examples/physx-planck-2d-demo.ts`, `examples/physx-rapier-2d-demo.ts` |
| `keymap`, `bindings`, `leader`, `commands` | `examples/keymap-demo.ts` |
| `extmarks`, `virtual ranges`, `cursor jumps` | `examples/extmarks-demo.ts` |
| `hast`, `syntax highlighting`, `tree` | `examples/hast-syntax-highlighting-demo.ts` |
| `live state`, `lifecycle`, `auto cleanup` | `examples/live-state-demo.ts` |

## Working rules

- Prefer reading the concrete example file that matches the user's intent over
  summarizing prose. The code is the source of truth.
- When adapting an example, preserve the two-export contract: `run(renderer)` to
  mount renderables, `destroy(renderer)` to tear them down. Keep cleanup
  symmetric to avoid leaked renderables across demo switches.
- Wire `setupCommonDemoKeys(renderer)` so users get the standard debug keys
  (console toggle on `` ` ``, debug overlay on `.`, hit-grid dump on `Ctrl+G`).
- Standalone entry is `if (import.meta.main) { const renderer = await
  createCliRenderer({ exitOnCtrlC: true, onDestroy: resetStandaloneState });
  setupCommonDemoKeys(renderer); run(renderer) }`. Keep this pattern when you
  want a single-file runnable example.
- For 3D/physics demos, note the `@opentui/three` dependency and the Bun-only
  constraint from the upstream bundle.
- Asset images (`examples/assets/` in the upstream repo) are not copied. If a
  3D/sprite demo needs textures, point users to the upstream `assets/`
  directory.
- Cross-reference the conceptual docs in the sibling `opentui` skill
  (`docs/**/*.mdx`) when the user also wants the "why" behind a pattern.

## Running an example

From the OpenTUI repo (or a project with `@opentui/core` installed):

```bash
bun run packages/examples/src/<example-file>.ts
```

Each example file has an `import.meta.main` guard so it boots its own renderer
when executed directly. The menu app (`index.ts`) orchestrates all of them with
filtering and category navigation.
#!/usr/bin/env bun
import { $ } from "bun";

await $`bun build bin/lazyaif.ts --outdir dist --target=node --external @opentui/core`;

const file = Bun.file("dist/lazyaif.js");
let text = await file.text();
text = text.replace(/^#!\/usr\/bin\/env bun/, "#!/usr/bin/env node");
await Bun.write("dist/lazyaif.js", text);
console.log("[prebuild] dist/lazyaif.js ready (node shebang)");
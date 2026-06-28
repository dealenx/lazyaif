import pkg from "../../package.json" with { type: "json" };

export const VERSION: string = pkg.version;

console.debug(`[shared:version] resolved VERSION=${VERSION}`);
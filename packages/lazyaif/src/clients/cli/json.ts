export function renderJson(data: unknown): string {
  console.debug(`[cli:json] rendering data type=${typeof data}`);
  return JSON.stringify(data, null, 2);
}
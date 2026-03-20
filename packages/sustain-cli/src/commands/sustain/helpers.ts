import { createDefaultSustainContext } from "../../core/sustain/engine";

let context: ReturnType<typeof createDefaultSustainContext> | null = null;

export function getSustainContext() {
  if (!context) {
    context = createDefaultSustainContext();
  }
  return context;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

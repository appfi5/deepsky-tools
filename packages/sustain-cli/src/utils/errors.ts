export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

export function reportError(error: unknown): never {
  throw error instanceof Error ? error : new Error(toErrorMessage(error));
}

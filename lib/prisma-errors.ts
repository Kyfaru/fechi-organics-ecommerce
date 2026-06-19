export function isPrismaTableMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const maybePrismaError = error as { code?: unknown };
  return maybePrismaError.code === "P2021";
}

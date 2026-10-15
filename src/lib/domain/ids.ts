let counter = 0;

/** Génère un identifiant stable et unique, préfixé par le type d'entité. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${counter.toString(36)}`;
  return `${prefix}_${random}`;
}

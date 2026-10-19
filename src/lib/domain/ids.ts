let counter = 0;
/** Graine active pendant l'exécution d'une commande (identifiants reproductibles). */
let seeded: { seed: string; n: number } | null = null;

/** Génère un identifiant stable et unique, préfixé par le type d'entité. */
export function newId(prefix: string): string {
  if (seeded) return `${prefix}_${seeded.seed}${(seeded.n++).toString(36)}`;
  counter = (counter + 1) % 1_000_000;
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${counter.toString(36)}`;
  return `${prefix}_${random}`;
}

/** Graine aléatoire pour `withIdSeed` (12 caractères alphanumériques). */
export function newIdSeed(): string {
  return newId("s").slice(2, 14);
}

/**
 * Exécute `fn` en générant des identifiants déterministes dérivés de `seed`.
 * Le navigateur et le serveur exécutent ainsi la même commande avec les mêmes
 * identifiants : une fiche créée localement garde son identifiant une fois
 * enregistrée côté serveur.
 */
export function withIdSeed<T>(seed: string, fn: () => T): T {
  if (!/^[a-z0-9]{8,32}$/.test(seed)) throw new Error("Graine d'identifiant invalide.");
  const previous = seeded;
  seeded = { seed, n: 0 };
  try {
    return fn();
  } finally {
    seeded = previous;
  }
}

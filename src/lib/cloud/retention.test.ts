import { describe, expect, it } from "vitest";
import { autoSnapshotDue, isMissingTable, isNamed, MAX_SNAPSHOTS, snapshotsToPurge, type RetentionRow } from "./retention";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
let seq = 0;
const row = (h: number, p: Partial<RetentionRow> = {}): RetentionRow => ({ id: ++seq, kind: "auto", label: null, createdAt: hoursAgo(h), ...p });

describe("historique des versions : instantané automatique", () => {
  it("au plus une fois par heure", () => {
    expect(autoSnapshotDue(null, NOW)).toBe(true);
    expect(autoSnapshotDue(hoursAgo(0.5), NOW)).toBe(false);
    expect(autoSnapshotDue(hoursAgo(0.999), NOW)).toBe(false);
    expect(autoSnapshotDue(hoursAgo(1), NOW)).toBe(true);
    expect(autoSnapshotDue("pas une date", NOW)).toBe(true);
  });
});

describe("historique des versions : table absente", () => {
  it("reconnaît la migration 0007 non appliquée (PostgreSQL ou PostgREST)", () => {
    expect(isMissingTable({ code: "42P01", message: 'relation "public.app_state_history" does not exist' })).toBe(true);
    expect(isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.app_state_history' in the schema cache" })).toBe(true);
    expect(isMissingTable({ message: "Could not find the table 'public.app_state_history' in the schema cache" })).toBe(true);
    expect(isMissingTable({ code: "23514", message: "violates check constraint" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});

describe("historique des versions : rétention", () => {
  it("garde tout sur 48 h", () => {
    const rows = [row(0), row(1), row(1.1), row(10), row(47.9)];
    expect(snapshotsToPurge(rows, NOW)).toEqual([]);
  });

  it("au-delà de 48 h, garde le plus récent de chaque jour jusqu'à 30 jours", () => {
    // 17/11 12:00 UTC = 13:00 à Paris. 3 jours avant : 14/11 ; 10:00 et 11:00 UTC le même jour.
    const latest = row(72 + 1); // 14/11 11:00 UTC
    const older = row(72 + 2); // 14/11 10:00 UTC
    const otherDay = row(96); // 13/11
    const tooOld = row(31 * 24);
    const purged = snapshotsToPurge([older, latest, otherDay, tooOld], NOW);
    expect(purged.sort()).toEqual([older.id, tooOld.id].sort());
  });

  it("le jour est celui du fuseau de l'espace", () => {
    // 14/11 23:30 UTC = 15/11 00:30 à Paris : deux jours distincts à Paris, un seul en UTC.
    const a = { ...row(0), createdAt: "2026-11-14T23:30:00.000Z" };
    const b = { ...row(0), createdAt: "2026-11-14T22:30:00.000Z" };
    expect(snapshotsToPurge([a, b], NOW, "Europe/Paris")).toEqual([]);
    expect(snapshotsToPurge([a, b], NOW, "UTC")).toEqual([b.id]);
    // Fuseau invalide : repli sur la date UTC, sans erreur.
    expect(snapshotsToPurge([a, b], NOW, "Pas/Un_Fuseau")).toEqual([b.id]);
  });

  it("garde les points nommés 90 jours", () => {
    const named = row(60 * 24, { kind: "manual", label: "Avant la réorganisation" });
    const namedOld = row(91 * 24, { kind: "manual", label: "Ancien" });
    const unnamedOld = row(60 * 24, { kind: "before_import" });
    const purged = snapshotsToPurge([named, namedOld, unnamedOld], NOW);
    expect(purged.sort()).toEqual([namedOld.id, unnamedOld.id].sort());
    expect(isNamed({ kind: "manual", label: "  " })).toBe(false);
    expect(isNamed({ kind: "before_restore", label: "x" })).toBe(false);
  });

  it("ne garde que les 200 plus récents", () => {
    const rows = Array.from({ length: MAX_SNAPSHOTS + 5 }, (_, i) => row(i * 0.1));
    const purged = snapshotsToPurge(rows, NOW);
    expect(purged).toHaveLength(5);
    expect(purged).toEqual(rows.slice(MAX_SNAPSHOTS).map((r) => r.id));
  });

  it("conserve un horodatage illisible et un instantané daté dans le futur", () => {
    const odd = { ...row(0), createdAt: "???" };
    const future = row(-2);
    expect(snapshotsToPurge([odd, future], NOW)).toEqual([]);
  });
});

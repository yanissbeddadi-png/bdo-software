import { describe, expect, it } from "vitest";
import { levelFromXp, titleForLevel, totalXpForLevel, xpRequiredForNext } from "./levels";

describe("courbe d'expérience", () => {
  it("XP requise = 100 + 25 × (niveau − 1)", () => {
    expect(xpRequiredForNext(1)).toBe(100);
    expect(xpRequiredForNext(2)).toBe(125);
    expect(xpRequiredForNext(10)).toBe(325);
  });

  it("XP cumulée par niveau", () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(100);
    expect(totalXpForLevel(3)).toBe(225);
    expect(totalXpForLevel(4)).toBe(375);
  });

  it("passage de niveau exactement au seuil", () => {
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(100).xpIntoLevel).toBe(0);
  });

  it("une seule action peut faire franchir plusieurs niveaux", () => {
    const before = levelFromXp(50).level;
    const after = levelFromXp(50 + 400).level;
    expect(before).toBe(1);
    expect(after).toBe(4);
    expect(levelFromXp(450).xpIntoLevel).toBe(75);
  });

  it("plafonne au niveau 100", () => {
    expect(levelFromXp(10_000_000).level).toBe(100);
    expect(levelFromXp(10_000_000).isMax).toBe(true);
  });

  it("titres ludiques", () => {
    expect(titleForLevel(1)).toBe("Débutant");
    expect(titleForLevel(9)).toBe("Prospecteur");
    expect(titleForLevel(20)).toBe("Gestionnaire de comptes");
    expect(titleForLevel(100)).toBe("Maître du CRM");
  });
});

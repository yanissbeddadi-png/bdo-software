import { describe, expect, it } from "vitest";
import { loginPath, safeNextPath } from "./navigation";

describe("safeNextPath (retour après connexion)", () => {
  it("accepte les chemins internes", () => {
    expect(safeNextPath("/contacts")).toBe("/contacts");
    expect(safeNextPath("/contacts/ct_1?onglet=notes#x")).toBe("/contacts/ct_1?onglet=notes#x");
  });

  it("refuse les redirections hors de l'application", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "evil.example", "/", "", "/\t/evil.example", "/\n/evil.example", " /contacts", "javascript:alert(1)"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined, "/accueil")).toBe("/accueil");
  });
});

describe("loginPath", () => {
  it("encode le chemin courant", () => {
    expect(loginPath("/contacts?relation=prospect")).toBe("/connexion?suite=%2Fcontacts%3Frelation%3Dprospect");
  });
  it("ignore un chemin non interne ou la racine", () => {
    expect(loginPath("/")).toBe("/connexion");
    expect(loginPath("//evil.example")).toBe("/connexion");
  });
});

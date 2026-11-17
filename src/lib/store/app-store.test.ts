import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppData } from "@/lib/domain/types";
import * as C from "@/lib/domain/commands";
import { CLIENT_INPUT, emptyData } from "@/test/fixtures";

/**
 * Store du navigateur en mode partagé : les Server Actions sont simulées pour vérifier
 * l'annulation des modifications optimistes et le retour à la connexion.
 */

const actions = vi.hoisted(() => ({
  loadSession: vi.fn(),
  pullRemote: vi.fn(),
  replaceRemote: vi.fn(),
  resetRemote: vi.fn(),
  runRemote: vi.fn(),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cloud/actions", () => actions);
vi.mock("@/lib/cloud/session", () => ({ hardNavigate: navigate }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

Object.assign(globalThis, { window: { location: { pathname: "/contacts", search: "?relation=prospect" }, addEventListener: () => {} } });

const { useAppStore } = await import("./app-store");

function server(): AppData {
  const data = emptyData();
  data.settings.user = { id: "u1", name: "Sacha", email: "s@x.example", role: "dirigeant", employeeId: null };
  return data;
}

/** Attend la fin de la file d'envoi du store. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ mode: "cloud", data: server(), version: 3, pending: 0, unsaved: false, status: "ready" });
});

describe("store partagé", () => {
  it("annule une modification optimiste refusée sans état renvoyé (resynchronisation forcée)", async () => {
    actions.runRemote.mockResolvedValue({ ok: false, error: "Erreur serveur.", fieldErrors: {} });
    actions.pullRemote.mockResolvedValue({ changed: true, data: server(), version: 3 });
    const res = useAppStore.getState().run(C.createClient, CLIENT_INPUT);
    expect(res.ok).toBe(true);
    expect(useAppStore.getState().data!.clients).toHaveLength(1);
    await flush();
    expect(actions.pullRemote).toHaveBeenCalledWith(-1);
    const s = useAppStore.getState();
    expect(s.data!.clients).toHaveLength(0);
    expect(s.unsaved).toBe(false);
    expect(s.pending).toBe(0);
  });

  it("reste « Non enregistré » tant que la resynchronisation échoue, puis relit tout", async () => {
    actions.runRemote.mockRejectedValue(new Error("réseau"));
    actions.pullRemote.mockRejectedValue(new Error("réseau"));
    useAppStore.getState().run(C.createClient, CLIENT_INPUT);
    await flush();
    expect(useAppStore.getState().unsaved).toBe(true);
    expect(useAppStore.getState().data!.clients).toHaveLength(1);
    actions.pullRemote.mockResolvedValue({ changed: true, data: server(), version: 3 });
    await useAppStore.getState().refresh();
    expect(actions.pullRemote).toHaveBeenLastCalledWith(-1);
    expect(useAppStore.getState().unsaved).toBe(false);
    expect(useAppStore.getState().data!.clients).toHaveLength(0);
  });

  it("session expirée : redirection vers la connexion avec la page en cours", async () => {
    actions.runRemote.mockResolvedValue({ ok: false, error: "Session expirée : reconnectez-vous.", fieldErrors: {} });
    useAppStore.getState().run(C.createClient, CLIENT_INPUT);
    await flush();
    expect(navigate).toHaveBeenCalledWith("/connexion?suite=%2Fcontacts%3Frelation%3Dprospect");
    expect(actions.pullRemote).not.toHaveBeenCalled();
  });
});

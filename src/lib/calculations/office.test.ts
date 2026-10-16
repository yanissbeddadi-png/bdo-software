import { describe, expect, it } from "vitest";
import { createSeedData } from "@/lib/database/seed";
import { summarizeData } from "./invoices";
import { computeAlerts } from "./alerts";
import { daySchedule, directorPresence, localDateMinute, officePresence, zoneById, zoneStates, ZONES, type Point, type ZoneId } from "./office";

const TODAY = "2026-10-16";
const d = createSeedData(TODAY);
const inZone = (p: Point, id: ZoneId) => {
  const r = zoneById(id).rect;
  return p.x > r.x && p.x < r.x + r.w && p.z > r.z && p.z < r.z + r.d;
};

describe("bureaux virtuels", () => {
  it("convertit les horodatages dans le fuseau de l'entreprise", () => {
    expect(localDateMinute("2026-10-16T08:00:00.000Z", "Europe/Paris")).toEqual({ date: "2026-10-16", minute: 600 });
    expect(localDateMinute("2026-01-15T23:30:00.000Z", "Europe/Paris")).toEqual({ date: "2026-01-16", minute: 30 });
  });

  it("attribue à chaque collaborateur un poste distinct dans la zone de son service", () => {
    const presence = officePresence(d, TODAY, 11 * 60);
    expect(presence).toHaveLength(d.employees.filter((e) => e.status !== "left").length);
    for (const p of presence) expect(inZone(p.desk, p.zone)).toBe(true);
    const keys = presence.map((p) => `${p.desk.x}:${p.desk.z}`);
    expect(new Set(keys).size).toBe(keys.length);
    const me = directorPresence(d, 11 * 60, presence.filter((p) => p.zone === "direction").length);
    expect(inZone(me.desk, "direction")).toBe(true);
    expect(keys).not.toContain(`${me.desk.x}:${me.desk.z}`);
  });

  it("dérive l'occupation de l'emploi du temps : hors bureau, réunion, appel, pause, travail", () => {
    const at = (minute: number, id: string) => officePresence(d, TODAY, minute).find((p) => p.employee.id === id)!;
    expect(at(8 * 60, "emp_camille").activity).toBe("away");
    expect(at(19 * 60, "emp_camille").activity).toBe("away");
    // Démo Kerys à 10 h (heure de Paris) : Camille en salle de réunion.
    const demo = at(10 * 60 + 15, "emp_camille");
    expect(demo.activity).toBe("meeting");
    expect(inZone(demo.position, "reunion")).toBe(true);
    // Appel de Nora à 14 h : reste à son poste.
    const call = at(14 * 60 + 10, "emp_nora");
    expect(call.activity).toBe("call");
    expect(call.position).toEqual(call.desk);
    // Chacun déjeune une heure entre 12 h et 14 h, dans l'espace détente.
    for (const e of d.employees.filter((x) => x.status === "active")) {
      const lunch = daySchedule(d, TODAY).find((ev) => ev.employeeId === e.id && ev.activity === "lunch")!;
      expect(lunch.start).toBeGreaterThanOrEqual(12 * 60);
      expect(lunch.end).toBeLessThanOrEqual(14 * 60);
      const p = at(lunch.start + 10, e.id);
      if (p.activity === "lunch") expect(inZone(p.position, "detente")).toBe(true);
    }
    // Hors événement : travail sur une tâche ouverte.
    const work = at(9 * 60 + 5, "emp_hugo");
    expect(work.activity).toBe("working");
    expect(work.currentTask?.assigneeId).toBe("emp_hugo");
  });

  it("est déterministe pour une même minute", () => {
    expect(officePresence(d, TODAY, 15 * 60)).toEqual(officePresence(d, TODAY, 15 * 60));
  });

  it("gère les congés et les départs", () => {
    const data = structuredClone(d);
    data.employees[0]!.status = "leave";
    data.employees[1]!.status = "left";
    const presence = officePresence(data, TODAY, 11 * 60);
    expect(presence.find((p) => p.employee.id === data.employees[0]!.id)?.activity).toBe("leave");
    expect(presence.some((p) => p.employee.id === data.employees[1]!.id)).toBe(false);
  });

  it("rattache les alertes aux zones et verrouille les zones selon le rang", () => {
    const summaries = summarizeData(d, TODAY);
    const alerts = computeAlerts(d, TODAY, summaries);
    const presence = officePresence(d, TODAY, 11 * 60);
    const states = zoneStates(d, TODAY, summaries, alerts, 3, presence);
    const finance = states.find((s) => s.zone.id === "finance")!;
    expect(finance.alerts.some((a) => a.kind === "invoice_overdue")).toBe(true);
    expect(finance.kpis.find((k) => k.label === "Trésorerie")?.unit).toBe("eur");
    expect(states.find((s) => s.zone.id === "rnd")!.unlocked).toBe(false);
    expect(zoneStates(d, TODAY, summaries, alerts, 4, presence).find((s) => s.zone.id === "rnd")!.unlocked).toBe(true);
    // Les occupants comptés correspondent aux présents.
    expect(states.reduce((s, z) => s + z.occupants, 0)).toBe(presence.filter((p) => p.location !== "away").length);
  });

  it("le plan couvre le bâtiment sans chevauchement", () => {
    const area = ZONES.reduce((s, z) => s + z.rect.w * z.rect.d, 0);
    expect(area).toBe(32 * 22);
  });
});

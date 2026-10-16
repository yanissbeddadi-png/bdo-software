"use client";
import * as React from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { blockGeometry } from "./office-geometry";
import { BUILDING, gatheringSpots, zoneById, type Point, type ZoneState } from "@/lib/calculations/office";
import { boardTexture, hazardTexture, labelTexture, studTexture } from "./office-textures";
import { hashString } from "./office-character";

/** Origine : le bâtiment est centré sur (0, 0). */
export const OX = -BUILDING.width / 2;
export const OZ = -BUILDING.depth / 2;
export const at = (p: Point, y = 0): [number, number, number] => [p.x + OX, y, p.z + OZ];

export type OfficeTarget = { type: "zone"; id: string } | { type: "employee"; id: string } | { type: "desk"; id: string } | null;

export interface DeskSlot {
  p: Point;
  ownerId: string | null;
  key: string;
}

interface Interaction {
  hovered: OfficeTarget;
  selected: OfficeTarget;
  onHover: (t: OfficeTarget) => void;
  onSelect: (t: OfficeTarget) => void;
}

const same = (a: OfficeTarget, b: OfficeTarget) => !!a && !!b && a.type === b.type && a.id === b.id;

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function Block({
  position,
  size,
  color,
  radius = 0.04,
  emissive,
  emissiveIntensity = 1,
  roughness = 0.5,
  metalness = 0,
  map,
  rotation,
  transparent,
  opacity,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  radius?: number;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture;
  rotation?: [number, number, number];
  transparent?: boolean;
  opacity?: number;
}) {
  const material = (
    <meshStandardMaterial
      color={color}
      map={map ?? null}
      roughness={roughness}
      metalness={metalness}
      emissive={emissive ?? "#000000"}
      emissiveIntensity={emissive ? emissiveIntensity : 0}
      transparent={transparent}
      opacity={opacity ?? 1}
    />
  );
  const geometry = blockGeometry(size[0], size[1], size[2], map ? 0 : radius);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation} castShadow={!transparent} receiveShadow>
      {material}
    </mesh>
  );
}

/** Mélange une couleur avec du blanc (sols pastel). */
function tint(color: string, amount: number): string {
  return `#${new THREE.Color(color).lerp(new THREE.Color("#ffffff"), amount).getHexString()}`;
}

function Plant({ p, big }: { p: Point; big?: boolean }) {
  const s = big ? 1.4 : 1;
  return (
    <group position={at(p)} scale={s}>
      <Block position={[0, 0.2, 0]} size={[0.42, 0.4, 0.42]} color="#b45309" radius={0.06} />
      <Block position={[0, 0.6, 0]} size={[0.55, 0.45, 0.55]} color="#16a34a" radius={0.1} />
      <Block position={[0, 0.95, 0]} size={[0.38, 0.35, 0.38]} color="#22c55e" radius={0.08} />
    </group>
  );
}

function Tree({ p, h }: { p: Point; h: number }) {
  return (
    <group position={at(p)}>
      <Block position={[0, h / 2, 0]} size={[0.6, h, 0.6]} color="#7c4a1e" radius={0.06} />
      <Block position={[0, h + 0.6, 0]} size={[2.6, 1.4, 2.6]} color="#15803d" radius={0.2} />
      <Block position={[0, h + 1.6, 0]} size={[1.8, 1.0, 1.8]} color="#16a34a" radius={0.18} />
      <Block position={[0, h + 2.35, 0]} size={[1.0, 0.7, 1.0]} color="#22c55e" radius={0.14} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Mobilier                                                            */
/* ------------------------------------------------------------------ */

function Chair({ p, rot = 0, color = "#1f2937" }: { p: Point; rot?: number; color?: string }) {
  return (
    <group position={at(p)} rotation={[0, rot, 0]}>
      <Block position={[0, 0.2, 0]} size={[0.1, 0.4, 0.1]} color="#4b5563" radius={0.02} />
      <Block position={[0, 0.42, 0]} size={[0.62, 0.1, 0.6]} color={color} radius={0.04} />
      <Block position={[0, 0.78, 0.29]} size={[0.62, 0.62, 0.1]} color={color} radius={0.04} />
    </group>
  );
}

function Desk({ slot, accent, night, it }: { slot: DeskSlot; accent: string; night: number; it: Interaction }) {
  const target: OfficeTarget = { type: "desk", id: slot.ownerId ?? slot.key };
  const hot =
    same(it.hovered, target) ||
    same(it.selected, target) ||
    (slot.ownerId !== null && (same(it.hovered, { type: "employee", id: slot.ownerId }) || same(it.selected, { type: "employee", id: slot.ownerId })));
  const [x, , z] = at(slot.p);
  const h = hashString(slot.key);
  return (
    <group
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        it.onHover(target);
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        it.onHover(null);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        it.onSelect(target);
      }}
    >
      {/* Plateau et pieds */}
      <Block position={[x, 0.72, z - 0.7]} size={[1.6, 0.08, 0.8]} color={hot ? "#fde68a" : "#f1f5f9"} radius={0.03} emissive={hot ? "#f59e0b" : undefined} emissiveIntensity={0.25} />
      <Block position={[x - 0.72, 0.36, z - 0.7]} size={[0.1, 0.72, 0.7]} color="#94a3b8" radius={0.02} />
      <Block position={[x + 0.72, 0.36, z - 0.7]} size={[0.1, 0.72, 0.7]} color="#94a3b8" radius={0.02} />
      {/* Écran (lumineux) */}
      <Block position={[x, 0.82, z - 0.95]} size={[0.12, 0.16, 0.12]} color="#334155" radius={0.02} />
      <Block position={[x, 1.08, z - 0.98]} size={[0.86, 0.5, 0.06]} color="#0f172a" radius={0.02} />
      <mesh position={[x, 1.08, z - 0.944]}>
        <planeGeometry args={[0.78, 0.42]} />
        <meshStandardMaterial color="#0b1120" emissive={slot.ownerId ? accent : "#1e293b"} emissiveIntensity={slot.ownerId ? 0.9 + night * 1.2 : 0.2} toneMapped={false} />
      </mesh>
      <Block position={[x, 0.78, z - 0.55]} size={[0.6, 0.03, 0.2]} color="#1f2937" radius={0.01} />
      {h % 3 === 0 ? <Block position={[x + 0.55, 0.82, z - 0.55]} size={[0.12, 0.14, 0.12]} color={["#ef4444", "#3b82f6", "#f8fafc"][h % 3 === 0 ? (h >>> 2) % 3 : 0]!} radius={0.03} /> : null}
      {h % 4 === 1 ? <Plant p={{ x: slot.p.x - 0.55, z: slot.p.z - 0.85 }} /> : null}
      <Chair p={slot.p} rot={0} color={slot.ownerId ? "#1f2937" : "#475569"} />
    </group>
  );
}

function Board({ p, kind, seed, w = 2.2 }: { p: Point; kind: "kanban" | "chart"; seed: number; w?: number }) {
  const tex = React.useMemo(() => boardTexture(seed, kind), [seed, kind]);
  const [x, , z] = at(p);
  return (
    <group>
      <Block position={[x - w / 2 + 0.1, 0.7, z]} size={[0.08, 1.4, 0.08]} color="#64748b" radius={0.02} />
      <Block position={[x + w / 2 - 0.1, 0.7, z]} size={[0.08, 1.4, 0.08]} color="#64748b" radius={0.02} />
      <Block position={[x, 1.5, z]} size={[w, 1.2, 0.08]} color="#e2e8f0" radius={0.03} />
      <mesh position={[x, 1.5, z + 0.045]}>
        <planeGeometry args={[w - 0.16, 1.04]} />
        <meshStandardMaterial
          map={tex}
          roughness={0.6}
          emissive={kind === "chart" ? "#ffffff" : "#000000"}
          emissiveMap={kind === "chart" ? tex : null}
          emissiveIntensity={kind === "chart" ? 0.6 : 0}
        />
      </mesh>
    </group>
  );
}

function ZoneDecor({ state, night }: { state: ZoneState; night: number }) {
  const r = state.zone.rect;
  const c: Point = { x: r.x + r.w / 2, z: r.z + r.d / 2 };
  switch (state.zone.id) {
    case "direction":
      return (
        <group>
          <Block position={at({ x: r.x + 0.5, z: c.z }, 0.9)} size={[0.5, 1.8, 2.4]} color="#78350f" radius={0.04} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Block
              key={i}
              position={at({ x: r.x + 0.6, z: c.z - 0.95 + i * 0.38 }, 1.25)}
              size={[0.3, 0.42, 0.26]}
              color={["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#f8fafc"][i]!}
              radius={0.02}
            />
          ))}
          <Block position={at({ x: r.x + r.w - 0.8, z: r.z + 0.9 }, 0.45)} size={[0.6, 0.9, 0.6]} color="#e2e8f0" radius={0.04} />
          <group position={at({ x: r.x + r.w - 0.8, z: r.z + 0.9 }, 1.1)}>
            <mesh castShadow>
              <cylinderGeometry args={[0.22, 0.08, 0.35, 16]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.2} emissive="#f59e0b" emissiveIntensity={0.3} />
            </mesh>
            <mesh position={[0, -0.25, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.2} />
            </mesh>
          </group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={at({ x: c.x + 1, z: c.z + 0.8 }, 0.025)} receiveShadow>
            <planeGeometry args={[3.2, 2.2]} />
            <meshStandardMaterial color="#7f1d1d" roughness={0.9} />
          </mesh>
        </group>
      );
    case "finance":
      return (
        <group>
          <Block position={at({ x: r.x + r.w - 0.8, z: r.z + 0.9 }, 0.6)} size={[1.1, 1.2, 0.9]} color="#334155" radius={0.06} metalness={0.6} roughness={0.35} />
          <mesh position={at({ x: r.x + r.w - 0.8, z: r.z + 1.36 }, 0.65)} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.06, 20]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
          </mesh>
          <Block position={at({ x: r.x + 0.5, z: r.z + 1 }, 0.6)} size={[0.6, 1.2, 0.7]} color="#64748b" radius={0.04} />
          <Board p={{ x: c.x - 0.6, z: r.z + 0.3 }} kind="chart" seed={11} w={1.8} />
        </group>
      );
    case "commercial":
      return (
        <group>
          <Board p={{ x: c.x, z: r.z + 0.3 }} kind="chart" seed={7} w={2.6} />
          <Plant p={{ x: r.x + r.w - 0.6, z: r.z + 0.6 }} big />
        </group>
      );
    case "developpement":
      return (
        <group>
          {[0, 1].map((i) => (
            <group key={i}>
              <Block position={at({ x: r.x + r.w - 0.6 - i * 0.9, z: r.z + 0.7 }, 0.9)} size={[0.7, 1.8, 0.8]} color="#111827" radius={0.04} metalness={0.4} />
              {[0, 1, 2, 3, 4].map((j) => (
                <Block
                  key={j}
                  position={at({ x: r.x + r.w - 0.6 - i * 0.9, z: r.z + 1.11 }, 0.35 + j * 0.3)}
                  size={[0.5, 0.05, 0.02]}
                  color="#0ea5e9"
                  radius={0}
                  emissive="#22d3ee"
                  emissiveIntensity={1.5 + night}
                />
              ))}
            </group>
          ))}
          {/* Le canard de débogage */}
          <group position={at({ x: r.x + 0.8, z: r.z + 0.8 }, 0)}>
            <Block position={[0, 0.25, 0]} size={[0.5, 0.4, 0.6]} color="#facc15" radius={0.12} />
            <Block position={[0, 0.6, 0.15]} size={[0.32, 0.32, 0.32]} color="#facc15" radius={0.1} />
            <Block position={[0, 0.58, 0.36]} size={[0.16, 0.08, 0.14]} color="#f97316" radius={0.03} />
          </group>
        </group>
      );
    case "operations":
      return (
        <group>
          <Board p={{ x: c.x, z: r.z + 0.3 }} kind="kanban" seed={23} w={3} />
          <Plant p={{ x: r.x + 0.6, z: r.z + r.d - 0.6 }} big />
        </group>
      );
    case "support":
      return (
        <group>
          <Block position={at({ x: r.x + r.w - 0.5, z: c.z }, 0.8)} size={[0.5, 1.6, 2]} color="#e2e8f0" radius={0.04} />
          {[0, 1, 2].map((i) => (
            <Block key={i} position={at({ x: r.x + r.w - 0.55, z: c.z - 0.6 + i * 0.6 }, 1.2)} size={[0.36, 0.3, 0.4]} color={["#f472b6", "#a855f7", "#38bdf8"][i]!} radius={0.04} />
          ))}
        </group>
      );
    case "reunion": {
      const seats = gatheringSpots(zoneById("reunion"), 8);
      const tc: Point = { x: c.x, z: c.z + 0.4 };
      return (
        <group>
          <mesh position={at(tc, 0.72)} scale={[3.4, 1, 1.9]} castShadow receiveShadow>
            <cylinderGeometry args={[1, 1, 0.1, 48]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.3} />
          </mesh>
          <Block position={at(tc, 0.36)} size={[0.5, 0.72, 0.5]} color="#94a3b8" radius={0.05} />
          {seats.map((s, i) => (
            <Chair key={i} p={s} rot={Math.atan2(tc.x - s.x, tc.z - s.z) + Math.PI} color="#1d4ed8" />
          ))}
          <Block position={at({ x: c.x, z: r.z + 0.3 }, 1.5)} size={[4.2, 2.2, 0.12]} color="#0f172a" radius={0.04} />
          <mesh position={at({ x: c.x, z: r.z + 0.37 }, 1.5)}>
            <planeGeometry args={[4, 2]} />
            <meshStandardMaterial map={boardTexture(5, "chart")} emissive="#ffffff" emissiveMap={boardTexture(5, "chart")} emissiveIntensity={0.7 + night * 0.6} toneMapped={false} />
          </mesh>
          <Plant p={{ x: r.x + 0.6, z: r.z + r.d - 0.6 }} big />
        </group>
      );
    }
    case "detente":
      return (
        <group>
          {/* Canapé */}
          <group position={at({ x: r.x + 1.1, z: c.z + 0.4 }, 0)}>
            <Block position={[0, 0.3, 0]} size={[1.1, 0.5, 3.2]} color="#dc2626" radius={0.1} />
            <Block position={[-0.45, 0.75, 0]} size={[0.3, 0.6, 3.2]} color="#b91c1c" radius={0.1} />
            <Block position={[0, 0.55, -1.5]} size={[1.1, 0.4, 0.3]} color="#b91c1c" radius={0.1} />
            <Block position={[0, 0.55, 1.5]} size={[1.1, 0.4, 0.3]} color="#b91c1c" radius={0.1} />
          </group>
          {/* Machine à café */}
          <Block position={at({ x: r.x + r.w - 1, z: r.z + 0.7 }, 0.5)} size={[1.6, 1.0, 0.7]} color="#78716c" radius={0.05} />
          <Block position={at({ x: r.x + r.w - 1.2, z: r.z + 0.7 }, 1.25)} size={[0.5, 0.5, 0.45]} color="#1c1917" radius={0.05} />
          <Block position={at({ x: r.x + r.w - 1.2, z: r.z + 0.94 }, 1.35)} size={[0.2, 0.08, 0.02]} color="#f59e0b" radius={0} emissive="#f59e0b" emissiveIntensity={2} />
          {/* Borne d'arcade */}
          <group position={at({ x: r.x + r.w - 0.6, z: r.z + r.d - 1.4 }, 0)} rotation={[0, -Math.PI / 2, 0]}>
            <Block position={[0, 0.9, 0]} size={[0.9, 1.8, 0.8]} color="#7c3aed" radius={0.06} />
            <mesh position={[0, 1.25, 0.41]}>
              <planeGeometry args={[0.7, 0.5]} />
              <meshStandardMaterial color="#000000" emissive="#22d3ee" emissiveIntensity={1.4 + night} toneMapped={false} />
            </mesh>
            <Block position={[0, 0.85, 0.45]} size={[0.8, 0.12, 0.3]} color="#111827" radius={0.03} />
          </group>
          {/* Table basse ronde */}
          <mesh position={at({ x: c.x + 0.3, z: c.z + 0.4 }, 0.45)} castShadow>
            <cylinderGeometry args={[0.8, 0.8, 0.08, 32]} />
            <meshStandardMaterial color="#fde68a" roughness={0.4} />
          </mesh>
          <Block position={at({ x: c.x + 0.3, z: c.z + 0.4 }, 0.22)} size={[0.2, 0.44, 0.2]} color="#a16207" radius={0.04} />
          <Plant p={{ x: r.x + 0.6, z: r.z + 0.7 }} big />
        </group>
      );
    case "accueil":
      return (
        <group>
          <Block position={at({ x: c.x + 0.4, z: c.z }, 0.55)} size={[3.2, 1.1, 0.8]} color="#f8fafc" radius={0.08} />
          <mesh position={at({ x: c.x + 0.4, z: c.z + 0.41 }, 0.6)}>
            <planeGeometry args={[2.4, 0.6]} />
            <meshStandardMaterial map={labelTexture("BDO", { bg: "#1d4ed8", fg: "#ffffff", w: 256, h: 64 })} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <Chair key={i} p={{ x: r.x + 0.8 + i * 0.9, z: r.z + r.d - 0.8 }} rot={Math.PI} color="#0ea5e9" />
          ))}
          <Plant p={{ x: r.x + 0.6, z: r.z + 0.7 }} big />
        </group>
      );
    case "rnd":
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <group key={i}>
              <Block position={at({ x: c.x - 2 + i * 2, z: c.z }, 1)} size={[1, 2, 1]} color="#1e1b4b" radius={0.05} metalness={0.4} />
              <Block position={at({ x: c.x - 2 + i * 2, z: c.z + 0.51 }, 1.2)} size={[0.7, 1.2, 0.02]} color="#4c1d95" radius={0} emissive="#a78bfa" emissiveIntensity={1.4 + night} />
            </group>
          ))}
        </group>
      );
    case "terrasse":
      return (
        <group>
          <mesh position={at(c, 2.2)} castShadow>
            <coneGeometry args={[2, 0.7, 8]} />
            <meshStandardMaterial color="#f97316" roughness={0.6} />
          </mesh>
          <Block position={at(c, 1.1)} size={[0.12, 2.2, 0.12]} color="#e5e7eb" radius={0.03} />
          <mesh position={at(c, 0.7)} castShadow>
            <cylinderGeometry args={[0.9, 0.9, 0.08, 24]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
          {[-1, 1].map((s) => (
            <Block key={s} position={at({ x: c.x + s * 2.2, z: c.z + 1.5 }, 0.3)} size={[0.8, 0.25, 1.8]} color="#38bdf8" radius={0.08} />
          ))}
          <Plant p={{ x: r.x + 0.6, z: r.z + 0.6 }} big />
          <Plant p={{ x: r.x + r.w - 0.6, z: r.z + 0.6 }} big />
        </group>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Zones                                                               */
/* ------------------------------------------------------------------ */

function Partition({ rect, color }: { rect: { x: number; z: number; w: number; d: number }; color: string }) {
  const h = 0.55;
  const t = 0.14;
  const door = 1.6;
  const hw = (rect.w - door) / 2;
  const hd = (rect.d - door) / 2;
  const seg = (x: number, z: number, w: number, d: number, key: string) => <Block key={key} position={at({ x, z }, h / 2)} size={[w, h, d]} color={color} radius={0.05} />;
  return (
    <group>
      {seg(rect.x + hw / 2, rect.z, hw, t, "t1")}
      {seg(rect.x + rect.w - hw / 2, rect.z, hw, t, "t2")}
      {seg(rect.x + hw / 2, rect.z + rect.d, hw, t, "b1")}
      {seg(rect.x + rect.w - hw / 2, rect.z + rect.d, hw, t, "b2")}
      {seg(rect.x, rect.z + hd / 2, t, hd, "l1")}
      {seg(rect.x, rect.z + rect.d - hd / 2, t, hd, "l2")}
      {seg(rect.x + rect.w, rect.z + hd / 2, t, hd, "r1")}
      {seg(rect.x + rect.w, rect.z + rect.d - hd / 2, t, hd, "r2")}
    </group>
  );
}

function AlertMarker({ p, count }: { p: Point; count: number }) {
  const ref = React.useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 1.6;
    ref.current.position.y = 2.4 + Math.sin(clock.elapsedTime * 2.4) * 0.18;
  });
  const [x, , z] = at(p);
  return (
    <group ref={ref} position={[x, 3, z]}>
      <Block position={[0, 0.25, 0]} size={[0.26, 0.75, 0.26]} color="#ef4444" radius={0.06} emissive="#ef4444" emissiveIntensity={1.6} />
      <Block position={[0, -0.38, 0]} size={[0.26, 0.26, 0.26]} color="#ef4444" radius={0.06} emissive="#ef4444" emissiveIntensity={1.6} />
      {count > 1 ? (
        <Html position={[0.38, 0.55, 0]} center style={{ pointerEvents: "none" }}>
          <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-black text-white shadow">{count}</span>
        </Html>
      ) : null}
    </group>
  );
}

function Padlock({ p, rank }: { p: Point; rank: number }) {
  const ref = React.useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.9;
    ref.current.position.y = 2.2 + Math.sin(clock.elapsedTime * 1.8) * 0.15;
  });
  const [x, , z] = at(p);
  return (
    <group ref={ref} position={[x, 2.2, z]}>
      <Block position={[0, 0, 0]} size={[0.9, 0.75, 0.4]} color="#fbbf24" radius={0.1} metalness={0.8} roughness={0.25} emissive="#f59e0b" emissiveIntensity={0.35} />
      <mesh position={[0, 0.42, 0]}>
        <torusGeometry args={[0.3, 0.08, 10, 24, Math.PI]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.9} roughness={0.2} />
      </mesh>
      <Html position={[0, -0.75, 0]} center style={{ pointerEvents: "none" }}>
        <span className="whitespace-nowrap rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-black text-yellow-300">RANG {rank}</span>
      </Html>
    </group>
  );
}

function Construction({ state }: { state: ZoneState }) {
  const r = state.zone.rect;
  const hazard = React.useMemo(() => hazardTexture(), []);
  const c: Point = { x: r.x + r.w / 2, z: r.z + r.d / 2 };
  return (
    <group>
      <Block position={at({ x: c.x, z: r.z + r.d - 0.6 }, 0.55)} size={[r.w - 1.2, 0.22, 0.12]} color="#ffffff" map={hazard} radius={0} />
      <Block position={at({ x: c.x, z: r.z + 0.6 }, 0.55)} size={[r.w - 1.2, 0.22, 0.12]} color="#ffffff" map={hazard} radius={0} />
      {[
        [r.x + 0.8, r.z + 0.6],
        [r.x + r.w - 0.8, r.z + 0.6],
        [r.x + 0.8, r.z + r.d - 0.6],
        [r.x + r.w - 0.8, r.z + r.d - 0.6],
      ].map(([x, z], i) => (
        <group key={i} position={at({ x: x!, z: z! })}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <coneGeometry args={[0.22, 0.6, 12]} />
            <meshStandardMaterial color="#f97316" />
          </mesh>
          <mesh position={[0, 0.33, 0]}>
            <cylinderGeometry args={[0.13, 0.16, 0.1, 12]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}
      <Block position={at({ x: c.x - 1.2, z: c.z + 0.6 }, 0.3)} size={[1, 0.6, 1]} color="#a16207" radius={0.04} />
      <Block position={at({ x: c.x + 1, z: c.z - 0.4 }, 0.2)} size={[1.4, 0.4, 0.8]} color="#9ca3af" radius={0.04} />
      <Padlock p={c} rank={state.zone.minRank} />
    </group>
  );
}

function Zone({ state, desks, accentNight, it, compact }: { state: ZoneState; desks: DeskSlot[]; accentNight: number; it: Interaction; compact: boolean }) {
  const { zone, unlocked, alerts } = state;
  const r = zone.rect;
  const center: Point = { x: r.x + r.w / 2, z: r.z + r.d / 2 };
  const target: OfficeTarget = { type: "zone", id: zone.id };
  const hot = same(it.hovered, target);
  const selected = same(it.selected, target);
  const floor = React.useMemo(() => studTexture(r.w - 0.1, r.d - 0.1, 0.5), [r.w, r.d]);
  const floorColor = unlocked ? tint(zone.color, 0.35) : "#a8a29e";

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={at(center, 0.012)}
        receiveShadow
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          it.onHover(target);
        }}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          it.onHover(null);
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          it.onSelect(target);
        }}
      >
        <planeGeometry args={[r.w - 0.1, r.d - 0.1]} />
        <meshStandardMaterial color={floorColor} map={floor} roughness={0.7} emissive={zone.color} emissiveIntensity={selected ? 0.35 : hot ? 0.18 : 0} />
      </mesh>
      <Partition rect={r} color={selected ? zone.color : "#e2e8f0"} />
      {unlocked ? (
        <>
          {desks.map((d) => (
            <Desk key={d.key} slot={d} accent={zone.color} night={accentNight} it={it} />
          ))}
          <ZoneDecor state={state} night={accentNight} />
        </>
      ) : (
        <Construction state={state} />
      )}
      {unlocked && alerts.length ? <AlertMarker p={{ x: center.x + r.w / 4, z: center.z }} count={alerts.length} /> : null}
      {/* Éclairage intérieur : s'allume à la tombée de la nuit */}
      {accentNight > 0.05 ? <pointLight position={at(center, 2.6)} color={unlocked ? "#ffe4b5" : "#94a3b8"} intensity={accentNight * 9} distance={Math.max(r.w, r.d) * 1.1} decay={1.6} /> : null}
      <Html position={at({ x: center.x, z: r.z + r.d - 0.45 }, 0.7)} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <span
          className={`select-none whitespace-nowrap font-black uppercase tracking-wide ${compact ? "text-[9px]" : "text-[11px]"} ${selected || hot ? "text-yellow-300" : "text-white"}`}
          style={{ textShadow: "0 0 3px #000, 0 1px 3px #000, 0 0 1px #000" }}
        >
          {compact ? zone.short : zone.label}
        </span>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Bâtiment et extérieur                                               */
/* ------------------------------------------------------------------ */

function Building({ night }: { night: number }) {
  const W = BUILDING.width;
  const D = BUILDING.depth;
  const base = 1.0;
  const glass = 1.5;
  const t = 0.3;
  const sign = React.useMemo(() => labelTexture("BDO SOFTWARE", { bg: "#1d4ed8", fg: "#ffffff", w: 1024, h: 160 }), []);
  const wall = (pos: [number, number, number], size: [number, number, number], key: string) => (
    <group key={key}>
      <Block position={[pos[0], base / 2, pos[2]]} size={[size[0], base, size[2]]} color="#cbd5e1" radius={0.06} />
      <Block
        position={[pos[0], base + glass / 2, pos[2]]}
        size={[size[0] === t ? t * 0.4 : size[0], glass, size[2] === t ? t * 0.4 : size[2]]}
        color="#93c5fd"
        radius={0}
        transparent
        opacity={0.18}
        roughness={0.05}
      />
      <Block position={[pos[0], base + glass + 0.08, pos[2]]} size={[size[0], 0.16, size[2]]} color="#94a3b8" radius={0.04} />
    </group>
  );
  return (
    <group>
      {/* Dalle intérieure (sous les zones) */}
      <Block position={[0, -0.06, 0]} size={[W + 0.6, 0.12, D + 0.6]} color="#e5e7eb" radius={0.04} />
      {wall([0, 0, OZ - t / 2], [W + t * 2, 0, t], "n")}
      {wall([0, 0, -OZ + t / 2], [W + t * 2, 0, t], "s")}
      {/* Façade ouest avec porte d'entrée (Accueil) */}
      {wall([OX - t / 2, 0, OZ + 1.75], [t, 0, 3.5], "w1")}
      {wall([OX - t / 2, 0, OZ + 3.5 + 1.6 + (D - 5.1) / 2], [t, 0, D - 5.1], "w2")}
      {wall([-OX + t / 2, 0, 0], [t, 0, D], "e")}
      {/* Enseigne */}
      <group position={[0, 3.2, OZ - 0.3]}>
        <Block position={[0, 0, 0]} size={[10.4, 1.7, 0.3]} color="#1e3a8a" radius={0.1} />
        <mesh position={[0, 0, 0.16]}>
          <planeGeometry args={[10, 1.5]} />
          <meshStandardMaterial map={sign} emissive="#ffffff" emissiveMap={sign} emissiveIntensity={0.35 + night * 1.2} toneMapped={false} />
        </mesh>
        <Block position={[-4, -1.2, -0.1]} size={[0.2, 1.2, 0.2]} color="#64748b" radius={0.04} />
        <Block position={[4, -1.2, -0.1]} size={[0.2, 1.2, 0.2]} color="#64748b" radius={0.04} />
      </group>
      {/* Paillasson d'entrée */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[OX - 1.2, 0.02, OZ + 4.3]}>
        <planeGeometry args={[2, 1.6]} />
        <meshStandardMaterial color="#7f1d1d" roughness={0.95} />
      </mesh>
    </group>
  );
}

const TREES: { p: Point; h: number }[] = (() => {
  const out: { p: Point; h: number }[] = [];
  let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60 && out.length < 18; i++) {
    const x = -14 + rnd() * 60;
    const z = -14 + rnd() * 50;
    // Hors du bâtiment, de la route (nord) et du chemin d'entrée (ouest).
    if (x > -3 && x < BUILDING.width + 3 && z > -3 && z < BUILDING.depth + 3) continue;
    // Pas d'arbre entre la caméra et le bâtiment.
    if (z > BUILDING.depth && z < BUILDING.depth + 16 && x > -10 && x < BUILDING.width + 10) continue;
    if (z > -9 && z < -4.5) continue;
    if (x < 0 && z > 2.5 && z < 6.5) continue;
    out.push({ p: { x, z }, h: 1.4 + rnd() * 1.4 });
  }
  return out;
})();

function Outdoors({ night }: { night: number }) {
  const grass = React.useMemo(() => studTexture(120, 120, 1), []);
  const road = React.useMemo(() => studTexture(120, 4, 1), []);
  const cars = [
    { x: 4, color: "#ef4444" },
    { x: 9.5, color: "#3b82f6" },
    { x: 22, color: "#f8fafc" },
  ];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.13, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#4c9a4c" map={grass} roughness={0.9} />
      </mesh>
      {/* Route au nord */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.11, OZ - 6.8]} receiveShadow>
        <planeGeometry args={[120, 4]} />
        <meshStandardMaterial color="#4b5563" map={road} roughness={0.85} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-57 + i * 5, -0.1, OZ - 6.8]}>
          <planeGeometry args={[2, 0.18]} />
          <meshStandardMaterial color="#facc15" />
        </mesh>
      ))}
      {/* Chemin d'entrée (ouest) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[OX - 6, -0.1, OZ + 4.3]} receiveShadow>
        <planeGeometry args={[12, 2]} />
        <meshStandardMaterial color="#d6d3d1" roughness={0.9} />
      </mesh>
      {/* Voitures garées */}
      {cars.map((c, i) => (
        <group key={i} position={[OX + c.x, 0, OZ - 3.3]}>
          <Block position={[0, 0.45, 0]} size={[2.6, 0.6, 1.3]} color={c.color} radius={0.15} metalness={0.3} roughness={0.3} />
          <Block position={[-0.1, 0.95, 0]} size={[1.4, 0.5, 1.15]} color="#1e293b" radius={0.12} roughness={0.1} />
          {[-0.85, 0.85].map((dx) =>
            [-0.62, 0.62].map((dz) => (
              <mesh key={`${dx}${dz}`} position={[dx, 0.25, dz]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.26, 0.26, 0.2, 16]} />
                <meshStandardMaterial color="#111827" />
              </mesh>
            )),
          )}
          <Block position={[1.31, 0.5, 0.4]} size={[0.04, 0.14, 0.24]} color="#fef9c3" radius={0} emissive="#fde047" emissiveIntensity={0.3 + night * 2} />
          <Block position={[1.31, 0.5, -0.4]} size={[0.04, 0.14, 0.24]} color="#fef9c3" radius={0} emissive="#fde047" emissiveIntensity={0.3 + night * 2} />
        </group>
      ))}
      {/* Lampadaires */}
      {[-12, 0, 12, 24].map((x) => (
        <group key={x} position={[x, 0, OZ - 4.4]}>
          <Block position={[0, 1.6, 0]} size={[0.16, 3.2, 0.16]} color="#334155" radius={0.04} />
          <Block position={[0, 3.25, 0.3]} size={[0.5, 0.18, 0.8]} color="#334155" radius={0.04} />
          <Block position={[0, 3.12, 0.4]} size={[0.36, 0.06, 0.5]} color="#fef9c3" radius={0} emissive="#fde68a" emissiveIntensity={0.2 + night * 3} />
        </group>
      ))}
      {TREES.map((t, i) => (
        <Tree key={i} p={{ x: t.p.x, z: t.p.z }} h={t.h} />
      ))}
      <Clouds />
    </group>
  );
}

function Clouds() {
  const group = React.useRef<THREE.Group>(null);
  const clouds = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        x: -50 + i * 16,
        y: 15 + (i % 3) * 2.5,
        z: -30 + ((i * 37) % 50),
        s: 1 + (i % 3) * 0.4,
      })),
    [],
  );
  useFrame((_, delta) => {
    if (!group.current) return;
    for (const child of group.current.children) {
      child.position.x += delta * 0.6;
      if (child.position.x > 60) child.position.x = -60;
    }
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          <Block position={[0, 0, 0]} size={[4, 1.2, 2.4]} color="#ffffff" radius={0.4} roughness={1} />
          <Block position={[1.6, 0.6, 0.2]} size={[2.4, 1.2, 2]} color="#ffffff" radius={0.4} roughness={1} />
          <Block position={[-1.4, 0.4, -0.2]} size={[2, 1, 1.8]} color="#f8fafc" radius={0.4} roughness={1} />
        </group>
      ))}
    </group>
  );
}

export function World({ zones, desks, night, compact, it }: { zones: ZoneState[]; desks: Map<string, DeskSlot[]>; night: number; compact: boolean; it: Interaction }) {
  return (
    <group>
      <Outdoors night={night} />
      <Building night={night} />
      {zones.map((z) => (
        <Zone key={z.zone.id} state={z} desks={desks.get(z.zone.id) ?? []} accentNight={night} it={it} compact={compact} />
      ))}
    </group>
  );
}

"use client";
import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { BUILDING, DIRECTOR_ID, deskPositions, gatheringSpots, zoneById, type EmployeePresence, type OfficeActivity, type Point, type ZoneState } from "@/lib/calculations/office";

/**
 * Scène 3D des bureaux (three.js via @react-three/fiber). Purement visuelle : toutes les
 * données (zones, alertes, présence) sont calculées dans `lib/calculations/office.ts`.
 * Chargée uniquement côté client (next/dynamic, ssr: false).
 */

export type OfficeSelection = { type: "zone"; id: string } | { type: "employee"; id: string } | null;

const OX = -BUILDING.width / 2;
const OZ = -BUILDING.depth / 2;
const at = (p: Point, y = 0): [number, number, number] => [p.x + OX, y, p.z + OZ];

export const ACTIVITY_COLORS: Record<OfficeActivity, string> = {
  working: "#22c55e",
  available: "#94a3b8",
  call: "#3b82f6",
  meeting: "#3b82f6",
  lunch: "#f59e0b",
  coffee: "#f59e0b",
  away: "#475569",
  leave: "#475569",
};

export function OfficeScene({ zones, presence, selection, onSelect }: { zones: ZoneState[]; presence: EmployeePresence[]; selection: OfficeSelection; onSelect: (s: OfficeSelection) => void }) {
  const perZone = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of presence) m.set(p.zone, (m.get(p.zone) ?? 0) + 1);
    return m;
  }, [presence]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 30, 27], fov: 42 }}
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      aria-label="Vue 3D des bureaux de BDO Software"
    >
      <color attach="background" args={["#0b1120"]} />
      <fog attach="fog" args={["#0b1120", 45, 90]} />
      <hemisphereLight args={["#dbeafe", "#0f172a", 0.7]} />
      <directionalLight
        position={[12, 26, 14]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <OrbitControls makeDefault enableDamping target={[0, 0, 1]} maxPolarAngle={1.2} minDistance={10} maxDistance={70} />
      <CameraFit />

      {/* Dalle du bâtiment */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[BUILDING.width + 4, BUILDING.depth + 4]} />
        <meshStandardMaterial color="#111a2e" />
      </mesh>

      {zones.map((z) => (
        <Zone
          key={z.zone.id}
          state={z}
          desks={z.zone.kind === "team" ? deskPositions(z.zone, perZone.get(z.zone.id) ?? 0) : []}
          selected={selection?.type === "zone" && selection.id === z.zone.id}
          onSelect={() => onSelect({ type: "zone", id: z.zone.id })}
        />
      ))}
      <OuterWalls />

      {presence
        .filter((p) => p.location !== "away")
        .map((p) => (
          <Avatar
            key={p.employee.id}
            presence={p}
            color={zoneById(p.zone).color}
            selected={selection?.type === "employee" && selection.id === p.employee.id}
            onSelect={() => onSelect({ type: "employee", id: p.employee.id })}
          />
        ))}
    </Canvas>
  );
}

function OuterWalls() {
  const h = 1.1;
  const t = 0.2;
  const mat = <meshStandardMaterial color="#334155" transparent opacity={0.85} />;
  return (
    <group>
      <mesh position={[0, h / 2, OZ]} castShadow>
        <boxGeometry args={[BUILDING.width, h, t]} />
        {mat}
      </mesh>
      <mesh position={[0, h / 2, -OZ]} castShadow>
        <boxGeometry args={[BUILDING.width, h, t]} />
        {mat}
      </mesh>
      <mesh position={[OX, h / 2, 0]} castShadow>
        <boxGeometry args={[t, h, BUILDING.depth]} />
        {mat}
      </mesh>
      <mesh position={[-OX, h / 2, 0]} castShadow>
        <boxGeometry args={[t, h, BUILDING.depth]} />
        {mat}
      </mesh>
    </group>
  );
}

/** Petit écran : étiquettes compactes. */
function useCompact() {
  return useThree((s) => s.size.width < 640);
}

/** Recule la caméra sur les écrans étroits pour que tout le bâtiment reste visible. */
function CameraFit() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(s.size.height, 1));
  React.useEffect(() => {
    const factor = aspect < 1.4 ? Math.min(1.4 / aspect, 2.1) : 1;
    camera.position.set(0, 30 * factor, 27 * factor);
    camera.lookAt(0, 0, 1);
  }, [aspect, camera]);
  return null;
}

function Zone({ state, desks, selected, onSelect }: { state: ZoneState; desks: Point[]; selected: boolean; onSelect: () => void }) {
  const { zone, unlocked, alerts } = state;
  const r = zone.rect;
  const center: Point = { x: r.x + r.w / 2, z: r.z + r.d / 2 };
  const [hover, setHover] = React.useState(false);
  const compact = useCompact();
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={at(center, 0.01)}
        receiveShadow
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <planeGeometry args={[r.w - 0.12, r.d - 0.12]} />
        <meshStandardMaterial color={unlocked ? zone.color : "#1e293b"} transparent opacity={unlocked ? (selected ? 0.5 : hover ? 0.34 : 0.2) : 0.6} />
      </mesh>
      <ZoneWalls rect={r} color={selected ? zone.color : "#475569"} />

      {unlocked ? <Furniture zoneKind={zone.kind} zoneId={zone.id} desks={desks} color={zone.color} center={center} /> : <LockedBlock center={center} w={r.w} d={r.d} />}

      {alerts.length && unlocked ? <AlertBeacon position={at({ x: r.x + r.w - 0.8, z: r.z + 0.8 }, 2.2)} /> : null}

      <Html position={at({ x: center.x, z: r.z + 0.6 }, 1.4)} center zIndexRange={[20, 0]}>
        <button
          type="button"
          onClick={onSelect}
          className={`flex items-center whitespace-nowrap rounded-full border font-medium ${compact ? "gap-1 px-1.5 py-0.5 text-[9px]" : "gap-1.5 px-2.5 py-1 text-[11px]"} shadow-lg backdrop-blur transition ${
            selected ? "border-white/60 bg-white/20 text-white" : "border-white/15 bg-slate-900/75 text-slate-100 hover:bg-slate-800/90"
          }`}
        >
          <span className="size-2 rounded-full" style={{ background: unlocked ? zone.color : "#64748b" }} />
          {compact ? zone.short : zone.label}
          {!unlocked ? <span className="text-slate-400">{compact ? "🔒" : `· rang ${zone.minRank}`}</span> : null}
          {unlocked && alerts.length ? <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">{alerts.length}</span> : null}
        </button>
      </Html>
    </group>
  );
}

function ZoneWalls({ rect, color }: { rect: { x: number; z: number; w: number; d: number }; color: string }) {
  const h = 0.45;
  const t = 0.08;
  // Cloison avec une ouverture (porte) au milieu de chaque côté.
  const seg = (x: number, z: number, w: number, d: number, key: string) => (
    <mesh key={key} position={at({ x, z }, h / 2)}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
  const door = 1.4;
  const hw = (rect.w - door) / 2;
  const hd = (rect.d - door) / 2;
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

function Box({ position, size, color, emissive }: { position: [number, number, number]; size: [number, number, number]; color: string; emissive?: string }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={emissive ?? "#000000"} emissiveIntensity={emissive ? 0.6 : 0} />
    </mesh>
  );
}

function Plant({ p }: { p: Point }) {
  return (
    <group position={at(p)}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.14, 0.4, 12]} />
        <meshStandardMaterial color="#7c5c3b" />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow>
        <sphereGeometry args={[0.32, 14, 14]} />
        <meshStandardMaterial color="#15803d" />
      </mesh>
    </group>
  );
}

function Desk({ p, color }: { p: Point; color: string }) {
  const [x, , z] = at(p);
  return (
    <group>
      <Box position={[x, 0.37, z - 0.6]} size={[1.5, 0.06, 0.75]} color="#cbd5e1" />
      <Box position={[x - 0.65, 0.18, z - 0.6]} size={[0.06, 0.36, 0.7]} color="#94a3b8" />
      <Box position={[x + 0.65, 0.18, z - 0.6]} size={[0.06, 0.36, 0.7]} color="#94a3b8" />
      <Box position={[x, 0.62, z - 0.85]} size={[0.7, 0.42, 0.05]} color="#0f172a" emissive={color} />
      <Box position={[x, 0.26, z + 0.05]} size={[0.5, 0.06, 0.5]} color="#334155" />
    </group>
  );
}

function Furniture({ zoneKind, zoneId, desks, color, center }: { zoneKind: string; zoneId: string; desks: Point[]; color: string; center: Point }) {
  if (zoneKind === "team")
    return (
      <group>
        {desks.map((d, i) => (
          <Desk key={i} p={d} color={color} />
        ))}
        <Plant p={{ x: zoneById(zoneId as never).rect.x + 0.6, z: zoneById(zoneId as never).rect.z + 0.7 }} />
      </group>
    );
  if (zoneKind === "meeting") {
    const seats = gatheringSpots(zoneById("reunion"), 8);
    return (
      <group>
        <mesh position={at({ x: center.x, z: center.z + 0.4 }, 0.38)} scale={[3, 1, 1.6]} castShadow receiveShadow>
          <cylinderGeometry args={[1, 1, 0.08, 40]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <Box position={at({ x: center.x, z: center.z + 0.4 }, 0.18)} size={[0.3, 0.36, 0.3]} color="#94a3b8" />
        {seats.map((s, i) => (
          <Box key={i} position={at(s, 0.25)} size={[0.5, 0.08, 0.5]} color="#334155" />
        ))}
        <Box position={at({ x: center.x, z: zoneById("reunion").rect.z + 0.5 }, 0.95)} size={[3.2, 1.6, 0.06]} color="#0f172a" emissive="#3987e5" />
      </group>
    );
  }
  if (zoneKind === "break") {
    const r = zoneById("detente").rect;
    return (
      <group>
        <Box position={at({ x: r.x + 1.2, z: r.z + r.d / 2 + 0.4 }, 0.25)} size={[0.9, 0.5, 3]} color="#c2410c" />
        <Box position={at({ x: r.x + r.w - 1, z: r.z + 1.3 }, 0.55)} size={[1.4, 1.1, 0.6]} color="#57534e" />
        <Box position={at({ x: r.x + r.w - 1, z: r.z + 1.3 }, 1.15)} size={[0.35, 0.3, 0.3]} color="#1c1917" emissive="#f59e0b" />
        <mesh position={at({ x: center.x, z: center.z + 0.4 }, 0.35)} castShadow>
          <cylinderGeometry args={[0.8, 0.8, 0.06, 32]} />
          <meshStandardMaterial color="#fde68a" />
        </mesh>
        <Plant p={{ x: r.x + r.w - 0.7, z: r.z + r.d - 0.7 }} />
        <Plant p={{ x: r.x + 0.7, z: r.z + 0.8 }} />
      </group>
    );
  }
  if (zoneKind === "reception") {
    const r = zoneById("accueil").rect;
    return (
      <group>
        <Box position={at({ x: center.x, z: center.z + 0.5 }, 0.5)} size={[3, 1, 0.7]} color="#e2e8f0" />
        <Box position={at({ x: center.x, z: r.z + 0.5 }, 1.2)} size={[2.4, 0.8, 0.06]} color="#0f172a" emissive="#9085e9" />
        <Plant p={{ x: r.x + 0.7, z: r.z + r.d - 0.7 }} />
        <Plant p={{ x: r.x + r.w - 0.7, z: r.z + r.d - 0.7 }} />
      </group>
    );
  }
  // Zones bonus débloquées par le rang.
  if (zoneId === "rnd")
    return (
      <group>
        {[0, 1, 2].map((i) => (
          <Box key={i} position={at({ x: center.x - 1.6 + i * 1.6, z: center.z }, 0.9)} size={[0.9, 1.8, 0.9]} color="#1e1b4b" emissive="#9085e9" />
        ))}
      </group>
    );
  return (
    <group>
      <mesh position={at(center, 1.2)} castShadow>
        <coneGeometry args={[1.6, 0.6, 24]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <Box position={at(center, 0.6)} size={[0.08, 1.2, 0.08]} color="#94a3b8" />
      <Plant p={{ x: center.x - 2, z: center.z + 1.5 }} />
      <Plant p={{ x: center.x + 2, z: center.z + 1.5 }} />
    </group>
  );
}

function LockedBlock({ center, w, d }: { center: Point; w: number; d: number }) {
  return (
    <mesh position={at(center, 0.6)}>
      <boxGeometry args={[w - 0.6, 1.2, d - 0.6]} />
      <meshStandardMaterial color="#334155" transparent opacity={0.35} />
    </mesh>
  );
}

function AlertBeacon({ position }: { position: [number, number, number] }) {
  const ref = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.18;
    ref.current.scale.setScalar(s);
    ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * 2) * 0.1;
  });
  return (
    <mesh ref={ref} position={position}>
      <octahedronGeometry args={[0.28, 0]} />
      <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
    </mesh>
  );
}

function Avatar({ presence, color, selected, onSelect }: { presence: EmployeePresence; color: string; selected: boolean; onSelect: () => void }) {
  const group = React.useRef<THREE.Group>(null);
  const body = React.useRef<THREE.Group>(null);
  const target = React.useMemo(() => new THREE.Vector3(...at(presence.position)), [presence.position]);
  const [hover, setHover] = React.useState(false);
  const compact = useCompact();
  const isDirector = presence.employee.id === DIRECTOR_ID;
  const ringColor = isDirector ? "#fbbf24" : presence.overloaded && presence.activity === "working" ? "#ef4444" : ACTIVITY_COLORS[presence.activity];

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    const dist = g.position.distanceTo(target);
    if (dist > 0.02) {
      // Déplacement à vitesse de marche (~2,5 m/s), orienté vers la destination.
      const step = Math.min(dist, delta * 2.5);
      const dir = target.clone().sub(g.position).normalize();
      g.position.addScaledVector(dir, step);
      g.rotation.y = Math.atan2(dir.x, dir.z);
    }
    if (body.current) body.current.position.y = dist > 0.02 ? Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.08 : 0;
  });

  // Position initiale directement à la cible (pas de déplacement au premier rendu).
  const [initial] = React.useState<[number, number, number]>(() => at(presence.position));

  return (
    <group
      ref={group}
      position={initial}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.36, selected ? 0.56 : 0.46, 32]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.9} />
      </mesh>
      <group ref={body}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <capsuleGeometry args={[0.24, 0.5, 6, 14]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, 1.17, 0]} castShadow>
          <sphereGeometry args={[0.2, 18, 18]} />
          <meshStandardMaterial color="#f1c7a5" />
        </mesh>
      </group>
      <Html position={[0, 1.65, 0]} center zIndexRange={[30, 10]}>
        <button
          type="button"
          onClick={onSelect}
          className={`whitespace-nowrap rounded-md font-medium shadow ${compact ? "px-1 text-[9px]" : "px-1.5 py-0.5 text-[10px]"} ${selected || hover ? "bg-white text-slate-900" : "bg-slate-900/80 text-slate-100"}`}
        >
          {presence.employee.firstName}
          {selected || hover ? <span className="ml-1 font-normal text-slate-500">· {presence.detail.length > 28 ? `${presence.detail.slice(0, 28)}…` : presence.detail}</span> : null}
        </button>
      </Html>
    </group>
  );
}

"use client";
import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from "@react-three/postprocessing";
import { DIRECTOR_ID, deskPositions, zoneById, type EmployeePresence, type ZoneState } from "@/lib/calculations/office";
import { Character, lookFor } from "./office-character";
import { at, World, type DeskSlot, type OfficeTarget } from "./office-world";

/**
 * Carte 3D des bureaux, style « figurines en blocs » : bâtiment, extérieur, personnages
 * animés, cycle jour / nuit, ombres, occlusion ambiante, halo lumineux (bloom).
 * Purement visuelle : les données viennent de `lib/calculations/office.ts`.
 */

export type { OfficeTarget };
export type Quality = "high" | "low";

/** Lumière du jour (0 = nuit, 1 = plein jour) selon la minute. */
export function daylight(minute: number): number {
  const ramp = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  return Math.min(ramp(6.5 * 60, 8.5 * 60, minute), 1 - ramp(18.5 * 60, 20.5 * 60, minute));
}

const NIGHT_SKY = new THREE.Color("#0b1533");
const DAY_SKY = new THREE.Color("#8fd0ff");
const DUSK = new THREE.Color("#f6a35c");

function Sky({ minute }: { minute: number }) {
  const d = daylight(minute);
  const dusk = d > 0 && d < 1 ? Math.max(0, 1 - Math.abs(d - 0.45) / 0.35) : 0;
  const color = NIGHT_SKY.clone()
    .lerp(DAY_SKY, d)
    .lerp(DUSK, dusk * 0.45);
  return (
    <>
      <color attach="background" args={[color]} />
      <fog attach="fog" args={[color, 55, 110]} />
    </>
  );
}

function Lights({ minute, shadows }: { minute: number; shadows: boolean }) {
  const d = daylight(minute);
  const angle = ((minute - 6 * 60) / (12 * 60)) * Math.PI;
  const sunPos: [number, number, number] = [Math.cos(angle) * 30, Math.max(Math.sin(angle), 0.25) * 34 + 4, 16];
  const warm = new THREE.Color("#ffd9a8").lerp(new THREE.Color("#ffffff"), Math.min(1, Math.max(Math.sin(angle), 0) * 1.4));
  return (
    <>
      <hemisphereLight args={["#d6ecff", "#3f7f3f", 0.1 + d * 0.45]} />
      <directionalLight
        position={sunPos}
        color={warm}
        intensity={d * 1.9}
        castShadow={shadows && d > 0.05}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-far={120}
      />
      {/* Lune : éclairage bleuté la nuit */}
      <directionalLight position={[-20, 30, -10]} color="#8aa6ff" intensity={(1 - d) * 0.3} />
      <ambientLight intensity={0.06 + d * 0.06} />
      <Environment resolution={128} environmentIntensity={0.08 + d * 0.32}>
        <Lightformer form="rect" intensity={2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#bfdbfe" position={[-20, 6, -10]} rotation-y={Math.PI / 3} scale={[20, 8, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#fde68a" position={[20, 6, 10]} rotation-y={-Math.PI / 3} scale={[20, 8, 1]} />
      </Environment>
    </>
  );
}

/** Position de départ de la caméra (recul sur écran étroit). */
function homePosition(aspect: number): THREE.Vector3 {
  const factor = aspect < 1.4 ? Math.min(1.4 / aspect, 2.1) : 1;
  return new THREE.Vector3(0, 23 * factor, 27 * factor);
}

type Controls = { target: THREE.Vector3; update: () => void; addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void };

/** Vol de caméra vers la cible sélectionnée, ou retour à la vue d'ensemble. */
function CameraRig({ focus, homeTick, instant }: { focus: THREE.Vector3 | null; homeTick: number; instant: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const aspect = useThree((s) => s.size.width / Math.max(s.size.height, 1));
  const goal = React.useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null);

  React.useEffect(() => {
    camera.position.copy(homePosition(aspect));
    camera.lookAt(0, 0, 1);
  }, [aspect, camera]);

  React.useEffect(() => {
    if (!controls) return;
    const stop = () => (goal.current = null);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  React.useEffect(() => {
    if (!focus || !controls) return;
    const dir = camera.position.clone().sub(controls.target);
    const dist = Math.min(Math.max(dir.length() * 0.55, 8), 15);
    goal.current = { target: focus.clone(), pos: focus.clone().add(dir.normalize().multiplyScalar(dist)) };
  }, [focus, controls, camera]);

  React.useEffect(() => {
    if (!homeTick) return;
    goal.current = { target: new THREE.Vector3(0, 0, 1), pos: homePosition(aspect) };
  }, [homeTick, aspect]);

  useFrame((_, delta) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = instant ? 1 : 1 - Math.exp(-delta * 4);
    controls.target.lerp(g.target, k);
    camera.position.lerp(g.pos, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.05 && controls.target.distanceTo(g.target) < 0.05) goal.current = null;
  });
  return null;
}

function Effects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={0.9} intensity={2.4} distanceFalloff={0.7} quality="medium" halfRes />
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.82} luminanceSmoothing={0.25} />
      <SMAA />
      <Vignette offset={0.28} darkness={0.5} />
    </EffectComposer>
  );
}

function useCompact() {
  return useThree((s) => s.size.width < 640);
}

const MEETING_CENTER = (() => {
  const r = zoneById("reunion").rect;
  return { x: r.x + r.w / 2, z: r.z + r.d / 2 + 0.4 };
})();
const BREAK_CENTER = (() => {
  const r = zoneById("detente").rect;
  return { x: r.x + r.w / 2, z: r.z + r.d / 2 + 0.4 };
})();

function Inhabitants({
  presence,
  hovered,
  selected,
  onHover,
  onSelect,
  instant,
}: {
  presence: EmployeePresence[];
  hovered: OfficeTarget;
  selected: OfficeTarget;
  onHover: (t: OfficeTarget) => void;
  onSelect: (t: OfficeTarget) => void;
  instant: boolean;
}) {
  return (
    <>
      {presence
        .filter((p) => p.location !== "away")
        .map((p) => {
          const id = p.employee.id;
          const director = id === DIRECTOR_ID;
          const center = p.location === "meeting" ? MEETING_CENTER : p.location === "break" ? BREAK_CENTER : null;
          const facing = center ? Math.atan2(center.x - p.position.x, center.z - p.position.z) : Math.PI;
          const target: OfficeTarget = { type: "employee", id };
          const highlighted = (hovered?.type === "employee" && hovered.id === id) || (selected?.type === "employee" && selected.id === id) || (hovered?.type === "desk" && hovered.id === id);
          return (
            <Character
              key={id}
              presence={p}
              look={lookFor(id, zoneById(p.zone).color, director)}
              facing={facing}
              seated
              instant={instant}
              highlighted={highlighted}
              isDirector={director}
              position={at(p.position)}
              onOver={() => onHover(target)}
              onOut={() => onHover(null)}
              onClick={() => onSelect(target)}
            />
          );
        })}
    </>
  );
}

function Contents(props: OfficeSceneProps) {
  const compact = useCompact();
  const { zones, presence, minute, hovered, selected, onHover, onSelect } = props;
  const night = 1 - daylight(minute);

  const desks = React.useMemo(() => {
    const map = new Map<string, DeskSlot[]>();
    for (const z of zones) {
      if (z.zone.kind !== "team") continue;
      const members = presence.filter((p) => p.zone === z.zone.id);
      map.set(
        z.zone.id,
        deskPositions(z.zone, members.length).map((pt, i) => ({ p: pt, ownerId: members[i]?.employee.id ?? null, key: `${z.zone.id}:${i}` })),
      );
    }
    return map;
  }, [zones, presence]);

  // Point de mire de la caméra : recalculé uniquement quand la sélection change.
  const selKey = selected ? `${selected.type}:${selected.id}` : "";
  const [focus, setFocus] = React.useState<THREE.Vector3 | null>(null);
  const [lastKey, setLastKey] = React.useState("");
  if (selKey !== lastKey) {
    setLastKey(selKey);
    let next: THREE.Vector3 | null = null;
    if (selected?.type === "zone") {
      const r = zoneById(selected.id as never).rect;
      next = new THREE.Vector3(...at({ x: r.x + r.w / 2, z: r.z + r.d / 2 }));
    } else if (selected) {
      const p = presence.find((x) => x.employee.id === selected.id);
      if (p) next = new THREE.Vector3(...at(selected.type === "desk" ? p.desk : p.position, 0.6));
      else
        for (const slots of desks.values()) {
          const s = slots.find((d) => d.key === selected.id);
          if (s) next = new THREE.Vector3(...at(s.p, 0.6));
        }
    }
    setFocus(next);
  }

  const it = { hovered, selected, onHover, onSelect };
  return (
    <>
      <Sky minute={minute} />
      <Lights minute={minute} shadows={props.quality === "high"} />
      <OrbitControls makeDefault enableDamping target={[0, 0, 1]} maxPolarAngle={1.3} minDistance={5} maxDistance={70} />
      <CameraRig focus={focus} homeTick={props.homeTick} instant={!!props.reducedMotion} />
      <World zones={zones} desks={desks} night={night} compact={compact} it={it} />
      <Inhabitants presence={presence} hovered={hovered} selected={selected} onHover={onHover} onSelect={onSelect} instant={!!props.reducedMotion} />
      {props.quality === "high" ? <Effects /> : null}
    </>
  );
}

export interface OfficeSceneProps {
  zones: ZoneState[];
  presence: EmployeePresence[];
  minute: number;
  quality: Quality;
  hovered: OfficeTarget;
  selected: OfficeTarget;
  onHover: (t: OfficeTarget) => void;
  onSelect: (t: OfficeTarget) => void;
  homeTick: number;
  /** Appelé si l'appareil n'arrive pas à maintenir une fluidité suffisante. */
  onDecline?: () => void;
  /** Suspend le rendu (panneau ouvert par-dessus la carte). */
  paused?: boolean;
  /** Animations réduites : rendu à la demande, sans mouvement continu. */
  reducedMotion?: boolean;
}

export function OfficeScene(props: OfficeSceneProps) {
  return (
    <Canvas
      frameloop={props.paused ? "never" : props.reducedMotion ? "demand" : "always"}
      shadows={props.quality === "high"}
      dpr={props.quality === "high" ? [1, 2] : [1, 1.25]}
      camera={{ position: [0, 23, 27], fov: 40, near: 0.5, far: 200 }}
      gl={{ antialias: props.quality === "low", powerPreference: "high-performance" }}
      onPointerMissed={() => props.onSelect(null)}
      aria-label="Carte 3D des bureaux de BDO Software"
    >
      <PerformanceMonitor onDecline={props.onDecline} flipflops={1}>
        <Contents {...props} />
      </PerformanceMonitor>
    </Canvas>
  );
}

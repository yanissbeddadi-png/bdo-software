"use client";
import * as React from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { blockGeometry } from "./office-geometry";
import type { EmployeePresence } from "@/lib/calculations/office";
import { faceTexture, type FaceVariant } from "./office-textures";

/**
 * Personnage « blocs » (proportions R6) : tête, torse, deux bras et deux jambes
 * articulés. Unités locales : 1 = 0,3 m ; le personnage mesure ≈ 1,6 m.
 * Animations : marche (balancement des membres), assis au poste (frappe au clavier,
 * téléphone), réunion, pause avec une tasse.
 */

const SCALE = 0.3;
const SKIN = "#f5cd30";
const PANTS = ["#1e3a8a", "#374151", "#14532d", "#7c2d12", "#111827", "#4c1d95"];
const HAIR = ["#3b2314", "#111827", "#a16207", "#7f1d1d", "#e5e7eb", "#92400e"];

export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface CharacterLook {
  shirt: string;
  pants: string;
  hair: string;
  accessory: "hair" | "cap" | "headphones" | "bun" | "crown";
  face: FaceVariant;
}

export function lookFor(id: string, shirt: string, director = false): CharacterLook {
  const h = hashString(id);
  const accessories: CharacterLook["accessory"][] = ["hair", "cap", "headphones", "bun"];
  return {
    shirt,
    pants: PANTS[h % PANTS.length]!,
    hair: HAIR[(h >>> 3) % HAIR.length]!,
    accessory: director ? "crown" : accessories[(h >>> 6) % accessories.length]!,
    face: ((h >>> 9) % 4) as FaceVariant,
  };
}

const BUBBLES: Partial<Record<EmployeePresence["activity"], string>> = {
  call: "📞",
  meeting: "💬",
  lunch: "🍔",
  coffee: "☕",
  working: "💻",
};

function Part({ size, color, position, radius = 0.12, map }: { size: [number, number, number]; color: string; position?: [number, number, number]; radius?: number; map?: THREE.Texture }) {
  return (
    <mesh geometry={blockGeometry(size[0], size[1], size[2], radius)} position={position} castShadow receiveShadow>
      <meshStandardMaterial color={map ? "#ffffff" : color} map={map ?? null} roughness={0.45} metalness={0.02} />
    </mesh>
  );
}

function Accessory({ look }: { look: CharacterLook }) {
  switch (look.accessory) {
    case "cap":
      return (
        <group position={[0, 0.62, 0]}>
          <Part size={[1.28, 0.36, 1.28]} color={look.shirt} radius={0.1} />
          <Part size={[1.0, 0.1, 0.6]} color={look.shirt} position={[0, -0.12, 0.8]} radius={0.04} />
        </group>
      );
    case "headphones":
      return (
        <group>
          <Part size={[1.28, 0.32, 1.28]} color={look.hair} position={[0, 0.58, -0.02]} radius={0.12} />
          <mesh position={[0, 0.3, 0]} rotation={[0, 0, 0]} castShadow>
            <torusGeometry args={[0.72, 0.08, 10, 24, Math.PI]} />
            <meshStandardMaterial color="#111827" roughness={0.3} />
          </mesh>
          <Part size={[0.2, 0.46, 0.46]} color="#ef4444" position={[-0.7, 0.05, 0]} radius={0.08} />
          <Part size={[0.2, 0.46, 0.46]} color="#ef4444" position={[0.7, 0.05, 0]} radius={0.08} />
        </group>
      );
    case "bun":
      return (
        <group>
          <Part size={[1.3, 0.34, 1.3]} color={look.hair} position={[0, 0.58, -0.02]} radius={0.12} />
          <Part size={[1.3, 1.0, 0.3]} color={look.hair} position={[0, 0.05, -0.55]} radius={0.1} />
          <mesh position={[0, 0.98, -0.25]} castShadow>
            <sphereGeometry args={[0.32, 16, 16]} />
            <meshStandardMaterial color={look.hair} roughness={0.6} />
          </mesh>
        </group>
      );
    case "crown":
      return (
        <group position={[0, 0.78, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.55, 0.6, 0.4, 5]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#f59e0b" emissiveIntensity={0.25} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * 0.5, 0.32, Math.sin((i / 5) * Math.PI * 2) * 0.5]} castShadow>
              <coneGeometry args={[0.12, 0.3, 4]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} />
            </mesh>
          ))}
        </group>
      );
    default:
      return (
        <group>
          <Part size={[1.3, 0.36, 1.3]} color={look.hair} position={[0, 0.6, -0.02]} radius={0.14} />
          <Part size={[1.3, 0.7, 0.3]} color={look.hair} position={[0, 0.2, -0.55]} radius={0.1} />
        </group>
      );
  }
}

export interface CharacterProps {
  presence: EmployeePresence;
  look: CharacterLook;
  /** Orientation (radians) une fois arrivé à destination. */
  facing: number;
  /** Assis à destination (poste, réunion, pause). */
  seated: boolean;
  highlighted: boolean;
  isDirector?: boolean;
  /** Animations réduites : positions et poses appliquées sans transition. */
  instant?: boolean;
  onOver: () => void;
  onOut: () => void;
  onClick: () => void;
  position: [number, number, number];
}

export function Character({ presence, look, facing, seated, highlighted, isDirector, instant = false, onOver, onOut, onClick, position }: CharacterProps) {
  const root = React.useRef<THREE.Group>(null);
  const hips = React.useRef<THREE.Group>(null);
  const legL = React.useRef<THREE.Group>(null);
  const legR = React.useRef<THREE.Group>(null);
  const armL = React.useRef<THREE.Group>(null);
  const armR = React.useRef<THREE.Group>(null);
  const head = React.useRef<THREE.Group>(null);
  const ring = React.useRef<THREE.Mesh>(null);
  const target = React.useMemo(() => new THREE.Vector3(...position), [position]);
  const [initial] = React.useState(() => position);
  const face = React.useMemo(() => faceTexture(look.face, "transparent"), [look.face]);
  const phase = React.useMemo(() => (hashString(presence.employee.id) % 1000) / 160, [presence.employee.id]);
  const activity = presence.activity;

  useFrame(({ clock }, delta) => {
    const g = root.current;
    if (!g) return;
    const t = clock.elapsedTime + phase;
    const dist = Math.hypot(target.x - g.position.x, target.z - g.position.z);
    const walking = !instant && dist > 0.03;
    let yaw = facing;
    if (walking) {
      const step = instant ? dist : Math.min(dist, Math.min(delta, 0.05) * 2.6);
      const dx = (target.x - g.position.x) / dist;
      const dz = (target.z - g.position.z) / dist;
      g.position.x += dx * step;
      g.position.z += dz * step;
      yaw = Math.atan2(dx, dz);
    }
    // Rotation lissée (chemin le plus court).
    let diff = yaw - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * (instant ? 1 : Math.min(1, delta * 8));

    const sit = seated && !walking;
    const swing = walking ? Math.sin(t * 11) * 0.8 : 0;
    const lerp = (obj: THREE.Object3D | null, x: number) => {
      if (obj) obj.rotation.x += (x - obj.rotation.x) * (instant ? 1 : Math.min(1, delta * 12));
    };
    lerp(legL.current, sit ? -Math.PI / 2 : swing);
    lerp(legR.current, sit ? -Math.PI / 2 : -swing);
    let armLx = walking ? -swing : 0;
    let armRx = walking ? swing : 0;
    if (sit && activity === "working") {
      armLx = -1.25 + Math.sin(t * 14) * 0.08;
      armRx = -1.25 + Math.cos(t * 13) * 0.08;
    } else if (sit && activity === "call") {
      armLx = -0.9;
      armRx = -2.7;
    } else if (sit && (activity === "lunch" || activity === "coffee")) {
      armLx = -0.4;
      armRx = -1.3 + Math.max(0, Math.sin(t * 1.6)) * 0.9;
    } else if (sit && activity === "meeting") {
      armLx = -0.9;
      armRx = -0.9 + Math.max(0, Math.sin(t * 2.2)) * 0.6;
    } else if (sit) {
      armLx = -0.6;
      armRx = -0.6;
    }
    lerp(armL.current, armLx);
    lerp(armR.current, armRx);
    if (hips.current) {
      const targetY = sit ? -0.5 : walking ? Math.abs(Math.sin(t * 11)) * 0.18 : Math.sin(t * 2) * 0.03;
      hips.current.position.y += (targetY - hips.current.position.y) * (instant ? 1 : Math.min(1, delta * 10));
    }
    if (head.current) head.current.rotation.y = activity === "meeting" && sit ? Math.sin(t * 0.7) * 0.5 : Math.sin(t * 0.4) * 0.12;
    if (ring.current) ring.current.rotation.z += delta * (highlighted ? 2.5 : 0.6);
  });

  const statusColor = isDirector ? "#fbbf24" : presence.overloaded && activity === "working" ? "#ef4444" : RING[activity];
  const bubble = BUBBLES[activity];

  return (
    <group
      ref={root}
      position={initial}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onOver();
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onOut();
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Anneau de statut au sol */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <ringGeometry args={[0.34, highlighted ? 0.52 : 0.42, 6]} />
        <meshBasicMaterial color={statusColor} transparent opacity={highlighted ? 1 : 0.85} toneMapped={false} />
      </mesh>
      <group scale={SCALE}>
        <group ref={hips} position={[0, 0, 0]}>
          {/* Jambes (pivot à la hanche, y = 2) */}
          <group ref={legL} position={[-0.5, 2, 0]}>
            <Part size={[0.96, 2, 0.96]} color={look.pants} position={[0, -1, 0]} />
          </group>
          <group ref={legR} position={[0.5, 2, 0]}>
            <Part size={[0.96, 2, 0.96]} color={look.pants} position={[0, -1, 0]} />
          </group>
          {/* Torse */}
          <Part size={[2, 2, 1]} color={look.shirt} position={[0, 3, 0]} radius={0.16} />
          <mesh position={[0.5, 3.45, 0.51]}>
            <planeGeometry args={[0.45, 0.45]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>
          {/* Bras (pivot à l'épaule) */}
          <group ref={armL} position={[-1.5, 3.85, 0]}>
            <Part size={[0.96, 2, 0.96]} color={SKIN} position={[0, -0.85, 0]} />
          </group>
          <group ref={armR} position={[1.5, 3.85, 0]}>
            <Part size={[0.96, 2, 0.96]} color={SKIN} position={[0, -0.85, 0]} />
            {activity === "coffee" || activity === "lunch" ? (
              <mesh position={[0, -1.95, 0.35]} castShadow>
                <cylinderGeometry args={[0.28, 0.24, 0.55, 14]} />
                <meshStandardMaterial color={activity === "coffee" ? "#ffffff" : "#ef4444"} roughness={0.3} />
              </mesh>
            ) : null}
            {activity === "call" ? <Part size={[0.3, 0.9, 0.2]} color="#111827" position={[-0.45, -1.8, 0.3]} radius={0.06} /> : null}
          </group>
          {/* Tête */}
          <group ref={head} position={[0, 4.62, 0]}>
            <mesh geometry={blockGeometry(1.24, 1.24, 1.24, 0.22)} castShadow>
              <meshStandardMaterial color={SKIN} roughness={0.45} />
            </mesh>
            {/* Visage : décalque devant la tête */}
            <mesh position={[0, 0, 0.625]}>
              <planeGeometry args={[1.0, 1.0]} />
              <meshStandardMaterial map={face} transparent roughness={0.45} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
            <Accessory look={look} />
          </group>
        </group>
      </group>
      <Html position={[0, 2.15, 0]} center zIndexRange={[40, 10]} style={{ pointerEvents: "none" }}>
        <div className="flex select-none flex-col items-center gap-0.5">
          {bubble && !highlighted ? <span className="rounded-full bg-white px-1.5 text-[11px] leading-5 shadow-md">{bubble}</span> : null}
          <span
            className={`whitespace-nowrap text-[12px] font-black tracking-tight ${highlighted ? "text-yellow-300" : "text-white"}`}
            style={{ textShadow: "0 0 3px #000, 0 1px 2px #000, 0 0 1px #000" }}
          >
            {presence.employee.firstName}
          </span>
        </div>
      </Html>
    </group>
  );
}

export const RING: Record<EmployeePresence["activity"], string> = {
  working: "#22c55e",
  available: "#94a3b8",
  call: "#3b82f6",
  meeting: "#3b82f6",
  lunch: "#f59e0b",
  coffee: "#f59e0b",
  away: "#475569",
  leave: "#475569",
};

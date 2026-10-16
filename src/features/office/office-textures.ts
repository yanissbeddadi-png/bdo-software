"use client";
import * as THREE from "three";

/**
 * Textures procédurales (canvas) de la carte 3D : aucun fichier externe n'est chargé.
 * Toutes les textures sont mises en cache au niveau du module (client uniquement).
 */

const cache = new Map<string, THREE.Texture>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

function finish(tex: THREE.CanvasTexture, repeat = true): THREE.CanvasTexture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Picot « brique » vu de dessus, blanc et neutre pour être teinté par la couleur du matériau. */
function studBase(): THREE.Texture {
  const key = "stud";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(128);
  g.fillStyle = "#e9e9e9";
  g.fillRect(0, 0, 128, 128);
  // Légère bordure de tuile.
  g.strokeStyle = "rgba(0,0,0,0.06)";
  g.lineWidth = 4;
  g.strokeRect(0, 0, 128, 128);
  // Ombre portée du picot.
  g.fillStyle = "rgba(0,0,0,0.16)";
  g.beginPath();
  g.arc(68, 70, 34, 0, Math.PI * 2);
  g.fill();
  // Picot.
  const grad = g.createRadialGradient(54, 52, 6, 64, 64, 34);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#d8d8d8");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(64, 64, 32, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 3;
  g.stroke();
  const tex = finish(new THREE.CanvasTexture(c));
  cache.set(key, tex);
  return tex;
}

/** Texture à picots répétée : un picot tous les `pitch` mètres. */
export function studTexture(w: number, d: number, pitch = 0.5): THREE.Texture {
  const key = `stud:${w}:${d}:${pitch}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = studBase().clone();
  tex.repeat.set(w / pitch, d / pitch);
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

export type FaceVariant = 0 | 1 | 2 | 3;

/** Visage façon figurine : yeux ovales et sourire (fond transparent pour un décalque). */
export function faceTexture(variant: FaceVariant, skin: string): THREE.Texture {
  const key = `face:${variant}:${skin}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(128);
  if (skin !== "transparent") {
    g.fillStyle = skin;
    g.fillRect(0, 0, 128, 128);
  }
  g.fillStyle = "#1f1f1f";
  const eye = (x: number, y: number, rx = 7, ry = 12) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  if (variant === 3) {
    // Clin d'œil.
    eye(44, 52);
    g.lineWidth = 6;
    g.strokeStyle = "#1f1f1f";
    g.beginPath();
    g.moveTo(76, 54);
    g.lineTo(92, 50);
    g.stroke();
  } else {
    eye(44, 52);
    eye(84, 52);
  }
  g.strokeStyle = "#1f1f1f";
  g.lineCap = "round";
  g.lineWidth = 7;
  g.beginPath();
  if (variant === 1) {
    // Grand sourire ouvert.
    g.fillStyle = "#1f1f1f";
    g.arc(64, 76, 22, 0.1 * Math.PI, 0.9 * Math.PI);
    g.closePath();
    g.fill();
  } else if (variant === 2) {
    // Sourire en coin.
    g.moveTo(46, 86);
    g.quadraticCurveTo(70, 98, 88, 78);
    g.stroke();
  } else {
    g.arc(64, 72, 24, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
  const tex = finish(new THREE.CanvasTexture(c), false);
  cache.set(key, tex);
  return tex;
}

/** Panneau texte (enseigne, écrans) : fond coloré, texte centré. */
export function labelTexture(text: string, opts: { bg: string; fg: string; w?: number; h?: number; font?: string }): THREE.Texture {
  const key = `label:${text}:${opts.bg}:${opts.fg}:${opts.w}:${opts.h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = opts.fg;
  g.font = opts.font ?? `900 ${Math.round(h * 0.55)}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = finish(new THREE.CanvasTexture(c), false);
  cache.set(key, tex);
  return tex;
}

/** Tableau kanban / graphique d'écran : rectangles colorés pseudo-aléatoires (stables). */
export function boardTexture(seed: number, kind: "kanban" | "chart"): THREE.Texture {
  const key = `board:${seed}:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(256);
  let s = seed || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = kind === "kanban" ? "#f8fafc" : "#0f172a";
  g.fillRect(0, 0, 256, 256);
  const colors = ["#f59e0b", "#22c55e", "#3b82f6", "#ef4444", "#a855f7"];
  if (kind === "kanban") {
    for (let col = 0; col < 3; col++) {
      g.fillStyle = "#cbd5e1";
      g.fillRect(col * 85 + 4, 8, 77, 10);
      const n = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        g.fillStyle = colors[Math.floor(rnd() * colors.length)]!;
        g.fillRect(col * 85 + 10, 28 + i * 44, 64, 36);
      }
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const hgt = 40 + rnd() * 170;
      g.fillStyle = colors[i % colors.length]!;
      g.fillRect(18 + i * 29, 236 - hgt, 20, hgt);
    }
  }
  const tex = finish(new THREE.CanvasTexture(c), false);
  cache.set(key, tex);
  return tex;
}

/** Bandes de chantier jaune / noir. */
export function hazardTexture(): THREE.Texture {
  const key = "hazard";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(128);
  g.fillStyle = "#facc15";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#111827";
  for (let i = -128; i < 256; i += 48) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 24, 0);
    g.lineTo(i + 24 + 128, 128);
    g.lineTo(i + 128, 128);
    g.closePath();
    g.fill();
  }
  const tex = finish(new THREE.CanvasTexture(c));
  tex.repeat.set(4, 1);
  cache.set(key, tex);
  return tex;
}

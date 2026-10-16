"use client";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Géométries partagées de la carte 3D : un même bloc (dimensions + arrondi) n'est créé
 * qu'une fois et réutilisé par tous les objets identiques. Arrondis en basse résolution
 * (aspect « plastique » sans multiplier les triangles).
 */
const cache = new Map<string, THREE.BufferGeometry>();

const r2 = (n: number) => Math.round(n * 100) / 100;

export function blockGeometry(w: number, h: number, d: number, radius = 0): THREE.BufferGeometry {
  const rad = Math.min(radius, Math.min(w, h, d) / 2 - 0.001);
  const key = `${r2(w)}:${r2(h)}:${r2(d)}:${rad > 0.02 ? r2(rad) : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const geo = rad > 0.02 ? new RoundedBoxGeometry(w, h, d, 2, rad) : new THREE.BoxGeometry(w, h, d);
  cache.set(key, geo);
  return geo;
}

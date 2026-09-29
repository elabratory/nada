import * as THREE from 'three';
import type { ProductShape } from '../data/mall';

/**
 * Low-poly stand-in models built from primitives. Each fits in roughly a
 * 0.6 m cube, sits on y = 0 and is centred on x/z. In production these would
 * be replaced by retailer-supplied glTF models or photos.
 */

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, rough = 0.6, metal = 0) {
  const key = `${color}|${rough}|${metal}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  return mesh;
}

const screenMat = new THREE.MeshStandardMaterial({ color: '#0b1020', emissive: '#1b3a8a', emissiveIntensity: 0.6, roughness: 0.2 });
const glassCache = new Map<string, THREE.MeshStandardMaterial>();
function glassMat(color: string) {
  let m = glassCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75 });
    glassCache.set(color, m);
  }
  return m;
}

export function createProductMesh(shape: ProductShape, color: string, accent = '#ffffff'): THREE.Group {
  const g = new THREE.Group();
  const main = mat(color, 0.55);
  const acc = mat(accent, 0.5);
  const dark = mat('#1b1b1f', 0.4);
  const metal = mat('#c9ced6', 0.25, 0.8);
  const screen = screenMat;

  switch (shape) {
    case 'shoe': {
      const sole = box(0.56, 0.06, 0.2, acc, 0, 0.03, 0);
      const body = box(0.44, 0.12, 0.19, main, -0.04, 0.12, 0);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), main);
      toe.scale.set(1.3, 0.9, 0.95);
      toe.position.set(0.17, 0.06, 0);
      const heel = box(0.18, 0.14, 0.19, main, -0.18, 0.2, 0);
      const swoosh = box(0.26, 0.025, 0.195, acc, -0.02, 0.13, 0);
      g.add(sole, body, toe, heel, swoosh);
      break;
    }
    case 'tee':
    case 'hoodie':
    case 'jacket': {
      const torso = box(0.44, 0.52, 0.1, main, 0, 0.3, 0);
      const armL = box(0.14, 0.34, 0.1, main, -0.29, 0.38, 0);
      const armR = armL.clone();
      armR.position.x = 0.29;
      armL.rotation.z = shape === 'tee' ? 0.9 : 0.25;
      armR.rotation.z = -armL.rotation.z;
      if (shape !== 'tee') {
        armL.scale.y = armR.scale.y = 1.6;
        armL.position.y = armR.position.y = 0.26;
      }
      g.add(torso, armL, armR);
      if (shape === 'hoodie') g.add(cyl(0.13, 0.15, 0.14, main, 0, 0.6, -0.02));
      if (shape === 'jacket') {
        g.add(box(0.02, 0.5, 0.105, mat('#d4a373'), 0, 0.3, 0.001));
        g.add(box(0.46, 0.06, 0.11, mat(color, 0.7), 0, 0.55, 0));
      }
      const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI), metal);
      hanger.position.set(0, 0.62, 0);
      g.add(hanger);
      break;
    }
    case 'shorts': {
      g.add(box(0.42, 0.12, 0.12, main, 0, 0.36, 0));
      const l = box(0.19, 0.26, 0.12, main, -0.11, 0.18, 0);
      l.rotation.z = -0.08;
      const r = l.clone();
      r.position.x = 0.11;
      r.rotation.z = 0.08;
      g.add(l, r);
      break;
    }
    case 'socks': {
      for (let i = 0; i < 3; i++) {
        const leg = box(0.1, 0.3, 0.06, mat(i === 1 ? '#adb5bd' : color), -0.13 + i * 0.13, 0.2, 0);
        const foot = box(0.1, 0.08, 0.16, mat(i === 1 ? '#adb5bd' : color), -0.13 + i * 0.13, 0.04, 0.05);
        g.add(leg, foot);
      }
      break;
    }
    case 'bottle': {
      g.add(cyl(0.08, 0.08, 0.36, mat(color, 0.35, 0.5), 0, 0.18, 0));
      g.add(cyl(0.05, 0.08, 0.06, mat(color, 0.35, 0.5), 0, 0.39, 0));
      g.add(cyl(0.05, 0.05, 0.06, dark, 0, 0.45, 0));
      break;
    }
    case 'phone': {
      const p = box(0.2, 0.4, 0.025, main, 0, 0.22, 0);
      const s = box(0.185, 0.385, 0.002, screen, 0, 0.22, 0.014);
      const stand = box(0.14, 0.02, 0.14, metal, 0, 0.01, -0.02);
      p.rotation.x = s.rotation.x = -0.12;
      g.add(p, s, stand);
      break;
    }
    case 'tablet': {
      const p = box(0.46, 0.33, 0.02, main, 0, 0.2, 0);
      const s = box(0.43, 0.3, 0.002, screen, 0, 0.2, 0.012);
      p.rotation.x = s.rotation.x = -0.25;
      g.add(p, s, box(0.2, 0.02, 0.16, metal, 0, 0.01, -0.03));
      break;
    }
    case 'laptop': {
      g.add(box(0.56, 0.02, 0.38, main, 0, 0.01, 0));
      g.add(box(0.5, 0.004, 0.18, dark, 0, 0.022, -0.05));
      const lid = new THREE.Group();
      lid.add(box(0.56, 0.36, 0.012, main, 0, 0.18, 0));
      lid.add(box(0.52, 0.32, 0.002, screen, 0, 0.18, 0.008));
      lid.position.set(0, 0.02, -0.19);
      lid.rotation.x = -0.25;
      g.add(lid);
      break;
    }
    case 'watch': {
      const face = box(0.14, 0.17, 0.05, main, 0, 0.3, 0);
      const s = box(0.12, 0.15, 0.002, screen, 0, 0.3, 0.026);
      const strapT = box(0.1, 0.16, 0.02, mat(color, 0.8), 0, 0.46, -0.01);
      const strapB = box(0.1, 0.16, 0.02, mat(color, 0.8), 0, 0.14, -0.01);
      const stand = cyl(0.08, 0.1, 0.06, dark, 0, 0.03, 0);
      g.add(face, s, strapT, strapB, stand, cyl(0.02, 0.02, 0.1, dark, 0, 0.1, -0.02));
      break;
    }
    case 'headphones': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 10, 32, Math.PI), main);
      band.position.y = 0.22;
      const cupL = cyl(0.09, 0.09, 0.07, main, -0.19, 0.18, 0);
      cupL.rotation.z = Math.PI / 2;
      const cupR = cupL.clone();
      cupR.position.x = 0.19;
      const padL = cyl(0.075, 0.075, 0.02, dark, -0.15, 0.18, 0);
      padL.rotation.z = Math.PI / 2;
      const padR = padL.clone();
      padR.position.x = 0.15;
      g.add(band, cupL, cupR, padL, padR);
      g.position.y = 0.0;
      break;
    }
    case 'tv': {
      g.add(box(0.9, 0.52, 0.03, main, 0, 0.36, 0));
      g.add(box(0.86, 0.48, 0.002, screen, 0, 0.36, 0.016));
      g.add(box(0.06, 0.1, 0.06, dark, 0, 0.06, 0));
      g.add(box(0.4, 0.02, 0.18, dark, 0, 0.01, 0));
      break;
    }
    case 'speaker': {
      const b = cyl(0.1, 0.1, 0.34, main, 0, 0.1, 0);
      b.rotation.z = Math.PI / 2;
      const grille = cyl(0.102, 0.102, 0.24, mat('#1b1b1f', 0.9), 0, 0.1, 0);
      grille.rotation.z = Math.PI / 2;
      g.add(b, grille);
      break;
    }
    case 'console': {
      g.add(box(0.14, 0.44, 0.34, main, 0, 0.22, 0));
      g.add(box(0.02, 0.46, 0.36, dark, 0, 0.23, 0));
      const pad = box(0.2, 0.04, 0.1, dark, 0.26, 0.02, 0.1);
      g.add(pad);
      break;
    }
    case 'vinyl': {
      const sleeve = box(0.4, 0.4, 0.02, main, 0, 0.21, -0.03);
      const disc = cyl(0.19, 0.19, 0.005, dark, 0.07, 0.21, 0);
      disc.rotation.x = Math.PI / 2;
      const label = cyl(0.06, 0.06, 0.007, mat('#ffd166'), 0.07, 0.21, 0);
      label.rotation.x = Math.PI / 2;
      g.add(sleeve, disc, label, box(0.3, 0.02, 0.14, dark, 0, 0.01, -0.02));
      break;
    }
    case 'bag': {
      g.add(box(0.36, 0.38, 0.1, main, 0, 0.19, 0));
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 20, Math.PI), mat('#8d6e63'));
      h.position.y = 0.38;
      g.add(h);
      break;
    }
    case 'cap': {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), main);
      crown.position.y = 0.02;
      const brim = cyl(0.12, 0.12, 0.012, main, 0, 0.02, 0.13);
      brim.scale.z = 0.8;
      g.add(crown, brim, cyl(0.05, 0.08, 0.02, dark, 0, 0.01, 0));
      g.position.y = 0.0;
      break;
    }
    case 'lipstick': {
      g.add(cyl(0.035, 0.035, 0.12, mat('#d4af37', 0.3, 0.9), 0, 0.06, 0));
      g.add(cyl(0.028, 0.028, 0.06, main, 0, 0.15, 0));
      const tip = cyl(0.001, 0.028, 0.04, main, 0, 0.2, 0);
      g.add(tip);
      g.scale.setScalar(1.8);
      break;
    }
    case 'perfume': {
      const glass = glassMat(color);
      g.add(box(0.2, 0.22, 0.09, glass, 0, 0.11, 0));
      g.add(cyl(0.03, 0.03, 0.04, mat('#d4af37', 0.3, 0.9), 0, 0.24, 0));
      g.add(box(0.1, 0.07, 0.07, mat('#111', 0.3), 0, 0.29, 0));
      break;
    }
    case 'jar': {
      g.add(cyl(0.11, 0.11, 0.1, mat(color, 0.3), 0, 0.05, 0));
      g.add(cyl(0.115, 0.115, 0.04, mat('#ffffff', 0.3), 0, 0.12, 0));
      break;
    }
  }
  return g;
}

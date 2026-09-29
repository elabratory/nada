import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Product } from '../data/mall';
import { createProductMesh } from '../scene/products3d';

/** A single shared mini-renderer that shows the selected product turning on a turntable. */
export class ProductPreview {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1.6, 0.05, 20);
  private model: THREE.Object3D | null = null;
  private host: HTMLElement | null = null;
  private dragging = false;
  private lastX = 0;
  private spinPaused = 0;

  mount(host: HTMLElement, p: Product) {
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        host.append(Object.assign(document.createElement('div'), { className: 'preview-fallback', textContent: p.name }));
        return;
      }
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.add(new THREE.HemisphereLight('#ffffff', '#666666', 1.2));
      const d = new THREE.DirectionalLight('#ffffff', 1.4);
      d.position.set(2, 3, 2);
      this.scene.add(d);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.6 }));
      floor.rotation.x = -Math.PI / 2;
      this.scene.add(floor);
      const el = this.renderer.domElement;
      el.addEventListener('pointerdown', (e) => {
        this.dragging = true;
        this.lastX = e.clientX;
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!this.dragging || !this.model) return;
        this.model.rotation.y += (e.clientX - this.lastX) * 0.012;
        this.lastX = e.clientX;
        this.spinPaused = 2;
      });
      el.addEventListener('pointerup', () => (this.dragging = false));
    }
    if (this.model) this.scene.remove(this.model);
    this.model = createProductMesh(p.shape, p.color, p.accent);
    this.scene.add(this.model);
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z);
    this.camera.position.set(center.x + r * 1.3, center.y + r * 0.7, center.z + r * 1.9);
    this.camera.lookAt(center);
    this.host = host;
    host.append(this.renderer.domElement);
    this.resize();
  }

  private resize() {
    if (!this.renderer || !this.host) return;
    const w = this.host.clientWidth || 320;
    const hgt = this.host.clientHeight || 220;
    this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number, reducedMotion: boolean) {
    if (!this.renderer || !this.host || !this.host.isConnected || !this.model) return;
    if (this.renderer.domElement.width !== Math.round((this.host.clientWidth || 1) * this.renderer.getPixelRatio())) this.resize();
    this.spinPaused = Math.max(0, this.spinPaused - dt);
    if (!reducedMotion && !this.dragging && this.spinPaused === 0) this.model.rotation.y += dt * 0.6;
    this.renderer.render(this.scene, this.camera);
  }
}

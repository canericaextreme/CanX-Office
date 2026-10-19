/**
 * Live Brain view — the three.js scene (browser only; loaded on demand).
 *
 * Draws the Office from above with a slight tilt: the Brain glowing in the
 * middle, one node per room in its office-map position, faint spokes from the
 * Brain to every room, and brighter arcs for routes work has actually taken.
 * A spark travels along an arc each time the logbook records a move, then the
 * destination ripples. Rooms with active work breathe gently; stalled rooms
 * breathe slowly. Everything shown comes from the view model — nothing is
 * decorative activity. Reduced motion: no sway or breathing, moves show as a
 * ripple only.
 */
import * as THREE from "three";
import type { BrainView, BrainStage } from "@/lib/brain-view";
import { STAGE_COLOURS, STAGE_DISPLAY_ORDER } from "@/lib/brain-view";
import type { BrainViewRoom } from "@/lib/brain-view-layout";

const SPREAD = 4.2;
const IDLE = new THREE.Color("#5b6270");
const HUB = new THREE.Color("#c9c4ff");
const ROUTE = new THREE.Color("#7f9cd8");
const BG = "#141821";
const SPARK_MS = 1800;
const RIPPLE_MS = 900;
/** Which stage colours a room when several are present: what needs attention first. */
const DOMINANCE: BrainStage[] = [
  "stalled",
  "building",
  "strategizing",
  "brainstorming",
  "completed",
];

export interface SceneHover {
  route: string;
  x: number;
  y: number;
}

interface NodeObj {
  room: BrainViewRoom;
  pos: THREE.Vector3;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  halo: THREE.Sprite;
  label: HTMLDivElement;
  active: number;
  stage: BrainStage | null;
  phase: number;
}

interface SparkObj {
  curve: THREE.QuadraticBezierCurve3;
  mesh: THREE.Sprite;
  trail: THREE.Sprite[];
  start: number;
  to: string;
  colour: THREE.Color;
}

interface RippleObj {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  start: number;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export class BrainLiveScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private world = new THREE.Group();
  private nodes = new Map<string, NodeObj>();
  private routes = new Map<string, THREE.Line>();
  private sparks: SparkObj[] = [];
  private ripples: RippleObj[] = [];
  private glow = glowTexture();
  private raf = 0;
  private running = false;
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hovered: string | null = null;
  private labelLayer: HTMLDivElement;
  private hub: NodeObj | null = null;
  private anyActive = false;
  private disposed = false;
  private lastRender = 0;

  constructor(
    private container: HTMLElement,
    rooms: BrainViewRoom[],
    private opts: { reducedMotion: boolean; onHover?: (h: SceneHover | null) => void },
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(BG, 1);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);

    this.labelLayer = document.createElement("div");
    this.labelLayer.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
    container.appendChild(this.labelLayer);

    this.camera.position.set(0, -6.4, 7.6);
    this.camera.lookAt(0, -0.2, 0);
    this.scene.add(this.world);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, -4, 8);
    this.scene.add(key);

    this.buildFloor();
    for (const r of rooms) this.addNode(r);
    this.buildSpokes();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    if ("IntersectionObserver" in window) {
      this.io = new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        if (this.visible) this.start();
      });
      this.io.observe(container);
    }
    document.addEventListener("visibilitychange", this.onVisibility);
    this.renderer.domElement.addEventListener("pointermove", this.onPointer);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointer);
    this.renderer.domElement.addEventListener("pointerleave", this.onLeave);
    this.resize();
    this.start();
  }

  private buildFloor() {
    const mat = new THREE.LineBasicMaterial({ color: 0x2a3140, transparent: true, opacity: 0.8 });
    for (const r of [0.33, 0.66, 1]) {
      const pts = new THREE.EllipseCurve(0, 0, r * SPREAD, r * SPREAD, 0, Math.PI * 2).getPoints(
        96,
      );
      this.world.add(
        new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            pts.map((p) => new THREE.Vector3(p.x, p.y, -0.02)),
          ),
          mat,
        ),
      );
    }
  }

  private addNode(room: BrainViewRoom) {
    const pos = new THREE.Vector3(room.x * SPREAD, room.y * SPREAD, room.hub ? 0.25 : 0);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(room.hub ? 0.42 : 0.14, 32, 16),
      new THREE.MeshStandardMaterial({
        color: room.hub ? HUB : IDLE,
        emissive: room.hub ? HUB : IDLE,
        emissiveIntensity: room.hub ? 0.55 : 0.15,
        roughness: 0.45,
        metalness: 0.1,
      }),
    );
    mesh.position.copy(pos);
    mesh.userData["route"] = room.route;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glow,
        color: room.hub ? HUB : IDLE,
        transparent: true,
        opacity: room.hub ? 0.55 : 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.copy(pos);
    halo.scale.setScalar(room.hub ? 2.2 : 0.9);
    this.world.add(halo, mesh);

    const label = document.createElement("div");
    label.textContent = room.label;
    label.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,0);white-space:nowrap;font:${room.hub ? "600 12px" : "500 10.5px"}/1.2 system-ui,sans-serif;color:#e8ebf2;text-shadow:0 1px 2px #000,0 0 6px #000;opacity:${room.hub ? 1 : 0.55};transition:opacity .3s;`;
    this.labelLayer.appendChild(label);
    const n: NodeObj = {
      room,
      pos,
      mesh,
      halo,
      label,
      active: 0,
      stage: null,
      phase: Math.random() * Math.PI * 2,
    };
    this.nodes.set(room.route, n);
    if (room.hub) this.hub = n;
  }

  private buildSpokes() {
    if (!this.hub) return;
    const mat = new THREE.LineBasicMaterial({ color: 0x8a93a6, transparent: true, opacity: 0.12 });
    for (const n of this.nodes.values()) {
      if (n === this.hub) continue;
      this.world.add(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.hub.pos, n.pos]), mat),
      );
    }
  }

  private arc(from: THREE.Vector3, to: THREE.Vector3): THREE.QuadraticBezierCurve3 {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.z += 0.5 + from.distanceTo(to) * 0.18;
    return new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
  }

  /** Apply the current view: node colours/sizes, and arcs for routes work has taken. */
  update(view: BrainView) {
    this.anyActive = false;
    for (const n of this.nodes.values()) {
      const node = view.nodes.find((x) => x.room === n.room.route);
      n.active = node?.active ?? 0;
      n.stage = node ? (DOMINANCE.find((st) => node.byStage[st] > 0) ?? null) : null;
      if (n.active > 0) this.anyActive = true;
      if (n.room.hub) {
        if (n.active > 0 && n.stage) n.halo.material.color.set(STAGE_COLOURS[n.stage]);
        continue;
      }
      const colour = n.stage ? new THREE.Color(STAGE_COLOURS[n.stage]) : IDLE;
      n.mesh.material.color.copy(colour);
      n.mesh.material.emissive.copy(colour);
      n.mesh.material.emissiveIntensity = n.active > 0 ? 0.6 : n.stage ? 0.25 : 0.12;
      const size =
        n.active > 0 ? 1 + Math.min(1.2, Math.sqrt(n.active) * 0.35) : n.stage ? 0.9 : 0.75;
      n.mesh.scale.setScalar(size);
      n.halo.material.color.copy(colour);
      n.halo.material.opacity = n.active > 0 ? 0.55 : 0;
      n.halo.scale.setScalar(0.9 * size + 0.4);
      n.label.style.opacity = n.active > 0 ? "1" : "0.55";
    }
    for (const sp of view.sparks) this.ensureRoute(sp.fromRoom, sp.toRoom);
    this.start();
  }

  private ensureRoute(from: string, to: string) {
    const key = [from, to].sort().join("|");
    if (this.routes.has(key)) return;
    const a = this.nodes.get(from);
    const b = this.nodes.get(to);
    if (!a || !b) return;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(this.arc(a.pos, b.pos).getPoints(40)),
      new THREE.LineBasicMaterial({ color: ROUTE, transparent: true, opacity: 0.35 }),
    );
    this.routes.set(key, line);
    this.world.add(line);
  }

  /** Animate one recorded move. */
  spark(fromRoom: string | null, toRoom: string, stage: BrainStage) {
    const b = this.nodes.get(toRoom);
    if (!b) return;
    const colour = new THREE.Color(STAGE_COLOURS[stage]);
    const a = fromRoom ? this.nodes.get(fromRoom) : null;
    if (!a || a === b || this.opts.reducedMotion) {
      this.ripple(b, colour);
      return;
    }
    this.ensureRoute(a.room.route, b.room.route);
    const mesh = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glow,
        color: colour,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.scale.setScalar(0.85);
    this.world.add(mesh);
    const trail = [0.6, 0.42, 0.28, 0.16].map((op, i) => {
      const t = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glow,
          color: colour,
          transparent: true,
          opacity: op,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      t.scale.setScalar(0.62 - i * 0.1);
      this.world.add(t);
      return t;
    });
    this.sparks.push({
      curve: this.arc(a.pos, b.pos),
      mesh,
      trail,
      start: performance.now(),
      to: toRoom,
      colour,
    });
    this.start();
  }

  private ripple(n: NodeObj, colour: THREE.Color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.2, 48),
      new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.position.copy(n.pos);
    mesh.position.z += 0.01;
    this.world.add(mesh);
    this.ripples.push({ mesh, start: performance.now() });
    this.start();
  }

  private onVisibility = () => {
    if (!document.hidden) this.start();
  };

  private onPointer = (ev: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      [...this.nodes.values()].map((n) => n.mesh),
      false,
    )[0];
    const route = (hit?.object.userData["route"] as string | undefined) ?? null;
    this.hovered = route;
    this.renderer.domElement.style.cursor = route ? "pointer" : "default";
    this.opts.onHover?.(
      route ? { route, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null,
    );
  };

  private onLeave = () => {
    this.hovered = null;
    this.opts.onHover?.(null);
  };

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole Office (and its outer labels) in frame on narrow phone screens:
    // pick the vertical angle that fits the full width, never narrower than the desktop view.
    const aspect = w / h;
    this.camera.fov = Math.max(38, (2 * Math.atan(0.5 / aspect) * 180) / Math.PI);
    this.camera.updateProjectionMatrix();
    this.start();
  }

  private start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    // Gentle breathing only needs ~25 frames a second; save the battery when nothing is travelling.
    if (!this.sparks.length && !this.ripples.length && now - this.lastRender < 40) {
      if (this.visible && !document.hidden) this.raf = requestAnimationFrame(this.frame);
      else this.running = false;
      return;
    }
    this.lastRender = now;
    const t = now / 1000;
    const rm = this.opts.reducedMotion;
    if (!rm) this.world.rotation.z = Math.sin(t * 0.08) * 0.1;

    for (const n of this.nodes.values()) {
      if (n.room.hub) {
        const s = rm ? 1 : 1 + (this.anyActive ? 0.06 : 0.025) * Math.sin(t * 1.6);
        n.mesh.scale.setScalar(s);
        n.halo.scale.setScalar(2.2 * s);
      } else if (n.active > 0 && !rm) {
        const speed = n.stage === "stalled" ? 0.7 : 2.1;
        n.halo.material.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * speed + n.phase));
      }
    }

    for (const sp of [...this.sparks]) {
      const k = Math.min(1, (now - sp.start) / SPARK_MS);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      sp.mesh.position.copy(sp.curve.getPoint(e));
      sp.trail.forEach((t, i) =>
        t.position.copy(sp.curve.getPoint(Math.max(0, e - (i + 1) * 0.045))),
      );
      if (k >= 1) {
        this.world.remove(sp.mesh, ...sp.trail);
        sp.mesh.material.dispose();
        sp.trail.forEach((t) => t.material.dispose());
        this.sparks.splice(this.sparks.indexOf(sp), 1);
        const dest = this.nodes.get(sp.to);
        if (dest) this.ripple(dest, sp.colour);
      }
    }
    for (const r of [...this.ripples]) {
      const k = Math.min(1, (now - r.start) / RIPPLE_MS);
      r.mesh.scale.setScalar(1 + k * 3.2);
      r.mesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        this.world.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.ripples.splice(this.ripples.indexOf(r), 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.placeLabels();

    const moving = this.sparks.length > 0 || this.ripples.length > 0;
    const breathing = !rm;
    if ((moving || breathing) && this.visible && !document.hidden)
      this.raf = requestAnimationFrame(this.frame);
    else this.running = false;
  };

  private placeLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const narrow = w < 520;
    const v = new THREE.Vector3();
    for (const n of this.nodes.values()) {
      v.copy(n.pos);
      v.z -= n.room.hub ? 0.55 : 0.25;
      this.world.localToWorld(v);
      v.project(this.camera);
      n.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h + (n.room.hub ? 6 : 4)}px) translate(-50%, 0)`;
      n.label.style.fontWeight = this.hovered === n.room.route ? "700" : "";
      // Phones: only the Brain, rooms with active work and the room being touched keep a label, so names don't pile up.
      const show = !narrow || n.room.hub || n.active > 0 || this.hovered === n.room.route;
      n.label.style.display = show ? "" : "none";
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.renderer.domElement.removeEventListener("pointermove", this.onPointer);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointer);
    this.renderer.domElement.removeEventListener("pointerleave", this.onLeave);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.glow.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
  }
}

export { STAGE_DISPLAY_ORDER };

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Attitude, Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { WorldData } from '../world/worldTypes';
import { ChaseCamera } from './cameraRig';
import { createPetalField, type PetalField } from './petals';
import {
  createProceduralAircraft,
  type ProceduralAircraft,
} from './proceduralAircraft';
import { createSkyAtmosphere, type SkyAtmosphere } from './sky';
import { createSpeedRibbons, type SpeedRibbons } from './speedRibbons';

export class WebGL2UnavailableError extends Error {
  public constructor() {
    super('此游戏需要 WebGL2，但当前浏览器无法创建 WebGL2 上下文。请开启硬件加速或换用最新版桌面浏览器。');
    this.name = 'WebGL2UnavailableError';
  }
}

export interface RenderStats {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  fps: number;
}

export interface RenderQuality {
  name: 'balanced' | 'high';
  pixelRatioCap: number;
  bloom: boolean;
}

const QUALITY_PRESETS: Record<RenderQuality['name'], RenderQuality> = {
  balanced: { name: 'balanced', pixelRatioCap: 1.5, bloom: true },
  high: { name: 'high', pixelRatioCap: 2, bloom: true },
};

export class GameRenderer {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly scene = new THREE.Scene();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly cameraRig: ChaseCamera;
  private readonly atmosphere: SkyAtmosphere;
  private readonly petals: PetalField;
  private readonly speedRibbons: SpeedRibbons;
  private readonly proceduralAircraft: ProceduralAircraft;
  private readonly aircraftMount = new THREE.Group();
  private externalAircraft: THREE.Object3D | null = null;
  private readonly world: WorldData;
  private readonly resizeObserver: ResizeObserver;
  private readonly aircraftEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private quality = QUALITY_PRESETS.balanced;
  private lastFrameTime = performance.now();
  private smoothedFps = 60;
  private drawnCalls = 0;
  private drawnTriangles = 0;
  private drawnPoints = 0;
  private drawnLines = 0;
  private disposed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    world: WorldData,
  ) {
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    if (!context) throw new WebGL2UnavailableError();

    this.world = world;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.01;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;

    this.scene.fog = new THREE.FogExp2(0x6f4152, 0.00096);
    this.scene.background = new THREE.Color(0x241723);
    this.scene.add(world.root);

    this.camera = new THREE.PerspectiveCamera(64, 1, 0.25, 2300);
    this.cameraRig = new ChaseCamera(this.camera);

    this.atmosphere = createSkyAtmosphere();
    this.scene.add(this.atmosphere.group);

    const hemisphere = new THREE.HemisphereLight(0xffc1a1, 0x17131f, 1.45);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffd3ac, 3.4);
    sun.position.copy(this.atmosphere.sunDirection).multiplyScalar(480);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.near = 30;
    sun.shadow.camera.far = 1000;
    sun.shadow.camera.left = -330;
    sun.shadow.camera.right = 330;
    sun.shadow.camera.top = 330;
    sun.shadow.camera.bottom = -330;
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x53e5cf, 1.25);
    rim.position.set(250, 110, -500);
    this.scene.add(rim);

    this.proceduralAircraft = createProceduralAircraft();
    this.aircraftMount.name = 'aircraft-mount';
    this.aircraftMount.add(this.proceduralAircraft.group);
    this.speedRibbons = createSpeedRibbons();
    this.aircraftMount.add(this.speedRibbons.object);
    this.scene.add(this.aircraftMount);

    this.petals = createPetalField();
    this.scene.add(this.petals.points);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.52, 0.34, 0.74);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.setAircraftTransform(world.spawn.position, {
      pitch: world.spawn.pitch,
      roll: 0,
      yaw: world.spawn.yaw,
    }, false);
    this.cameraRig.updateAttract(performance.now(), world.spawn.position);
  }

  public setQuality(name: RenderQuality['name']): void {
    this.quality = QUALITY_PRESETS[name];
    this.bloomPass.enabled = this.quality.bloom;
    this.resize();
  }

  public getQuality(): RenderQuality {
    return { ...this.quality };
  }

  public setAircraftModel(model: THREE.Object3D | null): void {
    if (this.externalAircraft) {
      this.aircraftMount.remove(this.externalAircraft);
      this.externalAircraft = null;
    }
    if (model) {
      this.externalAircraft = model;
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this.aircraftMount.add(model);
      this.proceduralAircraft.group.visible = false;
    } else {
      this.proceduralAircraft.group.visible = true;
    }
  }

  public snapCamera(state: FlightState): void {
    this.cameraRig.snapTo(state);
  }

  public renderTitle(now: number): void {
    this.atmosphere.update(now);
    this.cameraRig.updateAttract(now, this.world.spawn.position);
    const bob = Math.sin(now * 0.0012) * 0.35;
    this.setAircraftTransform(
      {
        x: this.world.spawn.position.x,
        y: this.world.spawn.position.y + bob,
        z: this.world.spawn.position.z,
      },
      { pitch: this.world.spawn.pitch, roll: Math.sin(now * 0.0007) * 0.07, yaw: this.world.spawn.yaw },
      false,
    );
    this.petals.update(1 / 60, this.world.spawn.position);
    this.speedRibbons.hide();
    this.draw(now);
  }

  public renderFlight(state: FlightState, dt: number, now: number): void {
    this.atmosphere.update(now);
    this.cameraRig.update(dt, state);
    this.setAircraftTransform(state.position, state.attitude, state.boosting);
    this.petals.update(dt, state.position);
    this.speedRibbons.update(state.speed, state.boosting, dt);
    this.draw(now);
  }

  public getStats(): RenderStats {
    return {
      calls: this.drawnCalls,
      triangles: this.drawnTriangles,
      points: this.drawnPoints,
      lines: this.drawnLines,
      fps: this.smoothedFps,
    };
  }

  public getWorldStats(): WorldData['stats'] {
    return this.world.stats;
  }

  public getWorldSpawn(): WorldData['spawn'] {
    return this.world.spawn;
  }

  public resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatioCap);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.composer.dispose();
    this.proceduralAircraft.dispose();
    this.atmosphere.dispose();
    this.petals.dispose();
    this.speedRibbons.dispose();
    this.world.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          for (const material of object.material) material.dispose();
        } else {
          object.material.dispose();
        }
      }
    });
    this.renderer.dispose();
  }

  private setAircraftTransform(position: Vec3, attitude: Attitude, boosting: boolean): void {
    this.aircraftMount.position.set(position.x, position.y, position.z);
    this.aircraftEuler.set(attitude.pitch, attitude.yaw, attitude.roll, 'YXZ');
    this.aircraftMount.quaternion.setFromEuler(this.aircraftEuler);
    this.proceduralAircraft.exhaust.visible = this.proceduralAircraft.group.visible;
    const pulse = 0.78 + Math.sin(performance.now() * 0.018) * 0.08;
    this.proceduralAircraft.exhaust.scale.set(
      boosting ? 1.15 : 0.72,
      boosting ? 1.15 : 0.72,
      boosting ? 2.3 * pulse : 0.75 * pulse,
    );
  }

  private draw(now: number): void {
    const instantFps = 1000 / Math.max(1, now - this.lastFrameTime);
    this.lastFrameTime = now;
    this.smoothedFps = this.smoothedFps * 0.94 + instantFps * 0.06;
    this.renderer.info.reset();
    this.composer.render();
    this.drawnCalls = this.renderer.info.render.calls;
    this.drawnTriangles = this.renderer.info.render.triangles;
    this.drawnPoints = this.renderer.info.render.points;
    this.drawnLines = this.renderer.info.render.lines;
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('skimmer:webgl-context-lost'));
  };
}

export type { FlightState };

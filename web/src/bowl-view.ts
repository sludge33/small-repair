import {
  ACESFilmicToneMapping,
  Box2,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  LatheGeometry,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  RedFormat,
  RepeatWrapping,
  Scene,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import { buildPiece, type MeshData } from './core/bowl-mesh';
import type { BowlRepair } from './core/bowl-repair';
import { facingAngles, surfaceNormal, surfacePoint, type Uv } from './core/bowl-surface';
import { bodyHoles, bodyOutline, SHARDS } from './core/fracture';
import { clamp01, deltaAngle } from './core/math';
import { rasterizeBands, type PaintMask } from './core/paint-mask';
import { judgeFit, type ShardFit } from './core/shard-fit';

const FIELD_OF_VIEW_DEG = 28;
/** The camera backs off until at least this much is in frame, at the plane through the bowl's centre. */
const FRAME_WIDTH_MM = 152;
const FRAME_HEIGHT_MM = 250;
/** Moves the picture up the screen, as a share of its height, leaving room for the shards and tool tray below. */
const LENS_SHIFT = 0.09;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 2.4;

const MAX_EDGE_MM = 4;
const BOWL_CENTER_Y_MM = 30;
const SEAM_LINE_HALF_WIDTH_MM = 0.5;

const ORBIT_RADIANS_PER_PX = 0.0075;
const MIN_PITCH = -1.25;
const MAX_PITCH = 1.35;

/** Time constants of the eases, in seconds. */
const ORBIT_FOLLOW_S = 0.05;
const FACE_SEAT_S = 0.22;
const SHARD_FOLLOW_S = 0.04;
const SHARD_RETURN_S = 0.14;
const LID_S = 0.16;

/** Closer than these to where it is heading, nothing on screen would visibly change, so the frame is not drawn. */
const SETTLED_RADIANS = 0.0005;
const SETTLED_LID = 0.001;
const SETTLED_MM_SQUARED = 0.01;

/** Screen positions of the waiting shards, as normalised device coordinates. */
const TRAY_X = [-0.58, 0, 0.58];
const TRAY_Y = -0.56;
const TRAY_FACING = new Vector3(0, 0.34, 1).normalize();
const TRAY_SPIN = [0.5, -0.3, 0.9];
/** How far each shard starts rotated when picked up, in radians. Getting it square by hand is what earns a clean seat. */
const START_TWIST = [0.24, -0.16, 0.31];
/** A shard this far from the finger on screen can still be picked up. */
const PICK_RADIUS_PX = 76;

const LID_OPEN_Y_MM = 300;
const LID_CLOSED_Y_MM = -44;
const LID_SHUT_AMOUNT = 0.97;
const LID_PITCH = 0.3;

const SCREEN_AXIS = new Vector3(0, 0, 1);
const IDENTITY = new Quaternion();

const damp = (seconds: number, deltaTime: number) => 1 - Math.exp(-deltaTime / seconds);

function toGeometry(mesh: MeshData) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
  geometry.setAttribute('color', new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return geometry;
}

/** Indexes a mesh's triangles: testing all 40,000 of the bowl's on every touch frame would cost a phone its frame. */
function indexForPicking(mesh: Mesh) {
  mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
  mesh.raycast = acceleratedRaycast;
}

function lathe(profile: number[][], segments: number) {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
}

function maskTexture(data: Uint8Array, width: number, height: number) {
  const texture = new DataTexture(data as Uint8Array<ArrayBuffer>, width, height, RedFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const VERTEX_HEAD = /* glsl */ `
varying vec2 vMaskUv;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uGlue;
uniform sampler2D uLacquer;
uniform sampler2D uGold;
uniform sampler2D uSheen;
uniform sampler2D uSeam;
varying vec2 vMaskUv;
`;

// Coats are layered in the order they go on, each hiding the last.
const FRAGMENT_COLOR = /* glsl */ `
float grit = fract(sin(dot(floor(vMaskUv * vec2(2048.0, 1024.0)), vec2(12.9898, 78.233))) * 43758.5453);
float seamLine = texture2D(uSeam, vMaskUv).r;
float glueCoat = 1.0 - smoothstep(0.3, 0.6, texture2D(uGlue, vMaskUv).r);
float lacquerCoat = smoothstep(0.22, 0.55, texture2D(uLacquer, vMaskUv).r);
float goldCoat = smoothstep(0.18, 0.5, texture2D(uGold, vMaskUv).r);
float sheen = smoothstep(0.1, 0.6, texture2D(uSheen, vMaskUv).r);
diffuseColor.rgb *= 1.0 - 0.72 * seamLine;
diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.34, 0.17, 0.04), vec3(0.62, 0.38, 0.11), grit), glueCoat);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.016, 0.014), lacquerCoat);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.72, 0.3) * mix(0.55 + 0.2 * grit, 1.0, sheen), goldCoat);
`;

// A placeholder for the glint a smoother metal would pick up from a brighter room: polish must read as a gain, and
// RoomEnvironment is dim enough that low roughness alone darkens gold.
const FRAGMENT_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += goldCoat * sheen * vec3(0.3, 0.19, 0.06);
`;

const FRAGMENT_ROUGHNESS = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.85, glueCoat);
roughnessFactor = mix(roughnessFactor, 0.22, lacquerCoat);
roughnessFactor = mix(roughnessFactor, mix(0.68, 0.17, sheen), goldCoat);
`;

const FRAGMENT_METALNESS = /* glsl */ `
metalnessFactor = mix(metalnessFactor, 1.0, goldCoat);
`;

/** The bowl and shards on screen: everything that reads the repair's masks and everything a pointer can hit. */
export class BowlView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FIELD_OF_VIEW_DEG, 1, 10, 4000);
  /** Turned to show the bowl; the camera never moves except to zoom. */
  private readonly pivot = new Group();
  /** Shifted so the bowl turns about its own middle. Seated shards live in here, at their seat positions. */
  private readonly bowl = new Group();
  private readonly body: Mesh;
  private readonly foot: Mesh;
  private readonly lid: Mesh;
  private readonly shardMeshes: Mesh[] = [];
  private readonly seats: Vector3[] = [];
  private readonly trayPoses: { position: Vector3; rotation: Quaternion }[] = [];
  private readonly liveMasks: [PaintMask, DataTexture][] = [];
  private readonly uploadRegion = new Box2();
  private readonly uploadPosition = new Vector2();

  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly plane = new Plane();

  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private followSeconds = ORBIT_FOLLOW_S;
  private zoom = 1;
  private lidTarget = 0;
  private lidAmount = 0;
  private width = 1;
  private height = 1;
  /** The picture on screen is out of date for a reason the eases cannot see. */
  private stale = true;

  private heldIndex: number | null = null;
  private heldTwist = 0;
  private readonly heldPosition = new Vector3();
  private readonly heldRotation = new Quaternion();

  constructor(
    parent: HTMLElement,
    private readonly repair: BowlRepair,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.addEventListener('webglcontextrestored', () => (this.stale = true));
    document.addEventListener('visibilitychange', () => (this.stale = true));
    parent.prepend(this.renderer.domElement);

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const key = new DirectionalLight(0xffdcb4, 2.3);
    key.position.set(-130, 240, 210);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -120;
    key.shadow.camera.right = 120;
    key.shadow.camera.top = 120;
    key.shadow.camera.bottom = -120;
    key.shadow.camera.near = 50;
    key.shadow.camera.far = 700;
    key.shadow.radius = 5;
    key.shadow.normalBias = 1.2;
    this.scene.add(key);

    const ceramic = this.ceramicMaterial();

    this.bowl.position.y = -BOWL_CENTER_Y_MM;
    this.pivot.add(this.bowl);
    this.scene.add(this.pivot);

    this.body = new Mesh(toGeometry(buildPiece(bodyOutline(), bodyHoles(), MAX_EDGE_MM)), ceramic);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.bowl.add(this.body);
    indexForPicking(this.body);

    const footProfile = [
      [24, 12],
      [26.5, 1],
      [27.5, 0],
      [32, 0],
      [33, 1],
      [34, 17],
    ];
    this.foot = new Mesh(lathe(footProfile, 72), new MeshStandardMaterial({ color: 0xa88c6c, roughness: 0.88, side: DoubleSide }));
    this.foot.castShadow = true;
    this.foot.receiveShadow = true;
    this.bowl.add(this.foot);

    SHARDS.forEach((shard, i) => {
      const geometry = toGeometry(buildPiece(shard.polygon, [], MAX_EDGE_MM));
      const seat = new Vector3(...surfacePoint(shard.center.u, shard.center.v, 'outer'));
      geometry.translate(-seat.x, -seat.y, -seat.z);
      const mesh = new Mesh(geometry, ceramic);
      indexForPicking(mesh);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.shardMeshes.push(mesh);
      this.seats.push(seat);

      // Outside uppermost and a little towards the light, with each shard turned its own way.
      const normal = new Vector3(...surfaceNormal(shard.center.u, shard.center.v, 'outer'));
      const rotation = new Quaternion().setFromUnitVectors(normal, TRAY_FACING);
      rotation.premultiply(new Quaternion().setFromAxisAngle(TRAY_FACING, TRAY_SPIN[i]));
      this.trayPoses.push({ position: new Vector3(), rotation });
    });

    const lidProfile = [
      [96, 0],
      [96, 104],
      [88, 118],
      [60, 128],
      [0, 130],
    ];
    this.lid = new Mesh(lathe(lidProfile, 64), new MeshStandardMaterial({ color: 0x5b3f2a, roughness: 0.62, side: DoubleSide }));
    this.lid.castShadow = true;
    this.lid.visible = false;
    this.scene.add(this.lid);

    this.yaw = this.targetYaw = facingAngles(SHARDS[0].center.u, SHARDS[0].center.v).yaw;
    this.pitch = this.targetPitch = 0.42;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.placeShardsInTray();
  }

  /** Back to the broken state: shards in the tray and the lid off. */
  reset() {
    this.heldIndex = null;
    this.lidTarget = 0;
    this.lidAmount = 0;
    this.placeShardsInTray();
    this.stale = true;
  }

  get pixelRatio() {
    return this.renderer.getPixelRatio();
  }

  set pixelRatio(ratio: number) {
    this.renderer.setPixelRatio(ratio);
    this.stale = true;
  }

  orbit(dxPx: number, dyPx: number) {
    this.followSeconds = ORBIT_FOLLOW_S;
    this.targetYaw += dxPx * ORBIT_RADIANS_PER_PX;
    this.targetPitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.targetPitch + dyPx * ORBIT_RADIANS_PER_PX));
  }

  zoomBy(factor: number) {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.resize();
  }

  /** The (u, v) under a screen position, on the bowl or a seated shard. Null when the finger is off the bowl. */
  hitBowl(clientX: number, clientY: number): Uv | null {
    this.aim(clientX, clientY);
    const targets = [this.body, this.foot, ...this.shardMeshes.filter((_, i) => this.repair.seated[i])];
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit || hit.object === this.foot || !hit.uv) return null;
    return { u: hit.uv.x, v: hit.uv.y };
  }

  /** The nearest waiting shard to a screen position, if any is within a thumb's reach. */
  pickShard(clientX: number, clientY: number) {
    let best: number | null = null;
    let bestDistance = PICK_RADIUS_PX;
    this.shardMeshes.forEach((mesh, i) => {
      if (this.repair.seated[i]) return;
      const screen = this.toClient(mesh.position);
      const distance = Math.hypot(screen.x - clientX, screen.y - clientY);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  }

  /** Picks a shard up and starts turning the bowl to face its seat. */
  grab(index: number) {
    const { u, v } = SHARDS[index].center;
    this.turnTo(u, v);
    this.heldIndex = index;
    this.heldTwist = START_TWIST[index];
    this.heldPosition.copy(this.shardMeshes[index].position);
    this.heldRotation.copy(this.shardMeshes[index].quaternion);
  }

  /** Turns the held shard, in radians. Positive is clockwise on screen. */
  twistHeld(radians: number) {
    this.heldTwist += radians;
  }

  /** Moves the held shard to a screen position and judges how close it is to its seat. */
  hold(clientX: number, clientY: number): ShardFit {
    const index = this.heldIndex!;
    this.pivot.rotation.set(this.pitch, this.yaw, 0, 'XYZ');
    this.pivot.updateWorldMatrix(true, true);
    const seat = this.bowl.localToWorld(this.seats[index].clone());

    this.aim(clientX, clientY);
    this.plane.setFromNormalAndCoplanarPoint(SCREEN_AXIS, seat);
    const finger = this.raycaster.ray.intersectPlane(this.plane, new Vector3()) ?? seat.clone();

    const fit = judgeFit(finger.distanceTo(seat), Math.abs(this.heldTwist) * (180 / Math.PI));
    this.heldPosition.copy(finger).lerp(seat, fit.pull);
    // Clockwise on screen is a negative turn about +Z, which points out of the screen.
    this.heldRotation.setFromAxisAngle(SCREEN_AXIS, -this.heldTwist * (1 - fit.pull)).multiply(this.pivot.quaternion);
    return fit;
  }

  /** Lets go of the held shard: into its seat when `seated` is true, otherwise back to the tray. */
  release(seated: boolean) {
    const index = this.heldIndex;
    this.heldIndex = null;
    if (index !== null && seated) this.bowl.attach(this.shardMeshes[index]);
    this.stale = true;
  }

  get lidShut() {
    return this.lidAmount >= LID_SHUT_AMOUNT;
  }

  closeLid() {
    this.lidTarget = 1;
    this.followSeconds = FACE_SEAT_S;
    this.targetPitch = LID_PITCH;
  }

  openLid() {
    this.lidTarget = 0;
  }

  /** Where a point on the bowl's outer wall shows on screen. */
  project(u: number, v: number) {
    this.pivot.updateWorldMatrix(true, true);
    return this.toClient(this.bowl.localToWorld(new Vector3(...surfacePoint(u, v, 'outer'))));
  }

  /** Where a waiting or held shard shows on screen. */
  shardOnScreen(index: number) {
    return this.toClient(this.shardMeshes[index].getWorldPosition(new Vector3()));
  }

  /** Eases the bowl round to a point on its outer wall. */
  turnTo(u: number, v: number) {
    const facing = facingAngles(u, v);
    this.followSeconds = FACE_SEAT_S;
    this.targetYaw = this.yaw + deltaAngle(this.yaw, facing.yaw);
    this.targetPitch = facing.pitch;
  }

  /** Turns the bowl straight to a point on its outer wall, without easing. */
  face(u: number, v: number) {
    const facing = facingAngles(u, v);
    this.yaw = this.targetYaw = this.yaw + deltaAngle(this.yaw, facing.yaw);
    this.pitch = this.targetPitch = facing.pitch;
  }

  /** Eases everything along and draws, if anything on screen would change. Returns whether it drew. */
  render(deltaTime: number) {
    const follow = damp(this.followSeconds, deltaTime);
    this.yaw += (this.targetYaw - this.yaw) * follow;
    this.pitch += (this.targetPitch - this.pitch) * follow;
    this.pivot.rotation.set(this.pitch, this.yaw, 0, 'XYZ');

    this.lidAmount += (this.lidTarget - this.lidAmount) * damp(LID_S, deltaTime);
    this.lid.visible = this.lidAmount > 0.002;
    this.lid.position.y = LID_OPEN_Y_MM + (LID_CLOSED_Y_MM - LID_OPEN_Y_MM) * clamp01(this.lidAmount);

    const moved =
      this.updateShards(deltaTime) ||
      Math.abs(this.targetYaw - this.yaw) > SETTLED_RADIANS ||
      Math.abs(this.targetPitch - this.pitch) > SETTLED_RADIANS ||
      Math.abs(this.lidTarget - this.lidAmount) > SETTLED_LID;
    const painted = this.uploadMasks();
    if (!moved && !painted && !this.stale) return false;

    // Paint casts no shadow, so a stroke on a still bowl keeps the shadow map it has.
    if (moved || this.stale) this.renderer.shadowMap.needsUpdate = true;
    this.stale = false;
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  /** Sends only the texels that changed: a full mask is half a megabyte, and a stroke touches a few hundred bytes. */
  private uploadMasks() {
    let painted = false;
    for (const [mask, texture] of this.liveMasks) {
      const rect = mask.takeDirty();
      if (!rect) continue;
      painted = true;
      this.uploadRegion.min.set(rect.x, rect.y);
      this.uploadRegion.max.set(rect.x + rect.width, rect.y + rect.height);
      this.uploadPosition.set(rect.x, rect.y);
      this.renderer.copyTextureToTexture(texture, texture, this.uploadRegion, this.uploadPosition);
    }
    return painted;
  }

  /** Returns whether any shard is still on its way. */
  private updateShards(deltaTime: number) {
    const follow = damp(SHARD_FOLLOW_S, deltaTime);
    const settle = damp(SHARD_RETURN_S, deltaTime);
    let moving = false;
    this.shardMeshes.forEach((mesh, i) => {
      const held = i === this.heldIndex;
      const seated = !held && mesh.parent === this.bowl;
      const position = held ? this.heldPosition : seated ? this.seats[i] : this.trayPoses[i].position;
      const rotation = held ? this.heldRotation : seated ? IDENTITY : this.trayPoses[i].rotation;
      const rate = held || seated ? follow : settle;

      moving ||= mesh.position.distanceToSquared(position) > SETTLED_MM_SQUARED || mesh.quaternion.angleTo(rotation) > SETTLED_RADIANS;
      mesh.position.lerp(position, rate);
      mesh.quaternion.slerp(rotation, rate);
    });
    return moving;
  }

  private placeShardsInTray() {
    this.shardMeshes.forEach((mesh, i) => {
      this.scene.add(mesh);
      mesh.position.copy(this.trayPoses[i].position);
      mesh.quaternion.copy(this.trayPoses[i].rotation);
    });
  }

  private ceramicMaterial() {
    const { width, height } = this.repair.glue;
    const seam = rasterizeBands(width, height, SHARDS.map((s) => s.crack), SEAM_LINE_HALF_WIDTH_MM);
    const seamData = seam.data.map((region) => (region === 0 ? 0 : 255));

    const { glue, lacquer, gold, sheen } = this.repair;
    const [uGlue, uLacquer, uGold, uSheen] = [glue, lacquer, gold, sheen].map((mask) => {
      const texture = maskTexture(mask.data, mask.width, mask.height);
      this.liveMasks.push([mask, texture]);
      return { value: texture };
    });
    const uSeam = { value: maskTexture(seamData, width, height) };

    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uGlue, uLacquer, uGold, uSheen, uSeam });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMaskUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAGMENT_ROUGHNESS}`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${FRAGMENT_METALNESS}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAGMENT_EMISSIVE}`);
    };
    return material;
  }

  private aim(clientX: number, clientY: number) {
    this.pointer.set((clientX / this.width) * 2 - 1, 1 - (clientY / this.height) * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private toClient(world: Vector3) {
    const ndc = world.clone().project(this.camera);
    return { x: ((ndc.x + 1) / 2) * this.width, y: ((1 - ndc.y) / 2) * this.height };
  }

  private resize() {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.renderer.setSize(this.width, this.height);
    this.stale = true;

    const aspect = this.width / this.height;
    const visibleHeight = Math.max(FRAME_HEIGHT_MM, FRAME_WIDTH_MM / aspect) / this.zoom;
    this.camera.aspect = aspect;
    this.camera.position.set(0, 0, visibleHeight / (2 * Math.tan((FIELD_OF_VIEW_DEG * Math.PI) / 360)));
    this.camera.setViewOffset(this.width, this.height, 0, this.height * LENS_SHIFT, this.width, this.height);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    // The waiting shards are placed by screen position, so a phone in either orientation has them under the bowl.
    this.trayPoses.forEach((pose, i) => {
      const direction = new Vector3(TRAY_X[i], TRAY_Y, 0).unproject(this.camera).sub(this.camera.position);
      pose.position.copy(this.camera.position).addScaledVector(direction, -this.camera.position.z / direction.z);
    });
  }
}

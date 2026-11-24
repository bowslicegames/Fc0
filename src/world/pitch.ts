import * as THREE from 'three';
import {
  PITCH,
  makeGrassTexture,
  makeMarkingsTexture,
  makeMowTexture,
  makeNetTexture,
  rng,
} from '../textures';

const HALF_L = PITCH.length / 2;
const HALF_W = PITCH.width / 2;

function buildGoal(sign: number) {
  const goal = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({
    color: '#f3f8fb',
    roughness: 0.3,
    metalness: 0.4,
    envMapIntensity: 1.1,
  });
  const radius = 0.062;
  const height = PITCH.goalHeight;
  const halfGoal = PITCH.goalWidth / 2;
  const goalLine = HALF_L * sign;
  const depth = PITCH.goalDepth;
  const back = goalLine + depth * sign;

  const addPost = (z: number) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14), postMat);
    post.position.set(goalLine, height / 2, z);
    post.castShadow = true;
    goal.add(post);
    // back stanchion
    const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.75, radius * 0.75, height * 0.72, 10), postMat);
    stanchion.position.set(back, height * 0.36, z);
    goal.add(stanchion);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, depth, 8), postMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set((goalLine + back) / 2, height * 0.72, z);
    goal.add(rail);
  };

  addPost(-halfGoal);
  addPost(halfGoal);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, PITCH.goalWidth + radius * 2, 14), postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(goalLine, height, 0);
  bar.castShadow = true;
  goal.add(bar);

  const netTex = makeNetTexture();
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex,
    color: '#eaf6ff',
    transparent: true,
    opacity: 0.55,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const netPlane = (w: number, h: number, reps: [number, number]) => {
    const tex = netTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(reps[0], reps[1]);
    const mat = netMat.clone();
    mat.map = tex;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  };

  // back net
  const backNet = netPlane(PITCH.goalWidth, height, [12, 4]);
  backNet.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
  backNet.position.set(back, height / 2, 0);
  goal.add(backNet);

  // roof net
  const roofNet = netPlane(PITCH.goalWidth, depth, [12, 4]);
  roofNet.rotation.x = -Math.PI / 2;
  roofNet.position.set((goalLine + back) / 2, height, 0);
  goal.add(roofNet);

  // side nets
  for (const sz of [-1, 1]) {
    const side = netPlane(depth, height, [4, 4]);
    side.rotation.y = 0;
    side.position.set((goalLine + back) / 2, height / 2, sz * halfGoal);
    goal.add(side);
  }

  return goal;
}

function buildCornerFlag(x: number, z: number) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#f2f6f8', roughness: 0.4, metalness: 0.3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.55, 8), poleMat);
  pole.position.y = 0.775;
  pole.castShadow = true;
  g.add(pole);

  const flagMat = new THREE.MeshStandardMaterial({
    color: '#d8ff3e',
    roughness: 0.8,
    side: THREE.DoubleSide,
    emissive: '#3c4a08',
  });
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0.42, -0.14, 0, 0, -0.32, 0], 3),
  );
  flagGeo.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0, 1.5, 0);
  g.add(flag);
  g.position.set(x, 0, z);
  return g;
}

export function buildPitch(scene: THREE.Scene, bladeCount = 32000) {
  const root = new THREE.Group();

  // Surround / run-off area
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 150),
    new THREE.MeshStandardMaterial({ color: '#1d3a22', roughness: 1 }),
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  surround.receiveShadow = true;
  root.add(surround);

  // Grass
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 112),
    new THREE.MeshStandardMaterial({
      map: makeGrassTexture(),
      roughness: 0.94,
      metalness: 0,
    }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  root.add(grass);

  // Mowing bands
  const mow = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length + 8, PITCH.width + 6),
    new THREE.MeshBasicMaterial({
      map: makeMowTexture(),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
  mow.rotation.x = -Math.PI / 2;
  mow.position.y = 0.004;
  root.add(mow);

  // Markings
  const markings = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length, PITCH.width),
    new THREE.MeshStandardMaterial({
      map: makeMarkingsTexture(),
      transparent: true,
      roughness: 0.85,
      metalness: 0,
      depthWrite: false,
    }),
  );
  markings.rotation.x = -Math.PI / 2;
  markings.position.y = 0.009;
  markings.receiveShadow = true;
  root.add(markings);

  // Individual grass blades for close-up detail
  const bladeGroup = new THREE.Group();
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.013, 0, 0, 0.013, 0, 0, 0.022, 0.1, 0.012, -0.013, 0, 0, 0.022, 0.1, 0.012, 0.002, 0.11, -0.02],
      3,
    ),
  );
  bladeGeo.computeVertexNormals();

  const bladeMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const count = bladeCount;
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, count);
  blades.receiveShadow = true;
  blades.castShadow = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const rand = rng(4242);
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * (PITCH.length + 12);
    const z = (rand() - 0.5) * (PITCH.width + 8);
    dummy.position.set(x, 0, z);
    dummy.rotation.y = rand() * Math.PI;
    const s = 0.55 + rand() * 0.5;
    dummy.scale.set(s, 0.45 + rand() * 0.55, s);
    dummy.updateMatrix();
    blades.setMatrixAt(i, dummy.matrix);
    const g = 0.2 + rand() * 0.16;
    color.setRGB(0.055 + rand() * 0.045, g, 0.05 + rand() * 0.04);
    blades.setColorAt(i, color);
  }
  blades.instanceMatrix.needsUpdate = true;
  if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
  bladeGroup.add(blades);
  root.add(bladeGroup);

  // Goals + corner flags
  root.add(buildGoal(1));
  root.add(buildGoal(-1));
  root.add(buildCornerFlag(-HALF_L, -HALF_W));
  root.add(buildCornerFlag(HALF_L, -HALF_W));
  root.add(buildCornerFlag(HALF_L, HALF_W));
  root.add(buildCornerFlag(-HALF_L, HALF_W));

  scene.add(root);
  return root;
}

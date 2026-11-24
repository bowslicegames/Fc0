import * as THREE from 'three';
import { makeAdTexture, makeCloudTexture, makeGlowTexture, rng } from '../textures';

const CROWD_COLORS = [
  '#d8ff3e', '#f4f8fb', '#1b3550', '#e8433f', '#f2b53c', '#2ea0c9',
  '#7a4fd6', '#22262b', '#9aa7b4', '#ff7a3d', '#38c98c', '#d9d2c4',
];

/* ------------------------------- sky ------------------------------- */

function buildSky(scene: THREE.Scene) {
  const skyGeo = new THREE.SphereGeometry(600, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color('#2f6ea8') },
      midColor: { value: new THREE.Color('#8fc3e8') },
      bottomColor: { value: new THREE.Color('#e8f2f2') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorld;
      void main() {
        float h = clamp(normalize(vWorld).y, -0.1, 1.0);
        vec3 col = mix(bottomColor, midColor, smoothstep(-0.05, 0.28, h));
        col = mix(col, topColor, smoothstep(0.25, 0.9, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // clouds
  const cloudTex = makeCloudTexture();
  const rand = rng(88);
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.5 + rand() * 0.35,
      depthWrite: false,
      depthTest: false,
      color: '#ffffff',
      fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    const a = (i / 14) * Math.PI * 2 + rand() * 0.4;
    const radius = 260 + rand() * 160;
    sprite.position.set(Math.cos(a) * radius, 90 + rand() * 90, Math.sin(a) * radius);
    const s = 120 + rand() * 140;
    sprite.scale.set(s, s * 0.45, 1);
    scene.add(sprite);
  }

  scene.fog = new THREE.Fog('#b9d3e2', 190, 520);
  scene.background = new THREE.Color('#a8cce4');
}

/* ------------------------------ stands ------------------------------ */

function buildStand(
  scene: THREE.Scene,
  length: number,
  position: THREE.Vector3,
  rotY: number,
) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = rotY;

  const rows = 15;
  const rowDepth = 0.84;
  const rowRise = 0.42;
  const rand = rng(Math.round(position.x * 13 + position.z * 7 + 100));

  const stepMat = new THREE.MeshStandardMaterial({ color: '#2b3440', roughness: 0.92 });
  const stepMatAlt = new THREE.MeshStandardMaterial({ color: '#232b35', roughness: 0.92 });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#242c37', roughness: 0.95 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#31465a', roughness: 0.8 });

  // front hoarding wall
  const front = new THREE.Mesh(new THREE.BoxGeometry(length, 1.35, 0.35), wallMat);
  front.position.set(0, 0.675, 0.35);
  front.castShadow = true;
  front.receiveShadow = true;
  group.add(front);

  const crowdGeo = new THREE.BoxGeometry(0.26, 0.38, 0.26);
  const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const capacity = Math.floor((length / 0.72) * rows) + 8;
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, capacity);
  crowd.castShadow = false;
  crowd.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let idx = 0;

  for (let r = 0; r < rows; r++) {
    const y = 0.55 + r * rowRise;
    const z = 0.6 + r * rowDepth;

    const step = new THREE.Mesh(
      new THREE.BoxGeometry(length, rowRise, rowDepth),
      r % 2 === 0 ? stepMat : stepMatAlt,
    );
    step.position.set(0, y - rowRise / 2, z + rowDepth / 2);
    step.receiveShadow = true;
    group.add(step);

    // seat backs
    const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.4, 0.07), seatMat, Math.floor(length / 0.72) + 2);
    let bi = 0;
    for (let x = -length / 2 + 0.5; x < length / 2 - 0.4; x += 0.72) {
      dummy.position.set(x, y + 0.2, z + 0.72);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      backs.setMatrixAt(bi++, dummy.matrix);
    }
    backs.count = bi;
    backs.instanceMatrix.needsUpdate = true;
    backs.receiveShadow = true;
    group.add(backs);

    for (let x = -length / 2 + 0.55; x < length / 2 - 0.5; x += 0.72) {
      if (rand() < 0.3) continue;
      if (idx >= capacity) break;
      dummy.position.set(x + (rand() - 0.5) * 0.18, y + 0.22, z + 0.34 + (rand() - 0.5) * 0.18);
      dummy.rotation.set(0, (rand() - 0.5) * 0.5, 0);
      dummy.scale.set(0.85 + rand() * 0.3, 0.9 + rand() * 0.25, 0.85 + rand() * 0.3);
      dummy.updateMatrix();
      crowd.setMatrixAt(idx, dummy.matrix);
      col.set(CROWD_COLORS[Math.floor(rand() * CROWD_COLORS.length)]);
      col.offsetHSL(0, 0, (rand() - 0.5) * 0.08);
      crowd.setColorAt(idx, col);
      idx++;
    }
  }

  crowd.count = idx;
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd);

  // back wall and roof
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 8, 0.6), wallMat);
  backWall.position.set(0, 4, rows * rowDepth + 1.2);
  backWall.receiveShadow = true;
  group.add(backWall);

  const roofMat = new THREE.MeshStandardMaterial({ color: '#59646f', roughness: 0.7, metalness: 0.25 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.3, 6.2), roofMat);
  roof.position.set(0, 9.8, rows * rowDepth - 1.6);
  roof.castShadow = true;
  group.add(roof);

  // bright fascia along the front edge of the canopy
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.55, 0.32), new THREE.MeshStandardMaterial({ color: '#cdd9e2', roughness: 0.55, metalness: 0.2 }));
  fascia.position.set(0, 9.5, rows * rowDepth - 4.7);
  group.add(fascia);

  // roof supports
  const beamMat = new THREE.MeshStandardMaterial({ color: '#3a4656', roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i <= 6; i++) {
    const x = -length / 2 + (length / 6) * i;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9.6, 8), beamMat);
    beam.position.set(x, 4.8, rows * rowDepth - 1.4);
    group.add(beam);
  }

  scene.add(group);
  return group;
}

/* ------------------------------ ad boards ------------------------------ */

function buildBoards(scene: THREE.Scene) {
  const adTex = makeAdTexture();
  const adMat = new THREE.MeshStandardMaterial({
    map: adTex,
    roughness: 0.55,
    metalness: 0.05,
    emissive: '#ffffff',
    emissiveMap: adTex,
    emissiveIntensity: 0.13,
  });
  const backMat = new THREE.MeshStandardMaterial({ color: '#10161d', roughness: 0.9 });

  const makeBoard = (length: number, x: number, z: number, rotY: number) => {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(length, 1.1, 0.12), [
      backMat, backMat, backMat, backMat, adMat, backMat,
    ]);
    panel.position.y = 0.55;
    panel.castShadow = true;
    panel.receiveShadow = true;
    g.add(panel);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, 0.24), backMat);
    frame.position.y = 1.12;
    g.add(frame);

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  };

  makeBoard(104, 0, 35.9, Math.PI);
  makeBoard(104, 0, -35.9, 0);
  makeBoard(64, 55.4, 0, -Math.PI / 2);
  makeBoard(64, -55.4, 0, Math.PI / 2);
}

/* ------------------------------ floodlights ------------------------------ */

function buildFloodlights(scene: THREE.Scene) {
  const mastMat = new THREE.MeshStandardMaterial({ color: '#4b5666', roughness: 0.5, metalness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#242c36', roughness: 0.6, metalness: 0.4 });
  const panelMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#fffbe8',
    emissiveIntensity: 4.5,
    roughness: 0.2,
  });
  const glowTex = makeGlowTexture();

  const positions: [number, number][] = [
    [-64, -46],
    [64, -46],
    [-64, 46],
    [64, 46],
  ];

  for (const [x, z] of positions) {
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 30, 10), mastMat);
    mast.position.y = 15;
    mast.castShadow = true;
    g.add(mast);

    const head = new THREE.Group();
    head.position.y = 30.4;
    // tilt the head toward the pitch
    head.rotation.x = 0.22;
    g.add(head);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 0.7), headMat);
    housing.castShadow = true;
    head.add(housing);

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), panelMat);
        panel.position.set(-3.35 + i * 2.25, -0.6 + j * 1.25, 0.38);
        head.add(panel);
      }
    }

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: '#fffdf0',
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glow.scale.set(16, 9, 1);
    glow.position.set(0, 0, 0.8);
    head.add(glow);

    // mast stays vertical, light head faces the centre of the pitch
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z);
    scene.add(g);
  }
}

/* ------------------------------ lighting ------------------------------ */

export function setupLighting(scene: THREE.Scene, shadowSize = 2048) {
  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x2b4020, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4dd, 2.9);
  sun.position.set(46, 66, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -64;
  sun.shadow.camera.right = 64;
  sun.shadow.camera.top = 52;
  sun.shadow.camera.bottom = -52;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 190;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.018;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x9fc6ff, 0.55);
  fill.position.set(-55, 38, -30);
  scene.add(fill);

  const warm = new THREE.DirectionalLight(0xffd9a0, 0.22);
  warm.position.set(-20, 12, 60);
  scene.add(warm);
}

export function buildStadium(scene: THREE.Scene, shadowSize = 2048) {
  buildSky(scene);
  setupLighting(scene, shadowSize);

  // local +Z points away from the pitch for every stand
  buildStand(scene, 102, new THREE.Vector3(0, 0, -37), Math.PI);
  buildStand(scene, 102, new THREE.Vector3(0, 0, 37), 0);
  buildStand(scene, 78, new THREE.Vector3(57.5, 0, 0), Math.PI / 2);
  buildStand(scene, 78, new THREE.Vector3(-57.5, 0, 0), -Math.PI / 2);

  buildBoards(scene);
  buildFloodlights(scene);
}

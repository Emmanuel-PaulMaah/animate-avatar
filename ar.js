import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.161/examples/jsm/loaders/GLTFLoader.js";
import Peer from "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";

let renderer, scene, camera, reticle, xrRefSpace, hitSource;
let cube;
let conn = null;

const roomInput = document.getElementById("room");
const btnConnect = document.getElementById("connect");
const btnEnterAR = document.getElementById("enterAR");

// --- PeerJS (receiver) ---
const peer = new Peer(undefined, { host: "peerjs.com", port: 443, secure: true }); // public broker
btnConnect.onclick = () => {
  const room = (roomInput.value || "").trim();
  if (!room) return alert("enter room id");
  // as receiver, we call the tracker peer (which uses id = room+"-tracker")
  const targetId = room + "-tracker";
  conn = peer.connect(targetId, { reliable: true });
  conn.on("open", () => console.log("connected to", targetId));
  conn.on("data", onPoseData);
};
function onPoseData(msg) {
  // Expect { yaw, pitch, roll } in radians for this smoke test
  if (cube && msg && typeof msg.yaw === "number") {
    cube.rotation.set(msg.pitch || 0, msg.yaw || 0, msg.roll || 0);
  }
}

// --- Three + WebXR ---
init();
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff99 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // placeholder object we’ll drive from PC (we’ll swap to your avatar later)
  const geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.6 });
  cube = new THREE.Mesh(geo, mat);
  cube.visible = false; // becomes visible when placed

  btnEnterAR.onclick = startAR;
  addEventListener("resize", () => renderer.setSize(innerWidth, innerHeight));
}

async function startAR() {
  if (!navigator.xr) return alert("webxr not supported");
  const ok = await navigator.xr.isSessionSupported("immersive-ar");
  if (!ok) return alert("immersive-ar not supported");
  const session = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test", "local-floor"]
  });
  renderer.xr.setReferenceSpaceType("local-floor");
  await renderer.xr.setSession(session);

  const viewerSpace = await session.requestReferenceSpace("viewer");
  hitSource = await session.requestHitTestSource({ space: viewerSpace });

  const controller = renderer.xr.getController(0);
  controller.addEventListener("select", () => {
    if (reticle.visible) {
      if (!cube.parent) scene.add(cube);
      cube.position.setFromMatrixPosition(reticle.matrix);
      cube.quaternion.setFromRotationMatrix(reticle.matrix);
      cube.visible = true;
    }
  });
  scene.add(controller);

  renderer.setAnimationLoop(onXRFrame);
}

function onXRFrame(t, frame) {
  const refSpace = renderer.xr.getReferenceSpace();

  if (hitSource) {
    const hits = frame.getHitTestResults(hitSource);
    if (hits.length) {
      const hit = hits[0].getPose(refSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(hit.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
}

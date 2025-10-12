import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161/build/three.module.js";
import Peer from "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";

let renderer, scene, camera, reticle, hitSource, xrViewerSpace;
let cube;
let conn = null;
let lastDataAt = 0;
let placed = false;
let fpsSamples = [];

const el = (id)=>document.getElementById(id);
const P = {
  xrSupport: el("xrSupport"),
  arSupport: el("arSupport"),
  sessionState: el("sessionState"),
  hitState: el("hitState"),
  connState: el("connState"),
  placeState: el("placeState"),
  dataState: el("dataState"),
  fps: el("fps"),
  log: el("log"),
  logWrap: el("logWrap"),
  toast: el("toast"),
  btnEnter: el("enterAR"),
  btnConnect: el("connect"),
  room: el("room"),
  debugToggle: el("debugToggle"),
};

function setPill(el, text, mode){
  el.textContent = text;
  el.classList.remove("ok","warn","err");
  if (mode) el.classList.add(mode);
}
function log(msg){
  const t = new Date().toLocaleTimeString();
  P.log.textContent = `[${t}] ${msg}\n` + P.log.textContent;
}
function toast(msg, ms=1800){
  P.toast.textContent = msg;
  P.toast.style.display = "block";
  setTimeout(()=> P.toast.style.display="none", ms);
}
P.debugToggle.onclick = ()=>{
  P.logWrap.style.display = P.logWrap.style.display === "none" ? "block" : "none";
};

initPeer();
initThree();
probeXR();

function initPeer(){
  // receiver creates its own random id (PeerJS cloud). We will connect out to "{room}-tracker"
  const peer = new Peer(undefined, { host: "peerjs.com", port: 443, secure: true });
  peer.on("open", id => { log(`peer ready: ${id}`); });
  peer.on("error", e => { log(`peer error: ${e}`); setPill(P.connState, "peer: error", "err"); toast("peer error (see log)"); });

  P.btnConnect.onclick = () => {
    const room = (P.room.value || "").trim();
    if (!room){ toast("enter room id"); return; }
    const target = room + "-tracker";
    log(`connecting to ${target}...`);
    setPill(P.connState, "peer: connecting", "warn");
    conn = peer.connect(target, { reliable: true });
    conn.on("open", () => { log("peer connected"); setPill(P.connState, "peer: connected", "ok"); toast("peer connected"); });
    conn.on("close", () => { log("peer closed"); setPill(P.connState, "peer: closed", "warn"); });
    conn.on("error", (e) => { log(`conn error: ${e}`); setPill(P.connState, "peer: error", "err"); });
    conn.on("data", onPoseData);
  };
}

function onPoseData(msg){
  lastDataAt = performance.now();
  setPill(P.dataState, "data: live", "ok");
  // Expect { yaw, pitch, roll } in radians (smoke test)
  if (cube && typeof msg?.yaw === "number"){
    cube.rotation.set(msg.pitch||0, msg.yaw||0, msg.roll||0);
  }
}

function initThree(){
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
    new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff99 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const geo = new THREE.BoxGeometry(0.25,0.25,0.25);
  const mat = new THREE.MeshStandardMaterial({ metalness:0.2, roughness:0.6 });
  cube = new THREE.Mesh(geo, mat);
  cube.visible = false;

  window.addEventListener("resize", ()=>renderer.setSize(innerWidth, innerHeight));
  P.btnEnter.onclick = startAR;

  // simple FPS estimator
  let last = performance.now();
  function tick(){
    const now = performance.now();
    const dt = now - last; last = now;
    const fps = 1000/dt;
    fpsSamples.push(fps); if (fpsSamples.length>20) fpsSamples.shift();
    const avg = Math.round(fpsSamples.reduce((a,b)=>a+b,0)/fpsSamples.length);
    setPill(P.fps, `fps: ${isFinite(avg)?avg:"--"}`);
    // data freshness indicator (goes warn if stale 2s)
    if (performance.now() - lastDataAt > 2000) setPill(P.dataState, "data: stale", "warn");
    requestAnimationFrame(tick);
  }
  tick();
}

async function probeXR(){
  if (!("xr" in navigator)){
    setPill(P.xrSupport, "xr: no", "err");
    log("navigator.xr not present. use Android Chrome (ARCore) over HTTPS.");
    toast("no WebXR (use Android Chrome)");
    return;
  }
  setPill(P.xrSupport, "xr: yes", "ok");
  try{
    const ar = await navigator.xr.isSessionSupported("immersive-ar");
    setPill(P.arSupport, `immersive-ar: ${ar?"yes":"no"}`, ar?"ok":"err");
    if (!ar) log("immersive-ar not supported (device/browser not ARCore-ready?)");
  }catch(e){
    setPill(P.arSupport, "immersive-ar: error", "err");
    log("isSessionSupported error: " + e);
  }
}

async function startAR(){
  if (!navigator.xr){ toast("no WebXR"); return; }
  try{
    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    if (!supported){ toast("immersive-ar not supported"); setPill(P.sessionState,"session: unsupported","err"); return; }

    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test","local-floor"]
    });

    setPill(P.sessionState, "session: starting", "warn");
    renderer.xr.setReferenceSpaceType("local-floor");
    await renderer.xr.setSession(session);

    xrViewerSpace = await session.requestReferenceSpace("viewer");
    hitSource = await session.requestHitTestSource({ space: xrViewerSpace });
    setPill(P.hitState, "hit-test: source ok", "ok");

    const controller = renderer.xr.getController(0);
    controller.addEventListener("select", () => {
      if (reticle.visible){
        if (!cube.parent) scene.add(cube);
        cube.position.setFromMatrixPosition(reticle.matrix);
        cube.quaternion.setFromRotationMatrix(reticle.matrix);
        cube.visible = true;
        placed = true;
        setPill(P.placeState, "placed: yes", "ok");
        toast("object placed");
      }
    });
    scene.add(controller);

    session.addEventListener("end", ()=>{ setPill(P.sessionState, "session: ended", "warn"); setPill(P.hitState,"hit-test: none"); placed=false; setPill(P.placeState,"placed: no"); });
    setPill(P.sessionState, "session: running", "ok");

    renderer.setAnimationLoop((t, frame)=>{
      const refSpace = renderer.xr.getReferenceSpace();
      if (hitSource && frame){
        const hits = frame.getHitTestResults(hitSource);
        if (hits.length){
          const hit = hits[0].getPose(refSpace);
          reticle.visible = true;
          reticle.matrix.fromArray(hit.transform.matrix);
          setPill(P.hitState, "hit-test: tracking", "ok");
        }else{
          reticle.visible = false;
          setPill(P.hitState, "hit-test: no surface", "warn");
        }
      }
      renderer.render(scene, camera);
    });
    toast("move phone to find a surface");
    log("AR session started");
  }catch(e){
    // granular error mapping
    const msg = String(e?.name || e?.message || e);
    log("requestSession error: " + msg);
    if (msg.includes("NotAllowedError")){
      toast("camera permission denied"); setPill(P.sessionState,"session: blocked","err");
    }else if (msg.includes("NotSupportedError")){
      toast("immersive-ar not supported"); setPill(P.sessionState,"session: unsupported","err");
    }else{
      toast("failed to start AR (see log)"); setPill(P.sessionState,"session: error","err");
    }
  }
}

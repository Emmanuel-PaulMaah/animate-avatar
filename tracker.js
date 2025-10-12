// PeerJS is now available as global "Peer"
const statusEl = document.getElementById("status");
const yawEl = document.getElementById("yaw");
const pitchEl = document.getElementById("pitch");
const rollEl = document.getElementById("roll");
const roomEl = document.getElementById("room");
const btnHost = document.getElementById("host");

let peer = null;
let conn = null;

btnHost.onclick = () => {
  const room = (roomEl.value || "").trim();
  if (!room) return alert("enter room id first");
  const myId = room + "-tracker";

  peer = new Peer(myId, { host: "peerjs.com", port: 443, secure: true });
  peer.on("open", id => setStatus(`hosting as "${id}" — share room id "${room}" with phone`));
  peer.on("connection", c => {
    conn = c;
    setStatus(`phone connected: ${c.peer}`);
    conn.on("close", () => setStatus("phone disconnected"));
  });
  peer.on("error", e => setStatus("peer error: " + e));
};

function setStatus(s){ statusEl.textContent = s; }

function sendPose() {
  if (!conn || conn.open !== true) return;
  const yaw = parseFloat(yawEl.value);
  const pitch = parseFloat(pitchEl.value);
  const roll = parseFloat(rollEl.value);
  conn.send({ yaw, pitch, roll, t: performance.now() });
}

[yawEl, pitchEl, rollEl].forEach(el => el.addEventListener("input", sendPose));

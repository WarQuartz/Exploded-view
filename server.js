const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const SCENARIOS = JSON.parse(fs.readFileSync(path.join(ROOT, "scenarios.json"), "utf8"));
const rooms = new Map();

function send(res, status, data, type="application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": type === "application/json" ? "no-store" : "public, max-age=300"
  });
  res.end(type === "application/json" ? JSON.stringify(data) : data);
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
  });
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let tries=0; tries<50; tries++) {
    let code = "";
    for (let i=0;i<5;i++) code += chars[Math.floor(Math.random()*chars.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Unable to create room code");
}
function token() { return crypto.randomBytes(18).toString("hex"); }
function scenarioFor(room) { return SCENARIOS.find(s => s.id === room.scenarioId); }
function pickScenario(deck, excludeId=null) {
  let pool = SCENARIOS.filter(s => deck === "ALL" || s.category === deck);
  if (excludeId && pool.length > 1) pool = pool.filter(s => s.id !== excludeId);
  return pool[Math.floor(Math.random()*pool.length)];
}
function playerIndex(room, playerToken) {
  return room.players.findIndex(p => p && p.token === playerToken);
}
function both(room, field) {
  return room.players.length === 2 && room.players.every(p => p && p[field] !== null && p[field] !== undefined);
}
function roomView(room, playerToken) {
  const me = playerIndex(room, playerToken);
  if (me < 0) return null;
  const s = scenarioFor(room);
  const phase = room.phase;
  const reveal = phase === "reveal";
  return {
    code: room.code,
    phase,
    deck: room.deck,
    round: room.round,
    me: me + 1,
    players: room.players.map(p => p ? ({
      joined: true,
      name: p.name,
      lockedInitial: p.initial !== null,
      lockedAfter: p.after !== null,
      ...(reveal ? {initial: p.initial, after: p.after} : {})
    }) : ({joined:false})),
    scenario: s ? {
      id: s.id, title: s.title, category: s.category, level: s.level,
      setup: s.setup, prompt: s.prompt, choices: s.choices,
      complication: (phase === "complication" || phase === "after" || reveal) ? s.complication : null,
      ...(reveal ? {dimensions:s.dimensions, notes:s.notes} : {})
    } : null
  };
}
function cleanup() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > 1000*60*60*8) rooms.delete(code);
  }
}
setInterval(cleanup, 1000*60*20).unref();

async function api(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const body = await parseBody(req);
    const deck = body.deck || "ALL";
    const first = pickScenario(deck);
    const room = {
      code: makeCode(),
      deck,
      phase: "lobby",
      round: 1,
      scenarioId: first.id,
      players: [{
        token: token(),
        name: String(body.name || "Player 1").slice(0,30),
        initial: null, after: null
      }],
      createdAt: Date.now(), updatedAt: Date.now()
    };
    rooms.set(room.code, room);
    return send(res, 201, {code:room.code, playerToken:room.players[0].token});
  }

  const m = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{5})(?:\/(join|answer|next))?$/);
  if (!m) return false;
  const code = m[1];
  const action = m[2];
  const room = rooms.get(code);
  if (!room) return send(res, 404, {error:"ROOM_NOT_FOUND"});

  if (req.method === "POST" && action === "join") {
    if (room.players.length >= 2) return send(res, 409, {error:"ROOM_FULL"});
    const body = await parseBody(req);
    const p = {token:token(), name:String(body.name || "Player 2").slice(0,30), initial:null, after:null};
    room.players.push(p);
    room.phase = "initial";
    room.updatedAt = Date.now();
    return send(res, 201, {code, playerToken:p.token});
  }

  const playerToken = req.headers["x-player-token"] || url.searchParams.get("token");
  const pi = playerIndex(room, playerToken);
  if (pi < 0) return send(res, 401, {error:"INVALID_PLAYER"});

  if (req.method === "GET" && !action) {
    return send(res, 200, roomView(room, playerToken));
  }

  if (req.method === "POST" && action === "answer") {
    const body = await parseBody(req);
    const s = scenarioFor(room);
    const choice = Number(body.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= s.choices.length)
      return send(res, 400, {error:"INVALID_CHOICE"});

    if (room.phase === "initial") {
      room.players[pi].initial = choice;
      if (both(room, "initial")) room.phase = "complication";
    } else if (room.phase === "complication" || room.phase === "after") {
      room.phase = "after";
      room.players[pi].after = choice;
      if (both(room, "after")) room.phase = "reveal";
    } else {
      return send(res, 409, {error:"NOT_ACCEPTING_ANSWER", phase:room.phase});
    }
    room.updatedAt = Date.now();
    return send(res, 200, roomView(room, playerToken));
  }

  if (req.method === "POST" && action === "next") {
    if (room.phase !== "reveal") return send(res, 409, {error:"ROUND_NOT_FINISHED"});
    if (pi !== 0) return send(res, 403, {error:"HOST_ONLY"});
    const next = pickScenario(room.deck, room.scenarioId);
    room.scenarioId = next.id;
    room.round += 1;
    room.phase = "initial";
    room.players.forEach(p => {p.initial=null; p.after=null;});
    room.updatedAt = Date.now();
    return send(res, 200, roomView(room, playerToken));
  }

  return false;
}

function serveStatic(req, res, url) {
  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    const ext = path.extname(file);
    const types = {".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".svg":"image/svg+xml"};
    send(res, 200, data, types[ext] || "application/octet-stream");
  });
}

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await api(req,res,url);
      if (handled !== false) return;
      return send(res,404,{error:"NOT_FOUND"});
    }
    return serveStatic(req,res,url);
  } catch (e) {
    console.error(e);
    return send(res,500,{error:"SERVER_ERROR"});
  }
});
server.listen(PORT, () => console.log(`Exploded View listening on ${PORT}`));

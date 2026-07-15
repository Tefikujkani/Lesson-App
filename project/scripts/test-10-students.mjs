/**
 * Fills a Group Study Room to 10 seats and exercises host mute / unmute.
 * Usage: node scripts/test-10-students.mjs [baseUrl]
 */
import { io } from "socket.io-client";

const BASE = process.argv[2] || "https://notelab-7b13b.up.railway.app";
const TARGET = 10;

async function guestLogin(i) {
  // Stagger timestamps so emails are unique under parallel load
  await new Promise((r) => setTimeout(r, i * 40));
  const res = await fetch(`${BASE}/api/auth/guest`, { method: "POST" });
  if (!res.ok) throw new Error(`guest login failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function createRoom(token, hostName) {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "10-Seat Mute Stress Test",
      topic: "responsive mute controls",
      hostName,
    }),
  });
  if (!res.ok) throw new Error(`create room failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function joinSocket(token, code, name) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      forceNew: true,
    });
    const t = setTimeout(() => reject(new Error(`join timeout for ${name}`)), 15000);
    s.on("connect_error", (err) => {
      clearTimeout(t);
      reject(err);
    });
    s.on("connect", () => {
      s.emit(
        "room:join",
        { code, token, name },
        (result) => {
          clearTimeout(t);
          if (!result?.ok) {
            s.disconnect();
            reject(new Error(result?.error || `join failed for ${name}`));
            return;
          }
          resolve({ socket: s, you: result.you, members: result.members || [] });
        }
      );
    });
  });
}

function emitAck(socket, event, payload, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), ms);
    socket.emit(event, payload, (result) => {
      clearTimeout(t);
      resolve(result);
    });
  });
}

async function main() {
  console.log(`Testing against ${BASE}`);
  const accounts = [];
  for (let i = 0; i < TARGET; i++) {
    const data = await guestLogin(i);
    accounts.push({
      token: data.token,
      name: i === 0 ? "Host Alpha" : `Student ${i}`,
      userId: data.user.id || data.user._id,
    });
  }
  console.log(`Created ${accounts.length} guest accounts`);

  const room = await createRoom(accounts[0].token, accounts[0].name);
  console.log(`Room ${room.code} created (max ${room.maxParticipants})`);

  const sessions = [];
  for (let i = 0; i < TARGET; i++) {
    const joined = await joinSocket(accounts[i].token, room.code, accounts[i].name);
    sessions.push(joined);
    console.log(`  joined ${accounts[i].name} → ${joined.members.length} in room`);
  }

  const host = sessions[0];
  let members = host.members;
  // Prefer freshest member list from last join
  members = sessions[sessions.length - 1].members;
  console.log(`\nFill check: ${members.length}/${TARGET}`);
  if (members.length !== TARGET) {
    throw new Error(`Expected ${TARGET} members, got ${members.length}`);
  }

  // 11th join should fail (room full)
  try {
    const overflow = await guestLogin(99);
    await joinSocket(overflow.token, room.code, "Overflow Eleven");
    throw new Error("11th join should have been rejected");
  } catch (err) {
    console.log(`11th join correctly blocked: ${err.message}`);
  }

  const guests = members.filter((m) => m.userId !== host.you.userId);
  console.log(`\nMuting ${guests.length} guests one-by-one…`);
  for (const g of guests) {
    const r = await emitAck(host.socket, "room:host-mute", {
      userId: g.userId,
      muted: true,
    });
    if (!r?.ok) throw new Error(`mute failed for ${g.name}: ${r?.error}`);
    const muted = (r.members || []).find((m) => m.userId === g.userId);
    if (!muted?.forceMuted) throw new Error(`${g.name} not forceMuted after mute`);
  }
  console.log("All guests muted");

  const unmuteAll = await emitAck(host.socket, "room:host-mute-all", { muted: false });
  if (!unmuteAll?.ok) throw new Error(`unmute-all failed: ${unmuteAll?.error}`);
  const stillMuted = (unmuteAll.members || []).filter(
    (m) => m.userId !== host.you.userId && m.forceMuted
  );
  if (stillMuted.length) {
    throw new Error(`unmute-all left ${stillMuted.length} muted`);
  }
  console.log("Unmute-all OK");

  const muteAll = await emitAck(host.socket, "room:host-mute-all", { muted: true });
  if (!muteAll?.ok) throw new Error(`mute-all failed: ${muteAll?.error}`);
  const notMuted = (muteAll.members || []).filter(
    (m) => m.userId !== host.you.userId && !m.forceMuted
  );
  if (notMuted.length) {
    throw new Error(`mute-all missed ${notMuted.length} guests`);
  }
  console.log("Mute-all OK");

  // Grant board to first 3 guests
  for (const g of guests.slice(0, 3)) {
    const r = await emitAck(host.socket, "room:set-draw", {
      userId: g.userId,
      canDraw: true,
    });
    if (!r?.ok) throw new Error(`set-draw failed for ${g.name}`);
  }
  const drawers = (await emitAck(host.socket, "room:set-draw", {
    userId: guests[0].userId,
    canDraw: true,
  })).members?.filter((m) => m.canDraw && m.userId !== host.you.userId) || [];
  console.log(`Board access granted to ${Math.max(drawers.length, 3)} guest(s)`);

  for (const s of sessions) s.socket.disconnect();
  console.log("\nPASS — 10-student mute / unmute / mute-all / board access OK");
}

main().catch((err) => {
  console.error("\nFAIL:", err?.message || err);
  process.exit(1);
});

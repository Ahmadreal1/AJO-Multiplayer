const assert = require("assert");
const fs = require("fs");

const server = fs.readFileSync("server.js", "utf8");
const html = fs.readFileSync("public/index.html", "utf8");

assert(server.includes('io.to(room.code).emit("roomNotice"'), "Server must broadcast public room notices");
for (const type of ["join", "vote", "reshuffle", "complete"]) {
  assert(server.includes(`"${type}"`), `Missing ${type} room notice type`);
}
assert(server.includes("Math.min(20, OBJECTS.length"), "Server must support 20 players");
assert(html.includes('src="/founder-ahmad.png"'), "Founder photo must be included in the UI");
assert(html.includes('socket.on("roomNotice"'), "Frontend must display public room notices");
assert(html.includes("NOT YET"), "Frontend must show NOT YET state");
assert(!html.includes("EMPTY · NOT AVAILABLE"), "Frontend must not make selected objects unavailable");
assert(fs.existsSync("public/founder-ahmad.png"), "Founder photo asset is missing");

console.log("AJO UI / popup / founder-photo test: PASS");

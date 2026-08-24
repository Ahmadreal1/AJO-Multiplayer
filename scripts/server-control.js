#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const root = path.join(__dirname, "..");
const pidFile = path.join(root, ".ajo-server.pid");
const logFile = path.join(root, "ajo-server.log");
const port = Number(process.env.PORT || 3000);

function readPid() {
  try { return Number(fs.readFileSync(pidFile, "utf8").trim()); } catch { return null; }
}
function isRunning(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function cleanup() { try { fs.unlinkSync(pidFile); } catch {} }

function start() {
  const oldPid = readPid();
  if (isRunning(oldPid)) {
    console.log(`AJO server already running (PID ${oldPid}).`);
    return;
  }
  cleanup();
  const out = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
    env: process.env,
  });
  fs.writeFileSync(pidFile, String(child.pid));
  child.unref();
  console.log(`AJO server started in background (PID ${child.pid}).`);
  console.log(`Health: http://127.0.0.1:${port}/api/health`);
  console.log(`Log: ${logFile}`);
}

function stop() {
  const pid = readPid();
  if (!isRunning(pid)) {
    cleanup();
    console.log("AJO server is not running.");
    return;
  }
  try { process.kill(pid, "SIGTERM"); } catch (e) { console.error(e.message); }
  cleanup();
  console.log(`AJO server stopped (PID ${pid}).`);
}

function health() {
  const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 3000 }, res => {
    let body = "";
    res.setEncoding("utf8");
    res.on("data", c => body += c);
    res.on("end", () => {
      console.log(body);
      process.exitCode = res.statusCode === 200 ? 0 : 1;
    });
  });
  req.on("timeout", () => req.destroy(new Error("Health check timed out.")));
  req.on("error", e => { console.error(`AJO server is not reachable: ${e.message}`); process.exitCode = 1; });
}

const command = process.argv[2];
if (command === "start") start();
else if (command === "stop") stop();
else if (command === "health") health();
else {
  console.log("Usage: npm run start:bg | npm run stop | npm run health");
  process.exitCode = 1;
}

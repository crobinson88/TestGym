"use strict";

// Writes build/icon.png (1024px) for electron-builder, drawn by the same code
// as the tray dot, so the repo carries no binary assets.

const fs = require("node:fs");
const path = require("node:path");
const { circlePng } = require("../icon");

const out = path.join(__dirname, "..", "build", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, circlePng(1024, [34, 211, 238]));
console.log(`icon → ${path.relative(process.cwd(), out)}`);

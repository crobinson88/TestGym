import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
const publicDir = path.resolve(root, "..", "public");

const svgRaw = await fs.readFile(path.join(publicDir, "icon.svg"), "utf-8");

const maskableSvg = svgRaw.replace(
  /<g fill="#22d3ee">/,
  '<g fill="#22d3ee" transform="translate(51,51) scale(0.8)">',
);

const targets = [
  { name: "icon-192.png", size: 192, svg: svgRaw },
  { name: "icon-512.png", size: 512, svg: svgRaw },
  { name: "icon-512-maskable.png", size: 512, svg: maskableSvg },
  { name: "apple-touch-icon.png", size: 180, svg: svgRaw },
  { name: "favicon-32.png", size: 32, svg: svgRaw },
];

for (const { name, size, svg } of targets) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const png = resvg.render().asPng();
  const dest = path.join(publicDir, name);
  await fs.writeFile(dest, png);
  console.log(`wrote ${path.relative(process.cwd(), dest)} (${png.length}B)`);
}

import { describe, expect, it } from "vitest";
import {
  hexToRgb01,
  normBoxToPdfRect,
  normPointToPdf,
  pixelDragToNormBox,
  pixelPointToNorm,
} from "./geometry";

describe("pixelDragToNormBox", () => {
  it("normalises a drag and orders the corners regardless of direction", () => {
    const forward = pixelDragToNormBox(10, 20, 110, 120, 200, 400);
    expect(forward).toEqual({ x: 0.05, y: 0.05, w: 0.5, h: 0.25 });
    // Dragging bottom-right -> top-left yields the same box.
    const backward = pixelDragToNormBox(110, 120, 10, 20, 200, 400);
    expect(backward).toEqual(forward);
  });

  it("clamps coordinates that overshoot the page", () => {
    const box = pixelDragToNormBox(-50, -50, 400, 800, 200, 400);
    expect(box).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("is safe on a zero-sized page", () => {
    expect(pixelDragToNormBox(0, 0, 10, 10, 0, 0)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("pixelPointToNorm", () => {
  it("maps a point into [0..1]", () => {
    expect(pixelPointToNorm(50, 100, 200, 400)).toEqual({ x: 0.25, y: 0.25 });
  });
});

describe("normBoxToPdfRect", () => {
  it("flips the y origin from top-left to pdf bottom-left", () => {
    // A box in the top 25% of a 100x200 page sits high in pdf coords.
    const rect = normBoxToPdfRect({ x: 0.1, y: 0, w: 0.5, h: 0.25 }, 100, 200);
    expect(rect).toEqual({ x: 10, y: 150, width: 50, height: 50 });
  });

  it("places a bottom-edge box at y=0", () => {
    const rect = normBoxToPdfRect({ x: 0, y: 0.75, w: 1, h: 0.25 }, 100, 200);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.height).toBeCloseTo(50);
  });
});

describe("normPointToPdf", () => {
  it("flips the y origin for a point", () => {
    expect(normPointToPdf(0.5, 0.25, 100, 200)).toEqual({ x: 50, y: 150 });
  });
});

describe("hexToRgb01", () => {
  it("parses #rrggbb into [0..1] channels", () => {
    expect(hexToRgb01("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb01("000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("falls back to the default highlight on garbage", () => {
    const c = hexToRgb01("not-a-colour");
    expect(c.r).toBeCloseTo(0xfd / 255);
    expect(c.g).toBeCloseTo(0xe0 / 255);
    expect(c.b).toBeCloseTo(0x47 / 255);
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DurationFilter } from "./DurationFilter";
import { EMPTY_DURATION_RANGE, type DurationRange } from "../duration";

function setup(value: DurationRange = EMPTY_DURATION_RANGE, open = true) {
  const onChange = vi.fn();
  const onToggle = vi.fn();
  render(
    <DurationFilter value={value} onChange={onChange} open={open} onToggle={onToggle} />,
  );
  const presets = () => within(screen.getByRole("group", { name: "Block length presets" }));
  return { onChange, onToggle, presets };
}

describe("DurationFilter", () => {
  it("opens via the chip", () => {
    const { onToggle } = setup(EMPTY_DURATION_RANGE, false);
    expect(screen.queryByLabelText(/minimum block length/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /time/i }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("applies a preset window", () => {
    const { onChange, presets } = setup();
    fireEvent.click(presets().getByRole("button", { name: "5 – 15m" }));
    expect(onChange).toHaveBeenCalledWith({ minMin: 5, maxMin: 15 });
  });

  it("clears the window when the active preset is tapped again", () => {
    const { onChange, presets } = setup({ minMin: null, maxMin: 30 });
    fireEvent.click(presets().getByRole("button", { name: "30m or less" }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_DURATION_RANGE);
  });

  it("edits each end independently", () => {
    const { onChange } = setup({ minMin: 5, maxMin: null });
    fireEvent.change(screen.getByLabelText(/maximum block length/i), { target: { value: "15" } });
    expect(onChange).toHaveBeenCalledWith({ minMin: 5, maxMin: 15 });
    fireEvent.change(screen.getByLabelText(/minimum block length/i), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ minMin: null, maxMin: null });
  });

  it("shows the active window on the chip", () => {
    setup({ minMin: 5, maxMin: 15 }, false);
    expect(screen.getByRole("button", { name: /5 – 15m/ })).toBeTruthy();
  });

  it("offers Clear only once a window is set", () => {
    setup();
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
    setup({ minMin: null, maxMin: 30 });
    expect(screen.getByRole("button", { name: /clear/i })).toBeTruthy();
  });
});

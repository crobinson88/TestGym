import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CreatedRangeFilter } from "./CreatedRangeFilter";
import { EMPTY_CREATED_RANGE, type CreatedRange } from "../createdRange";

const TODAY = "2026-06-10";

function setup(value: CreatedRange = EMPTY_CREATED_RANGE, open = true) {
  const onChange = vi.fn();
  const onToggle = vi.fn();
  render(
    <CreatedRangeFilter
      value={value}
      onChange={onChange}
      open={open}
      onToggle={onToggle}
      today={TODAY}
    />,
  );
  const presets = () => within(screen.getByRole("group", { name: "Added date presets" }));
  return { onChange, onToggle, presets };
}

describe("CreatedRangeFilter", () => {
  it("opens and closes via the chip", () => {
    const { onToggle } = setup(EMPTY_CREATED_RANGE, false);
    expect(screen.queryByLabelText("Added from")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /added/i }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("applies a preset window", () => {
    const { onChange, presets } = setup();
    fireEvent.click(presets().getByRole("button", { name: "Last 7 days" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-06-04", to: TODAY });
  });

  it("clears the window when the active preset is tapped again", () => {
    const { onChange, presets } = setup({ from: "2026-06-04", to: TODAY });
    fireEvent.click(presets().getByRole("button", { name: "Last 7 days" }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_CREATED_RANGE);
  });

  it("edits each end independently", () => {
    const { onChange } = setup({ from: "2026-06-01", to: null });
    fireEvent.change(screen.getByLabelText("Added to"), { target: { value: "2026-06-05" } });
    expect(onChange).toHaveBeenCalledWith({ from: "2026-06-01", to: "2026-06-05" });
    fireEvent.change(screen.getByLabelText("Added from"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ from: null, to: null });
  });

  it("offers Clear only once a window is set", () => {
    setup();
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
    setup({ from: "2026-06-01", to: null });
    expect(screen.getByRole("button", { name: /clear/i })).toBeTruthy();
  });
});

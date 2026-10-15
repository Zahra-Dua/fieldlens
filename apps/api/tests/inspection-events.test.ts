import { describe, expect, it, vi } from "vitest";
import {
  publishInspectionCreated,
  subscribeToInspectionEvents,
} from "../src/modules/inspections/inspection-events";

describe("inspection event subscribers", () => {
  it("publishes a created event to active subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToInspectionEvents(listener);

    publishInspectionCreated();

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: "inspection.created",
    });
    unsubscribe();
  });

  it("stops publishing after a subscriber disconnects", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToInspectionEvents(listener);
    unsubscribe();

    publishInspectionCreated();

    expect(listener).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { createInspectionsSchema } from "../src/modules/inspections/inspections.schemas";

const baseInspection = {
  id: "11111111-1111-4111-8111-111111111111",
  deviceId: "22222222-2222-4222-8222-222222222222",
  capturedAt: "2026-10-08T12:00:00.000Z",
};

describe("inspection prediction schema", () => {
  it("accepts legacy inspections without a prediction", () => {
    expect(
      createInspectionsSchema.safeParse({
        inspections: [baseInspection],
      }).success,
    ).toBe(true);
  });

  it("accepts a complete prediction and correction", () => {
    expect(
      createInspectionsSchema.safeParse({
        inspections: [
          {
            ...baseInspection,
            predictedClass: "PLASTIC",
            confidence: 0.82,
            inferenceSource: "ON_DEVICE",
            correctedClass: "GLASS",
            isAccepted: false,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects partial predictions and corrections without a prediction", () => {
    expect(
      createInspectionsSchema.safeParse({
        inspections: [{ ...baseInspection, predictedClass: "PLASTIC" }],
      }).success,
    ).toBe(false);
    expect(
      createInspectionsSchema.safeParse({
        inspections: [{ ...baseInspection, correctedClass: "GLASS" }],
      }).success,
    ).toBe(false);
  });
});

/**
 * @jest-environment node
 */

import {
  addMediaRolloutModeFromFlag,
  isAddMediaEnabled,
} from "@/lib/add-media-rollout";

describe("Add Media rollout", () => {
  it("enables only the exact local-v1 value", () => {
    expect(addMediaRolloutModeFromFlag("local-v1")).toBe("local-v1");
    expect(isAddMediaEnabled("local-v1")).toBe(true);
  });

  it.each([
    null,
    "",
    "true",
    "1",
    "local",
    "local-V1",
    "LOCAL-V1",
    " local-v1",
    "local-v1 ",
    "local-v2",
  ])("keeps %p disabled", (flag) => {
    expect(addMediaRolloutModeFromFlag(flag)).toBe("off");
    expect(isAddMediaEnabled(flag)).toBe(false);
  });

  it("keeps an absent flag disabled", () => {
    expect(addMediaRolloutModeFromFlag(undefined)).toBe("off");
  });

  it("reads only the exact value from the environment-backed default", () => {
    const previousFlag = process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA;

    try {
      delete process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA;
      expect(isAddMediaEnabled()).toBe(false);
      process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA = "true";
      expect(isAddMediaEnabled()).toBe(false);
      process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA = "local-v1";
      expect(isAddMediaEnabled()).toBe(true);
    } finally {
      if (previousFlag === undefined) {
        delete process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA;
      } else {
        process.env.NEXT_PUBLIC_QUICKFILL_ADD_MEDIA = previousFlag;
      }
    }
  });
});

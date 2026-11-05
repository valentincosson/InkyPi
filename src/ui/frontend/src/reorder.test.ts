import { describe, expect, it } from "vitest"
import { moved } from "@/reorder"

describe("moved", () => {
  it.each([
    [0, 2, ["b", "c", "a"]],
    [2, 0, ["c", "a", "b"]],
    [1, 2, ["a", "c", "b"]],
    [1, 1, ["a", "b", "c"]],
  ])("from %i to %i", (from, to, expected) => {
    expect(moved(["a", "b", "c"], from, to)).toEqual(expected)
  })

  it("does not change the original list", () => {
    const items = ["a", "b"]
    moved(items, 0, 1)
    expect(items).toEqual(["a", "b"])
  })
})

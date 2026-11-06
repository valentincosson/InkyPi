import { describe, expect, it } from "vitest"
import { entriesWithout, entriesWithValue, nameError } from "@/api-keys"

const keys = [
  { key: "A", has_value: true },
  { key: "B", has_value: false },
]

describe("entriesWithValue", () => {
  it("keeps the others and replaces the chosen key", () => {
    expect(entriesWithValue(keys, "A", "new")).toEqual([
      { key: "A", value: "new" },
      { key: "B", keepExisting: true },
    ])
  })

  it("adds a new key at the end", () => {
    expect(entriesWithValue(keys, "C", "new")).toEqual([
      { key: "A", keepExisting: true },
      { key: "B", keepExisting: true },
      { key: "C", value: "new" },
    ])
  })
})

describe("entriesWithout", () => {
  it("keeps every other key", () => {
    expect(entriesWithout(keys, "A")).toEqual([{ key: "B", keepExisting: true }])
  })
})

describe("nameError", () => {
  it.each(["MY_KEY", "_private", "key2"])("accepts %s", (name) => {
    expect(nameError(name, keys)).toBeNull()
  })

  it.each(["", "2KEY", "MY KEY", "MY-KEY", "é"])("rejects %j", (name) => {
    expect(nameError(name, keys)).toBe("apiKeys.nameInvalid")
  })

  it("refuses a name already used", () => {
    expect(nameError("A", keys)).toBe("apiKeys.nameTaken")
  })
})

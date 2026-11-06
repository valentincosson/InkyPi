import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, request } from "./api"

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }))

afterEach(() => vi.unstubAllGlobals())

describe("request", () => {
  it("renvoie le JSON", async () => {
    vi.stubGlobal("fetch", reply({ success: true }))
    await expect(request("/x")).resolves.toEqual({ success: true })
  })

  it.each([
    [{ error: "Name is required" }, 400, "Name is required"],
    [{ success: false, message: "Playlist not found" }, 400, "Playlist not found"],
    ["<html>panne</html>", 500, "HTTP 500"],
  ])("unifie les erreurs %#", async (body, status, message) => {
    vi.stubGlobal("fetch", reply(body, status))
    const error = (await request("/x").catch((e) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe(message)
    expect(error.status).toBe(status)
  })
})

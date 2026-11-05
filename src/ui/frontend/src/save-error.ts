import { ApiError } from "@/api"
import type { Key } from "@/i18n/translate"

type Translate = (key: Key, params?: Record<string, string>) => string

/** Le serveur explique le refus ; sans réponse de sa part, on le dit aussi, jamais un échec muet. */
export function saveErrorMessage(error: unknown, t: Translate) {
  return error instanceof ApiError ? t("error.refused", { reason: error.message }) : t("error.notSaved")
}

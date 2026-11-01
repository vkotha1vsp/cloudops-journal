import { route, parseJson } from "@/lib/api";
import { saveImport, saveImportSchema } from "@/server/imports";

type P = { id: string };

/** Saves the (possibly corrected) preview as a journal page with source attribution. */
export const POST = route<P>(async ({ req, user, params }) => saveImport(user.id, params.id, await parseJson(req, saveImportSchema)), { limit: 30 });

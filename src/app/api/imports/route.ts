import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/errors";
import { createImport, listImports } from "@/server/imports";

export const runtime = "nodejs";

const pasteSchema = z.object({ markdown: z.string().min(1).max(2_000_000), name: z.string().trim().max(120).optional() });

export const GET = route(async ({ user }) => ({ imports: await listImports(user.id) }));

/** multipart/form-data with one `file`, or JSON { markdown } for "Paste from ChatGPT". */
export const POST = route(
  async ({ req, user }) => {
    const type = req.headers.get("content-type") ?? "";
    if (type.startsWith("application/json")) {
      const { markdown, name } = await parseJson(req, pasteSchema);
      return createImport(user.id, { fileName: name || "ChatGPT paste", mime: "text/markdown", buf: Buffer.from(markdown, "utf8"), paste: true });
    }
    if (!type.startsWith("multipart/form-data")) throw new HttpError(415, "Send a file (multipart/form-data) or JSON");
    const max = env().MAX_UPLOAD_MB * 1024 * 1024;
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > max + 64 * 1024) throw new HttpError(413, `Files must be under ${env().MAX_UPLOAD_MB} MB`);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file was sent");
    return createImport(user.id, { fileName: file.name, mime: file.type, buf: Buffer.from(await file.arrayBuffer()) });
  },
  { limit: 20 },
);

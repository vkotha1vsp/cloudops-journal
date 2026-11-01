import { route, parseJson } from "@/lib/api";
import { presignSchema } from "@/lib/validation";
import { createUpload } from "@/server/attachments";

/** Step 1 of an upload: validate type/size server-side and return a 5-minute presigned PUT URL. */
export const POST = route(async ({ req, user }) => createUpload(user.id, await parseJson(req, presignSchema)), { limit: 30 });

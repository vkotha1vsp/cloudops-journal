import { route } from "@/lib/api";
import { confirmUpload, downloadUrl } from "@/server/attachments";

type P = { id: string };

/** Returns a short-lived presigned download URL. */
export const GET = route<P>(async ({ user, params }) => downloadUrl(user.id, params.id));

/** Step 2 of an upload: mark as uploaded after the browser's PUT to S3 succeeded. */
export const POST = route<P>(async ({ user, params }) => confirmUpload(user.id, params.id));

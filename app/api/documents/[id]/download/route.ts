import { route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { readDocument } from "@/lib/modules/documents/service";

/**
 * Streams a document after re-checking permissions. Storage keys are never
 * exposed to the client, so this route is the only way to reach a file.
 */
export const GET = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await params;
  const { bytes, fileName, mimeType } = await readDocument(actor, id);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mimeType,
      // `attachment` prevents anything uploaded from executing in the app's origin.
      "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
});

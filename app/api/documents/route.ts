import { json, parseSearchParams, route } from "@/lib/api";
import { requireActor } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors";
import { documentUploadSchema, expiringDocumentsSchema } from "@/lib/modules/documents/schemas";
import { listExpiringDocuments, uploadDocument } from "@/lib/modules/documents/service";
import { maxUploadBytes } from "@/lib/modules/documents/storage";

/** Expiring / expired documents the caller is allowed to see. */
export const GET = route(async (request: Request) => {
  const actor = await requireActor();
  const { withinDays } = parseSearchParams(request, expiringDocumentsSchema);
  return json(await listExpiringDocuments(actor, withinDays));
});

export const POST = route(async (request: Request) => {
  const actor = await requireActor();

  const form = await request.formData().catch(() => null);
  if (!form) throw new ValidationError("Expected a multipart upload.");

  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Attach a file to upload.");

  // Reject oversized uploads before buffering the whole thing into memory.
  if (file.size > maxUploadBytes()) {
    throw new ValidationError(`Files must be under ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`);
  }

  const input = documentUploadSchema.parse({
    employeeId: form.get("employeeId"),
    categoryId: form.get("categoryId"),
    expiresAt: form.get("expiresAt"),
  });

  const document = await uploadDocument(actor, input, {
    name: file.name,
    type: file.type || "application/octet-stream",
    bytes: Buffer.from(await file.arrayBuffer()),
  });

  return json(document, 201);
});

/**
 * Route-handler plumbing.
 *
 * Wrapping every handler in `route()` guarantees two things: a thrown
 * permission error becomes a clean 403 rather than a 500 with a stack trace,
 * and unexpected errors are logged server-side but never echoed to the client.
 */
import { z } from "zod";
import { AppError, ValidationError } from "@/lib/errors";

export function json(data: unknown, status = 200): Response {
  return Response.json(data as Record<string, unknown>, { status });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message, code: error.code, details: error.details }, { status: error.status });
  }

  if (error instanceof z.ZodError) {
    return Response.json(
      { error: "The submitted data is invalid.", code: "validation_error", details: z.treeifyError(error) },
      { status: 422 },
    );
  }

  console.error("Unhandled route error:", error);
  return Response.json({ error: "Something went wrong.", code: "internal_error" }, { status: 500 });
}

type Handler<Context> = (request: Request, context: Context) => Promise<Response>;

export function route<Context>(handler: Handler<Context>): Handler<Context> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export async function parseJsonBody<Schema extends z.ZodType>(request: Request, schema: Schema): Promise<z.infer<Schema>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new ValidationError("Expected a JSON body.");
  }
  return schema.parse(payload);
}

export function parseSearchParams<Schema extends z.ZodType>(request: Request, schema: Schema): z.infer<Schema> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return schema.parse(params);
}

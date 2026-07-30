/**
 * Small fetch wrapper for client components.
 *
 * Turns the API's error envelope into a thrown `Error` carrying the most useful
 * message available — the first field-level validation message if there is one,
 * otherwise the summary.
 */
export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; details?: unknown };
    throw new Error(fieldMessage(body.details) ?? body.error ?? "Something went wrong.");
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function fieldMessage(details: unknown): string | undefined {
  const tree = details as { properties?: Record<string, { errors?: string[] }>; errors?: string[] } | undefined;
  if (!tree) return undefined;

  if (tree.properties) {
    for (const [field, entry] of Object.entries(tree.properties)) {
      const message = entry.errors?.[0];
      if (message) return `${humaniseField(field)}: ${message}`;
    }
  }

  return tree.errors?.[0];
}

function humaniseField(field: string): string {
  const spaced = field.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

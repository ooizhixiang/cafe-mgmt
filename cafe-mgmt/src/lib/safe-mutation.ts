import type { ActionResult } from "@/types";

/**
 * Wraps a server action call on the client side.
 * Handles optimistic UI, server confirmation, and error rollback.
 */
export async function safeMutation<T>(
  action: () => Promise<ActionResult<T>>,
  options?: {
    onOptimistic?: () => void;
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
    onRollback?: () => void;
  }
): Promise<ActionResult<T>> {
  options?.onOptimistic?.();

  const result = await action();

  if (result.success) {
    options?.onSuccess?.(result.data);
  } else {
    options?.onRollback?.();
    options?.onError?.(result.error);
  }

  return result;
}

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* ignore */
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error, `Edge function ${name} failed`));
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error: string }).error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

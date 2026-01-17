import useSWR, { SWRConfiguration } from 'swr';
import { apiFetch } from './api';

export function useApiSWR<T>(endpoint: string | null, options?: SWRConfiguration) {
  return useSWR<T>(endpoint, (key: string) => apiFetch<T>(key), options);
}

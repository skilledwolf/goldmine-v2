import useSWR from 'swr';
import { apiFetch } from './api';

export function useApiSWR<T>(endpoint: string | null) {
  return useSWR<T>(endpoint, (key) => apiFetch<T>(key));
}

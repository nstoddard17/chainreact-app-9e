import { useState, useCallback } from 'react';
import axios from 'axios';

interface ApiClientOptions {
  baseURL?: string;
  headers?: Record<string, string>;
}

export function useApiClient(options: ApiClientOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const client = axios.create({
    baseURL: options.baseURL || '',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  const get = useCallback(async (url: string, params?: any) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await client.get(url, { params });
      return response;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [client]);
  
  const post = useCallback(async (url: string, data?: any, config?: any) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await client.post(url, data, config);
      return response;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [client]);
  
  const put = useCallback(async (url: string, data?: any, config?: any) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await client.put(url, data, config);
      return response;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [client]);
  
  const del = useCallback(async (url: string, config?: any) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await client.delete(url, config);
      return response;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [client]);
  
  return {
    get,
    post,
    put,
    delete: del,
    isLoading,
    error,
    client,
  };
} 
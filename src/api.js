import axios from 'axios';
import { useEffect, useRef, useState } from 'react';

// 🔥 Use environment variable (BEST PRACTICE)
const BASE = import.meta.env.VITE_API_BASE_URL || 'http://18.234.228.216:30007';

const api = axios.create({
  baseURL: BASE,
});

// ---------- API CALLS ----------

export async function fetchNodes() {
  const { data } = await api.get('/nodes');
  return data;
}

export async function fetchPods() {
  const { data } = await api.get('/pods');
  return data;
}

export async function fetchCpuMetrics(range) {
  const { data } = await api.get('/metrics/cpu', {
    params: range ? { range } : {},
  });
  return data;
}

export async function fetchMemoryMetrics(range) {
  const { data } = await api.get('/metrics/memory', {
    params: range ? { range } : {},
  });
  return data;
}

export async function fetchAlerts() {
  const { data } = await api.get('/alerts');
  return data;
}

export async function fetchPodDetails(namespace, pod) {
  const { data } = await api.get(`/pods/${namespace}/${pod}`);
  return data;
}

// ---------- SSE (REAL-TIME) ----------

export function useSSE() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    const es = new EventSource(`${BASE}/stream`);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed);
      } catch (e) {
        console.error('SSE parse error', e);
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError('Connection lost. Retrying...');
    };

    return () => es.close();
  }, []);

  return { data, connected, error };
}
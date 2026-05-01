import axios from 'axios';
import { useEffect, useRef, useState } from 'react';

// ✅ Vercel proxy base URL (no env needed)
const BASE = '/api';

const api = axios.create({
  baseURL: BASE,
  timeout: 5000,
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

// ---------- REAL-TIME (SSE + FALLBACK) ----------

export function useSSE() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    let pollingInterval;

    try {
      // 🔥 Try SSE first
      const es = new EventSource(`${BASE}/stream`);
      esRef.current = es;

      es.onopen = () => {
        console.log("SSE connected");
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
        console.warn("SSE failed → switching to polling");

        setConnected(false);
        setError('SSE failed. Using polling...');

        es.close();

        // 🔥 FALLBACK: polling every 5 sec
        pollingInterval = setInterval(async () => {
          try {
            const pods = await fetchPods();
            setData({ pods });
          } catch (err) {
            console.error("Polling error", err);
          }
        }, 5000);
      };

    } catch (err) {
      console.error("SSE init error", err);
    }

    return () => {
      if (esRef.current) esRef.current.close();
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, []);

  return { data, connected, error };
} 
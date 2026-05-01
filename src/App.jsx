import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { useSSE, fetchPodDetails, fetchAlerts } from './api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler, zoomPlugin);

/* ── Helpers ── */
function safeFixed(v, d = 2) { return (v == null || isNaN(v)) ? '0' : Number(v).toFixed(d); }
function shortPod(name) { return name?.split('-').slice(0, 2).join('-') || ''; }

/* ── Animated counter hook ── */
function useAnimatedValue(target, dur = 700) {
  const [val, setVal] = useState(0);
  const ref = useRef({ from: 0, start: 0, raf: 0 });
  useEffect(() => {
    const num = parseFloat(target) || 0;
    const r = ref.current;
    r.from = val; r.start = performance.now();
    cancelAnimationFrame(r.raf);
    const tick = (now) => {
      const p = Math.min((now - r.start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(r.from + (num - r.from) * ease);
      if (p < 1) r.raf = requestAnimationFrame(tick);
    };
    r.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(r.raf);
  }, [target]);
  return val;
}

/* ── SVG Icons ── */
const I = {
  Sun: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Moon: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

/* ── Status Badge ── */
function StatusBadge({ status }) {
  const cls = (status || '').toLowerCase().replace(/\s+/g, '');
  return <span className={`status-badge ${cls}`}><span className="dot"/>{status}</span>;
}

/* ── Animated Info Card ── */
function ACard({ title, rawValue, suffix, subtitle, icon, iconClass, delay, digits = 0, onClick }) {
  const anim = useAnimatedValue(rawValue);
  const v = digits > 0 ? anim.toFixed(digits) : Math.round(anim);
  return (
    <div className={`card info-card animate-in delay-${delay} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className={`card-icon ${iconClass}`}>{icon}</div>
      <h3>{title}</h3>
      <p className="main-value">{v}{suffix || ''}</p>
      {subtitle && <span className="subtitle">{subtitle}</span>}
    </div>
  );
}

/* ── Onboarding Tour ── */
const TOUR_STEPS = [
  { icon: '⎈', title: 'Welcome to K8s Monitor!', text: 'Your real-time Kubernetes cluster dashboard with live metrics, alerts, and drill-down details.' },
  { icon: '📊', title: 'Live Metrics', text: 'CPU, Memory, Pods, and Nodes update automatically via Server-Sent Events. No refresh needed!' },
  { icon: '🔍', title: 'Smart Filters', text: 'Use the filter bar to narrow down by namespace, node, pod name, or time range.' },
  { icon: '🔔', title: 'Alerts & Drill-down', text: 'The alert panel shows issues like High CPU or CrashLoopBackOff. Click any pod row to see container details.' },
  { icon: '🎨', title: 'Customize Your View', text: 'Toggle dark/light mode, switch chart types, zoom & pan on charts. Enjoy!' },
];

function Tour({ onClose }) {
  const [step, setStep] = useState(0);
  const s = TOUR_STEPS[step];
  return (
    <div className="tour-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tour-card">
        <div className="tour-icon">{s.icon}</div>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        <div className="tour-steps">
          {TOUR_STEPS.map((_, i) => <div key={i} className={`tour-step-dot ${i === step ? 'active' : ''}`}/>)}
        </div>
        <div className="tour-actions">
          <button className="tour-btn-skip" onClick={onClose}>Skip</button>
          <button className="tour-btn-primary" onClick={() => step < TOUR_STEPS.length - 1 ? setStep(step + 1) : onClose()}>
            {step < TOUR_STEPS.length - 1 ? 'Next →' : 'Get Started!'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Pod Detail Modal ── */
function PodModal({ pod, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pod) return;
    setLoading(true);
    fetchPodDetails(pod.namespace, pod.pod)
      .then(d => setDetails(d))
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [pod]);

  if (!pod) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>🔍 {pod.pod}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-section">
          <h4>Overview</h4>
          <div className="detail-row"><span className="detail-label">Namespace</span><span className="ns-tag">{pod.namespace}</span></div>
          <div className="detail-row"><span className="detail-label">Phase</span><StatusBadge status={pod.phase}/></div>
          <div className="detail-row"><span className="detail-label">Restarts</span><span className="detail-value">{pod.restarts || 0}</span></div>
        </div>
        {loading ? <div className="skeleton" style={{height:100,borderRadius:10}}/> : details?.containers?.length > 0 ? (
          <div className="modal-section">
            <h4>Containers</h4>
            <table><thead><tr><th>Name</th><th>CPU</th><th>Memory</th><th>Restarts</th></tr></thead>
              <tbody>{details.containers.map(c => (
                <tr key={c.name}>
                  <td style={{fontWeight:500,color:'var(--text-primary)'}}>{c.name}</td>
                  <td>{safeFixed(c.cpuCores, 4)} cores</td>
                  <td>{safeFixed(c.memoryMiB, 1)} MiB</td>
                  <td>{c.restarts}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p style={{color:'var(--text-muted)',textAlign:'center',padding:16}}>No container details available</p>}
      </div>
    </div>
  );
}

/* ── Alert Panel ── */
function AlertPanel({ alerts, acknowledged, onAcknowledge }) {
  const active = alerts.filter(a => !acknowledged.has(a.id));
  const acked = alerts.filter(a => acknowledged.has(a.id));
  return (
    <div className="card alert-panel animate-in delay-5">
      <h3>🔔 Alerts <span className={`alert-count ${alerts.length === 0 ? 'zero' : ''}`}>{active.length}</span></h3>
      {active.length === 0 && acked.length === 0 && <div className="alert-empty">✅ All systems healthy — no alerts</div>}
      {active.map(a => (
        <div key={a.id} className="alert-item">
          <div className="alert-info">
            <div className={`alert-severity ${a.severity}`}/>
            <div><div className="alert-type">{a.type}</div><div className="alert-message">{a.message}</div></div>
          </div>
          <button className="btn btn-sm" onClick={() => onAcknowledge(a.id)}>Acknowledge</button>
        </div>
      ))}
      {acked.map(a => (
        <div key={a.id} className="alert-item acknowledged">
          <div className="alert-info">
            <div className={`alert-severity ${a.severity}`}/>
            <div><div className="alert-type">{a.type}</div><div className="alert-message">{a.message}</div></div>
          </div>
          <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>Acknowledged</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main App ── */
export default function App() {
  const { data: sseData, connected, error: sseError } = useSSE();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [showTour, setShowTour] = useState(() => !localStorage.getItem('tourDone'));
  const [search, setSearch] = useState('');
  const [nsFilter, setNsFilter] = useState('all');
  const [nodeFilter, setNodeFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('5m');
  const [cpuChart, setCpuChart] = useState('bar');
  const [memChart, setMemChart] = useState('line');
  const [podSortCol, setPodSortCol] = useState('pod');
  const [podSortDir, setPodSortDir] = useState('asc');
  const [nodeSortDir, setNodeSortDir] = useState('asc');
  const [selectedPod, setSelectedPod] = useState(null);
  const [acknowledged, setAcknowledged] = useState(new Set());
  const [alerts, setAlerts] = useState([]);

  // Theme
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); }, [theme]);
  const closeTour = () => { setShowTour(false); localStorage.setItem('tourDone', '1'); };

  // Fetch alerts separately (SSE also includes them but this gives more control)
  useEffect(() => {
    if (sseData?.alerts?.alerts) setAlerts(sseData.alerts.alerts);
  }, [sseData]);

  const nodes = sseData?.nodes;
  const pods = sseData?.pods;
  const cpu = sseData?.cpu;
  const memory = sseData?.memory;

  // Derived
  const namespaces = useMemo(() => pods?.pods ? [...new Set(pods.pods.map(p => p.namespace))].sort() : [], [pods]);
  const nodeNames = useMemo(() => nodes?.nodes ? [...new Set(nodes.nodes.map(n => n.name))].sort() : [], [nodes]);

  const filteredPods = useMemo(() => {
    if (!pods?.pods) return [];
    let list = pods.pods;
    if (nsFilter !== 'all') list = list.filter(p => p.namespace === nsFilter);
    if (search) list = list.filter(p => p.pod.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => {
      const va = a[podSortCol] || '', vb = b[podSortCol] || '';
      return podSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [pods, nsFilter, search, podSortCol, podSortDir]);

  const sortedNodes = useMemo(() => {
    if (!nodes?.nodes) return [];
    let list = nodes.nodes;
    if (nodeFilter !== 'all') list = list.filter(n => n.name === nodeFilter);
    return [...list].sort((a, b) => nodeSortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  }, [nodes, nodeFilter, nodeSortDir]);

  const togglePodSort = (col) => {
    if (podSortCol === col) setPodSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setPodSortCol(col); setPodSortDir('asc'); }
  };
  const sortArrow = (col, curCol, curDir) => col === curCol ? (curDir === 'asc' ? ' ↑' : ' ↓') : '';
  const handleAck = (id) => setAcknowledged(prev => new Set(prev).add(id));

  // Chart data
  const cpuPoints = useMemo(() => {
    let pts = cpu?.cpuByPod?.slice(0, 10) || [];
    if (nsFilter !== 'all') pts = pts.filter(p => p.namespace === nsFilter);
    return pts;
  }, [cpu, nsFilter]);

  const memPoints = useMemo(() => {
    let pts = memory?.memoryByPod?.slice(0, 10) || [];
    if (nsFilter !== 'all') pts = pts.filter(p => p.namespace === nsFilter);
    return pts;
  }, [memory, nsFilter]);

  const mkDataset = (points, key, label, hue) => ({
    labels: points.map(i => shortPod(i.pod)),
    datasets: [{
      label, data: points.map(i => Number(i[key] || 0).toFixed(4)),
      backgroundColor: points.map((_, idx) => `hsla(${hue + idx * 15}, 75%, 55%, 0.6)`),
      borderColor: points.map((_, idx) => `hsla(${hue + idx * 15}, 75%, 55%, 1)`),
      borderWidth: 2, fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 7,
    }]
  });

  const cpuChartData = mkDataset(cpuPoints, 'cpuCores', 'CPU (cores)', 230);
  const memChartData = mkDataset(memPoints, 'memoryMiB', 'Memory (MiB)', 270);

  const chartOpts = (type) => {
    const isDark = theme === 'dark';
    const base = {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { labels: { color: isDark ? '#94a3b8' : '#475569', font: { family: 'Inter' } } },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#fff', titleColor: isDark ? '#f1f5f9' : '#0f172a',
          bodyColor: isDark ? '#94a3b8' : '#475569', borderColor: 'rgba(99,102,241,.3)', borderWidth: 1,
          cornerRadius: 10, padding: 12, titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' },
        },
        zoom: {
          pan: { enabled: true, mode: 'x', modifierKey: null },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
        }
      },
      animation: { duration: 600, easing: 'easeOutQuart' }
    };
    if (type === 'doughnut') return { responsive: true, maintainAspectRatio: true, plugins: base.plugins, animation: base.animation };
    return {
      ...base,
      scales: {
        x: { ticks: { color: isDark ? '#64748b' : '#94a3b8', font: { family: 'Inter', size: 11 }, maxRotation: 45 }, grid: { color: 'rgba(99,102,241,.06)' } },
        y: { ticks: { color: isDark ? '#64748b' : '#94a3b8', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(99,102,241,.06)' } }
      }
    };
  };

  const renderChart = (type, data) => {
    const o = chartOpts(type);
    if (type === 'bar') return <Bar data={data} options={o}/>;
    if (type === 'line') return <Line data={data} options={o}/>;
    return <Doughnut data={data} options={o}/>;
  };

  const ChartBtns = ({ cur, set }) => (
    <div className="chart-controls">
      {['bar', 'line', 'doughnut'].map(t => (
        <button key={t} className={`btn btn-sm ${cur === t ? 'active' : ''}`} onClick={() => set(t)}>
          {t === 'bar' ? '📊' : t === 'line' ? '📈' : '🍩'} {t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );

  // Loading skeleton
  if (!sseData) {
    return (
      <div className="container">
        <header><div className="header-left"><h1>⎈ Kubernetes Cluster Monitoring</h1><p>Connecting to live stream...</p></div></header>
        <section className="grid cards-grid">{[1,2,3,4].map(i => <div key={i} className="card skeleton skeleton-card"/>)}</section>
        <section className="grid charts-grid"><div className="card skeleton skeleton-chart"/><div className="card skeleton skeleton-chart"/></section>
      </div>
    );
  }

  return (
    <div className="container">
      {showTour && <Tour onClose={closeTour}/>}
      {selectedPod && <PodModal pod={selectedPod} onClose={() => setSelectedPod(null)}/>}

      {/* Header */}
      <header>
        <div className="header-left">
          <h1>⎈ Kubernetes Cluster Monitoring</h1>
          <p>
            <span className={`live-dot ${connected ? '' : 'disconnected'}`}/>
            {connected ? 'Live' : 'Reconnecting...'}
            {sseData?.timestamp && ` · ${new Date(sseData.timestamp).toLocaleTimeString()}`}
          </p>
        </div>
        <div className="header-controls">
          <button className="btn btn-sm" onClick={() => { localStorage.removeItem('tourDone'); setShowTour(true); }}>❓ Tour</button>
          <button className="btn btn-icon" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {theme === 'dark' ? <I.Sun/> : <I.Moon/>}
          </button>
        </div>
      </header>

      {sseError && <div className="error">{sseError}</div>}

      {/* Filter Bar */}
      <div className="filter-bar animate-in delay-1">
        <div className="filter-group">
          <label>Namespace</label>
          <select className="select" value={nsFilter} onChange={e => setNsFilter(e.target.value)}>
            <option value="all">All</option>
            {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Node</label>
          <select className="select" value={nodeFilter} onChange={e => setNodeFilter(e.target.value)}>
            <option value="all">All</option>
            {nodeNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Time Range</label>
          <select className="select" value={timeRange} onChange={e => setTimeRange(e.target.value)}>
            {['5m','15m','1h','6h','24h'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Search Pods</label>
          <div className="search-wrapper">
            <I.Search/>
            <input className="search-input" type="text" placeholder="Filter pods..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <section className="grid cards-grid">
        <ACard title="Total Nodes" rawValue={nodes?.totalNodes ?? 0} suffix="" subtitle={`Ready: ${nodes?.readyNodes ?? 0}`} icon="🖥️" iconClass="nodes" delay={1}/>
        <ACard title="Total Pods" rawValue={pods?.totalPods ?? 0} suffix="" subtitle={`Running: ${pods?.summary?.Running ?? 0}`} icon="📦" iconClass="pods" delay={2}/>
        <ACard title="CPU Usage" rawValue={cpu?.totalCpuCores ?? 0} suffix=" cores" digits={3} subtitle="Across all pods" icon="⚡" iconClass="cpu" delay={3}/>
        <ACard title="Memory Usage" rawValue={memory?.totalMemoryMiB ?? 0} suffix=" MiB" digits={1} subtitle="Across all pods" icon="🧠" iconClass="memory" delay={4}/>
      </section>

      {/* Alert Panel */}
      <section className="grid full-width">
        <AlertPanel alerts={alerts} acknowledged={acknowledged} onAcknowledge={handleAck}/>
      </section>

      {/* Charts */}
      <section className="grid charts-grid">
        <div className="card animate-in delay-5">
          <h3>CPU Usage by Pod (Top 10)</h3>
          <ChartBtns cur={cpuChart} set={setCpuChart}/>
          {renderChart(cpuChart, cpuChartData)}
          <p className="chart-hint">Scroll to zoom · Drag to pan · Double-click to reset</p>
        </div>
        <div className="card animate-in delay-6">
          <h3>Memory Usage by Pod (Top 10)</h3>
          <ChartBtns cur={memChart} set={setMemChart}/>
          {renderChart(memChart, memChartData)}
          <p className="chart-hint">Scroll to zoom · Drag to pan · Double-click to reset</p>
        </div>
      </section>

      {/* Tables */}
      <section className="grid tables-grid">
        <div className="card animate-in delay-5">
          <div className="table-header"><h3>Node Status</h3><span className="subtitle">{sortedNodes.length} nodes</span></div>
          <table><thead><tr>
            <th onClick={() => setNodeSortDir(d => d === 'asc' ? 'desc' : 'asc')}>Node{nodeSortDir === 'asc' ? ' ↑' : ' ↓'}</th>
            <th>Status</th>
          </tr></thead><tbody>
            {sortedNodes.map(n => (
              <tr key={n.name}><td style={{fontWeight:500,color:'var(--text-primary)'}}>{n.name}</td>
              <td><StatusBadge status={n.status}/></td></tr>
            ))}
          </tbody></table>
        </div>

        <div className="card animate-in delay-6">
          <div className="table-header">
            <h3>Pod Health</h3>
            <span className="subtitle">{filteredPods.length} pod{filteredPods.length !== 1 ? 's' : ''}</span>
          </div>
          <table><thead><tr>
            <th onClick={() => togglePodSort('namespace')}>NS{sortArrow('namespace', podSortCol, podSortDir)}</th>
            <th onClick={() => togglePodSort('pod')}>Pod{sortArrow('pod', podSortCol, podSortDir)}</th>
            <th onClick={() => togglePodSort('phase')}>Phase{sortArrow('phase', podSortCol, podSortDir)}</th>
            <th>Restarts</th>
          </tr></thead><tbody>
            {filteredPods.slice(0, 25).map(p => (
              <tr key={`${p.namespace}-${p.pod}`} onClick={() => setSelectedPod(p)}>
                <td><span className="ns-tag">{p.namespace}</span></td>
                <td style={{fontWeight:500,color:'var(--text-primary)'}}>{p.pod}</td>
                <td><StatusBadge status={p.phase}/></td>
                <td>{p.restarts || 0}</td>
              </tr>
            ))}
            {filteredPods.length === 0 && <tr><td colSpan={4} style={{textAlign:'center',padding:24,color:'var(--text-muted)'}}>No pods found</td></tr>}
          </tbody></table>
          {filteredPods.length > 25 && <p style={{textAlign:'center',color:'var(--text-muted)',marginTop:12,fontSize:'0.82rem'}}>Showing 25 of {filteredPods.length}</p>}
        </div>
      </section>
    </div>
  );
}

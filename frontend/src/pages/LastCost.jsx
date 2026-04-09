import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = (() => { const host = window.location.hostname || 'localhost'; return `http://${host}:8000`; })();

const formatCurrency = (value) => {
  if (typeof value !== 'number') return '-';
  return 'Rp ' + value.toLocaleString('id-ID');
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID');
};

function LastCost() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    outlet: 'all',
    tipe_item: '',
    year: '',
    start_date: '',
    end_date: '',
    search: ''
  });
  const [tipeItems, setTipeItems] = useState([]);
  const [years, setYears] = useState([]);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async (overrideFilters) => {
    const currentFilters = overrideFilters || filters;
    setLoading(true);
    setError(null);
    try {
      const params = { skip: 0, limit: 1000 };
      if (currentFilters.outlet && currentFilters.outlet !== 'all') params.outlet = currentFilters.outlet;
      if (currentFilters.tipe_item) params.tipe_item = currentFilters.tipe_item;
      if (currentFilters.year) params.year = parseInt(currentFilters.year, 10);
      if (currentFilters.start_date) params.start_date = currentFilters.start_date;
      if (currentFilters.end_date) params.end_date = currentFilters.end_date;
      if (currentFilters.search) params.search = currentFilters.search;

      const response = await axios.get(`${API_BASE}/purchases/aggregate/last_cost`, { params });
      setItems(response.data.items);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const [tipeRes, yearsRes] = await Promise.all([
          axios.get(`${API_BASE}/purchases/distinct/tipe_items`),
          axios.get(`${API_BASE}/purchases/distinct/years`)
        ]);
        if (!isMounted) return;
        setTipeItems(tipeRes.data);
        const sortedYears = yearsRes.data.sort((a, b) => b - a);
        setYears(sortedYears);
        const defaultYear = sortedYears[0] ? String(sortedYears[0]) : '';
        setFilters(prev => ({ ...prev, year: defaultYear }));
        await fetchData({ ...filters, year: defaultYear });
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };
    init();
    return () => { isMounted = false; };
  }, []);


  const handleApplyFilters = (e) => { e?.preventDefault(); fetchData(); };
  const handleClearFilters = () => {
    const cleared = { outlet: 'all', tipe_item: '', year: '', start_date: '', end_date: '', search: '' };
    setFilters(cleared);
    fetchData(cleared);
  };

  const exportCSV = useCallback(() => {
    setExporting(true);
    const headers = ['Item', 'Vendor', 'Tanggal', 'Unit', 'Harga', 'Outlet'];
    const rows = items.map(r => [
      `"${r.item}"`,
      `"${r.vendor}"`,
      r.tanggal || '',
      r.unit || '',
      r.harga != null ? r.harga : '',
      r.outlet || ''
    ]);
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `last_cost_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    setExporting(false);
  }, [items]);

  // Styling
  const cardBg = 'bg-white dark:bg-gray-800';
  const borderClass = 'border border-gray-200 dark:border-gray-700';
  const inputClass = 'mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectClass = inputClass;
  const buttonBase = 'px-4 py-2 rounded-md font-semibold transition-colors disabled:opacity-50';
  const primaryBtn = `${buttonBase} bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600`;
  const secondaryBtn = `${buttonBase} bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200`;

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded relative">
          <strong>Error!</strong> {error}
          <button onClick={() => fetchData()} className="mt-3 bg-red-600 text-white px-4 py-2 rounded">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">💰 Last Cost</h1>
        <button onClick={exportCSV} disabled={exporting || items.length === 0} className={secondaryBtn}>
          📥 Export CSV ({items.length} rows)
        </button>
      </div>

      {/* Filters */}
      <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4 mb-6`}>
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Filters</h2>
        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 md:grid-cols-7 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Outlet</label>
            <select name="outlet" value={filters.outlet} onChange={e => setFilters(prev => ({...prev, outlet: e.target.value}))} className={selectClass}>
              <option value="all">All</option>
              <option value="bandung">Bandung</option>
              <option value="serpong">Serpong</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipe Item</label>
            <select name="tipe_item" value={filters.tipe_item} onChange={e => setFilters(prev => ({...prev, tipe_item: e.target.value}))} className={selectClass}>
              <option value="">All</option>
              {tipeItems.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
            <select name="year" value={filters.year} onChange={e => setFilters(prev => ({...prev, year: e.target.value}))} className={selectClass}>
              <option value="">All</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
            <input type="date" name="start_date" value={filters.start_date} onChange={e => setFilters(prev => ({...prev, start_date: e.target.value}))} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">End Date</label>
            <input type="date" name="end_date" value={filters.end_date} onChange={e => setFilters(prev => ({...prev, end_date: e.target.value}))} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Search Item</label>
            <input
              type="text"
              name="search"
              placeholder="Kode atau nama item"
              value={filters.search}
              onChange={e => setFilters(prev => ({...prev, search: e.target.value}))}
              className={inputClass}
            />
          </div>

          <div className="flex items-end gap-2">
            <button type="button" onClick={handleApplyFilters} disabled={loading} className={primaryBtn}>
              {loading ? '⏳...' : 'Apply'}
            </button>
            <button type="button" onClick={handleClearFilters} className={secondaryBtn}>Clear</button>
          </div>
        </form>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">Loading...</div>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className={`${cardBg} rounded-lg shadow ${borderClass} p-6 text-center text-gray-500 dark:text-gray-400`}>
          No data found.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className={`${cardBg} rounded-lg shadow ${borderClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Item</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Vendor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tanggal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Harga</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Outlet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {items.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={row.item}>{row.item}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={row.vendor}>{row.vendor}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{formatDate(row.tanggal)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-left text-gray-900 dark:text-gray-100">{row.unit}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-900 dark:text-gray-100">{formatCurrency(row.harga)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-left text-gray-900 dark:text-gray-100">{row.outlet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default LastCost;

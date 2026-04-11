import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = window.location.origin;

const formatCurrency = (value) => {
  if (typeof value !== 'number') return '-';
  return 'Rp ' + value.toLocaleString('id-ID');
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID');
};

function PurchaseDetails() {
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
  const [total, setTotal] = useState(0);
  const perPage = 1000; // show all (no pagination)

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
      } catch (err) {
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    init();
    return () => { isMounted = false; };
  }, []);

  const fetchData = useCallback(async (overrideFilters, page = 1) => {
    const currentFilters = overrideFilters || filters;
    setLoading(true);
    setError(null);
    try {
      const skip = (page - 1) * perPage;
      const params = { skip, limit: perPage };
      if (currentFilters.outlet && currentFilters.outlet !== 'all') params.outlet = currentFilters.outlet;
      if (currentFilters.tipe_item) params.tipe_item = currentFilters.tipe_item;
      if (currentFilters.year) params.year = parseInt(currentFilters.year, 10);
      if (currentFilters.start_date) params.start_date = currentFilters.start_date;
      if (currentFilters.end_date) params.end_date = currentFilters.end_date;
      if (currentFilters.search) params.search = currentFilters.search;

      const response = await axios.get(`${API_BASE}/purchases/`, { params });
      setItems(response.data.items);
      setTotal(response.data.total);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleApplyFilters = (e) => {
    e.preventDefault();
    fetchData(filters, 1);
  };
  const handleClearFilters = () => {
    const cleared = { outlet: 'all', tipe_item: '', year: '', start_date: '', end_date: '', search: '' };
    setFilters(cleared);
    fetchData(cleared, 1);
  };

  const handleExportExcel = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.outlet && filters.outlet !== 'all') params.outlet = filters.outlet;
      if (filters.tipe_item) params.tipe_item = filters.tipe_item;
      if (filters.year) params.year = parseInt(filters.year, 10);
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.search) params.search = filters.search;

      const response = await axios.get(`${API_BASE}/import_export/export/excel`, {
        params,
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `purchases_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Styling
  const cardBg = 'bg-white dark:bg-gray-800';
  const borderClass = 'border border-gray-200 dark:border-gray-700';
  const inputClass = 'mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectClass = inputClass;
  const buttonBase = 'px-4 py-2 rounded-md font-semibold transition-colors disabled:opacity-50';
  const primaryBtn = `${buttonBase} bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600`;
  const secondaryBtn = `${buttonBase} bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200`;
  const successBtn = `${buttonBase} bg-green-600 hover:bg-green-700 text-white dark:bg-green-500 dark:hover:bg-green-600`;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">📋 Rincian Purchase</h1>
        <button onClick={handleExportExcel} disabled={loading} className={successBtn}>
          📥 Export Excel ({items.length} rows)
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

      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-6">
          <strong>Error!</strong> {error}
          <button onClick={() => fetchData(filters)} className="ml-3 bg-red-600 text-white px-3 py-1 rounded">Retry</button>
        </div>
      )}

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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Kode Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Kode Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tanggal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Harga</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Kategori</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tipe Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Outlet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {items.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono text-xs">{row.kode_item}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={row.item}>{row.item}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono text-xs">{row.kode_vendor}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={row.vendor}>{row.vendor}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{formatDate(row.tanggal)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{row.qty.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-left text-gray-900 dark:text-gray-100">{row.unit}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.harga)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100 font-semibold">{formatCurrency(row.total)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{row.kategori}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{row.tipe_item}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 capitalize">{row.outlet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-400">
            Showing {items.length.toLocaleString()} of {total.toLocaleString()} entries
          </div>
        </div>
      )}
    </div>
  );
}

export default PurchaseDetails;

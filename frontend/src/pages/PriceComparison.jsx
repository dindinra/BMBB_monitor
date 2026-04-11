import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API_BASE = window.location.origin;

const formatCurrency = (v) => (v != null ? 'Rp ' + v.toLocaleString('id-ID') : '-');

const convertToCSV = (items) => {
  const headers = ['Item', 'Unit', 'Bandung (Rp)', 'Serpong (Rp)', 'Selisih (Rp)', 'Persen (%)'];
  const rows = items.map(item => [
        `"${item.item}"`,
        item.unit || '',
        item.bandung != null ? item.bandung : '',
        item.serpong != null ? item.serpong : '',
        item.selisih != null ? item.selisih : '',
        item.persen != null ? item.persen + '%' : ''
      ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};

function PriceComparison() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    item: '',
    outlet: 'all',
    tipe_item: '',
    year: '',
    start_date: '',
    end_date: ''
  });
  const [tipeItems, setTipeItems] = useState([]);
  const [years, setYears] = useState([]);
  const [total, setTotal] = useState(0);
  const [outlets, setOutlets] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'selisih', direction: 'desc' });
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async (overrideFilters) => {
    const currentFilters = overrideFilters || filters;
    setLoading(true);
    setError(null);
    try {
      const params = { skip: 0, limit: 1000 };
      if (currentFilters.item) params.item = currentFilters.item;
      if (currentFilters.outlet && currentFilters.outlet !== 'all') params.outlet = currentFilters.outlet;
      if (currentFilters.tipe_item) params.tipe_item = currentFilters.tipe_item;
      if (currentFilters.year) params.year = parseInt(currentFilters.year, 10);
      if (currentFilters.start_date) params.start_date = currentFilters.start_date;
      if (currentFilters.end_date) params.end_date = currentFilters.end_date;

      const response = await axios.get(`${API_BASE}/purchases/aggregate/price_by_item`, { params });
      setItems(response.data.items);
      setOutlets(response.data.outlets || []);
      setTotal(response.data.total_items);
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
    const cleared = { item: '', outlet: 'all', tipe_item: '', year: '', start_date: '', end_date: '' };
    setFilters(cleared);
    fetchData(cleared);
  };

  // Sorted items memo (must be before any return)
  const sortedItems = useMemo(() => {
    return [...items].map(item => {
      const bandung = item.bandung || 0;
      const serpong = item.serpong || 0;
      const selisih = bandung - serpong;
      const persen = serpong ? ((selisih / serpong) * 100).toFixed(2) : null;
      return { ...item, selisih, persen };
    }).sort((a, b) => {
      let dir = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'selisih') {
        return dir * ((a.selisih || 0) - (b.selisih || 0));
      } else {
        return dir * (parseFloat(a.persen || 0) - parseFloat(b.persen || 0));
      }
    });
  }, [items, sortConfig]);

  // Styling
  const cardBg = 'bg-white dark:bg-gray-800';
  const borderClass = 'border border-gray-200 dark:border-gray-700';
  const inputClass = 'mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectClass = inputClass;
  const buttonBase = 'px-4 py-2 rounded-md font-semibold transition-colors disabled:opacity-50';
  const primaryBtn = `${buttonBase} bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600`;
  const secondaryBtn = `${buttonBase} bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200`;

  const exportCSV = useCallback(() => {
    setExporting(true);
    const csv = convertToCSV(items);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `price_comparison_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    setExporting(false);
  }, [items]);

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded relative">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
          <button onClick={() => fetchData()} className="mt-3 bg-red-600 text-white px-4 py-2 rounded">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">
          🔍 Price Comparison by Item
        </h1>
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={exporting || items.length === 0} className={secondaryBtn}>
            📥 Export CSV ({items.length} rows)
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4 mb-6`}>
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Filters</h2>
        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {/* Outlet */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Outlet</label>
            <select name="outlet" value={filters.outlet} onChange={e => setFilters(prev => ({...prev, outlet: e.target.value}))} className={selectClass}>
              <option value="all">All</option>
              <option value="bandung">Bandung</option>
              <option value="serpong">Serpong</option>
            </select>
          </div>

          {/* Tipe Item */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipe Item</label>
            <select name="tipe_item" value={filters.tipe_item} onChange={e => setFilters(prev => ({...prev, tipe_item: e.target.value}))} className={selectClass}>
              <option value="">All</option>
              {tipeItems.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
            <select name="year" value={filters.year} onChange={e => setFilters(prev => ({...prev, year: e.target.value}))} className={selectClass}>
              <option value="">All</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
            <input type="date" name="start_date" value={filters.start_date} onChange={e => setFilters(prev => ({...prev, start_date: e.target.value}))} className={inputClass} />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">End Date</label>
            <input type="date" name="end_date" value={filters.end_date} onChange={e => setFilters(prev => ({...prev, end_date: e.target.value}))} className={inputClass} />
          </div>

          {/* Item */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Item (partial)</label>
            <input
              type="text"
              name="item"
              placeholder="Search item..."
              value={filters.item}
              onChange={e => setFilters(prev => ({...prev, item: e.target.value}))}
              className={inputClass}
            />
          </div>

          {/* Buttons */}
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
          No price data available.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className={`${cardBg} rounded-lg shadow ${borderClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Unit
                  </th>
                  {outlets.map(outlet => (
                    <th key={outlet} className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      {outlet.charAt(0).toUpperCase() + outlet.slice(1)} (Rp)
                    </th>
                  ))}
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => setSortConfig({ key: 'selisih', direction: sortConfig.key === 'selisih' && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                  >
                    Selisih (Rp) {sortConfig.key === 'selisih' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => setSortConfig({ key: 'persen', direction: sortConfig.key === 'persen' && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                  >
                    Persen (%) {sortConfig.key === 'persen' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {sortedItems.map((item, idx) => {
                  const { bandung, serpong } = item;
                  const selisih = item.selisih;
                  const isNeg = selisih < 0;
                  const isZero = selisih === 0;
                  return (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm text-blue-600 dark:text-blue-400 hover:underline max-w-xs truncate" title={item.item}>
                        <Link to={`/price-trends?item=${encodeURIComponent(item.item)}&group_by=month`}>
                          {item.item}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.unit || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{bandung != null ? formatCurrency(bandung) : <span className="text-gray-400">-</span>}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{serpong != null ? formatCurrency(serpong) : <span className="text-gray-400">-</span>}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${isZero ? 'text-gray-500' : isNeg ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isZero ? '0' : (isNeg ? '↓ ' : '↑ ')}{(selisih != null ? Math.abs(selisih) : '') ? formatCurrency(Math.abs(selisih)) : ''}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${isZero ? 'text-gray-500' : isNeg ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {item.persen !== null ? (parseFloat(item.persen) > 0 ? '+' : '') + item.persen + '%' : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
            Showing {items.length} items {total > items.length && `(filtered from ${total})`}
          </div>
        </div>
      )}
    </div>
  );
}

export default PriceComparison;

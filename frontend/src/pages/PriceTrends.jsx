import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useSearchParams, Link } from 'react-router-dom';

const API_BASE = (() => { const host = window.location.hostname || 'localhost'; return `http://${host}:8000`; })();

const formatCurrency = (v) => {
  if (v == null) return '-';
  return 'Rp ' + Number(v).toLocaleString('id-ID');
};

const PriceTrends = () => {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    item: '',
    outlet: '',
    start_date: '',
    end_date: '',
    group_by: 'month',
  });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const outlets = ['bandung', 'serpong'];

  const fetchData = useCallback((overrideFilters = {}) => {
    const combinedFilters = { ...filters, ...overrideFilters };
    if (!combinedFilters.item) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(combinedFilters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    const url = `${API_BASE}/purchases/aggregate/price_history?${params.toString()}`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setItems(data.items || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(err => {
        console.error('Fetch error:', err);
        setItems([]);
        setTotal(0);
        setLoading(false);
      });
  }, [filters]);
  useEffect(() => {
    const item = searchParams.get('item');
    const groupBy = searchParams.get('group_by');
    const outlet = searchParams.get('outlet');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    setFilters(prev => ({
      ...prev,
      item: item ?? prev.item,
      group_by: groupBy ?? prev.group_by,
      outlet: outlet ?? prev.outlet,
      start_date: startDate ?? prev.start_date,
      end_date: endDate ?? prev.end_date,
    }));
  }, [searchParams]);


  useEffect(() => {
    if (filters.item) fetchData();
  }, [fetchData]);

  const chartData = (() => {
    if (!filters.item) return [];
    const filtered = items.filter(i => i.item === filters.item);
    const periodMap = {};
    filtered.forEach(entry => {
      const p = entry.period;
      if (!periodMap[p]) periodMap[p] = { period: p };
      periodMap[p][entry.outlet] = entry.avg_price;
    });
    return Object.values(periodMap).sort((a, b) => a.period.localeCompare(b.period));
  })();

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(f => ({ ...f, [name]: value }));
  };

  if (!filters.item) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">📈 Price Trends Monitoring</h1>
        <div className="bg-white dark:bg-gray-800 p-6 rounded shadow border border-gray-200 dark:border-gray-700">
          <p className="mb-2 text-gray-700 dark:text-gray-300">
            No item selected. Please go to <Link to="/price-comparison" className="text-blue-600 dark:text-blue-400 hover:underline">Price Comparison</Link> and click an item to view its price trends.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            You can also manually specify an item by adding <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">?item=...</code> to the URL.
          </p>
        </div>
      </div>
    );
  }

  // Styling
  const cardBg = 'bg-white dark:bg-gray-800';
  const borderClass = 'border border-gray-200 dark:border-gray-700';
  const inputClass = 'block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const buttonBase = 'px-4 py-2 rounded-md font-semibold transition-colors disabled:opacity-50';
  const primaryBtn = `${buttonBase} bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600`;

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-4 text-gray-800 dark:text-white">📈 Price Trends Monitoring</h1>

      <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4 mb-6`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Outlet</label>
            <select name="outlet" value={filters.outlet} onChange={handleFilterChange} className={inputClass}>
              <option value="">All Outlets</option>
              {outlets.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Group By</label>
            <select name="group_by" value={filters.group_by} onChange={handleFilterChange} className={inputClass}>
              <option value="month">Month</option>
              <option value="day">Day</option>
              <option value="year">Year</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
            <input type="date" name="start_date" value={filters.start_date} onChange={handleFilterChange} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
            <input type="date" name="end_date" value={filters.end_date} onChange={handleFilterChange} className={inputClass} />
          </div>
        </div>
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Total records: {total}
          </div>
          <button onClick={() => fetchData()} disabled={loading} className={primaryBtn}>
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4 mb-6`}>
          <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Price Trend: {filters.item}</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="currentColor" className="text-gray-600 dark:text-gray-300" />
              <YAxis tickFormatter={(v) => `Rp ${Number(v).toLocaleString()}`} tick={{ fontSize: 12 }} stroke="currentColor" className="text-gray-600 dark:text-gray-300" />
              <Tooltip formatter={(value) => [formatCurrency(value), 'Avg Price']} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }} />
              <Legend />
              <Line type="monotone" dataKey="bandung" name="Bandung" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="serpong" name="Serpong" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className={`${cardBg} rounded-lg shadow ${borderClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Outlet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Period</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unit</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Avg Price (Rp)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Transactions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {loading ? (
                <tr><td colSpan="6" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No data found</td></tr>
              ) : (
                items.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{row.item}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 capitalize">{row.outlet}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{row.period}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{row.unit}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.avg_price)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{row.txn_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PriceTrends;

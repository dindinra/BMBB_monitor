import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const API_BASE = (() => { const host = window.location.hostname || 'localhost'; return `http://${host}:8000`; })();

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7C43'];

const formatCurrency = (value) => {
  if (typeof value !== 'number') return '-';
  if (value >= 1e12) return 'Rp ' + (value / 1e12).toFixed(2) + ' T';
  if (value >= 1e9) return 'Rp ' + (value / 1e9).toFixed(2) + ' M';
  if (value >= 1e6) return 'Rp ' + (value / 1e6).toFixed(1) + ' Jt';
  return 'Rp ' + value.toLocaleString('id-ID');
};

const formatNumber = (value) => {
  if (typeof value !== 'number') return '-';
  return value.toLocaleString('id-ID');
};

const convertToCSV = (data, headers) => {
  const escaped = data.map(row =>
    headers.map(h => {
      const v = row[h.key];
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(',')
  );
  return [headers.map(h => h.label).join(','), ...escaped].join('\n');
};

function PurchaseDashboard() {
  const [filters, setFilters] = useState({
    outlet: 'all',
    tipe_item: '',
    year: '',
    start_date: '',
    end_date: '',
    top_n: '5'
  });

  const [tipeItems, setTipeItems] = useState([]);
  const [years, setYears] = useState([]);

  const [summary, setSummary] = useState({ total_amount: 0, total_qty: 0, count: 0 });
  const [monthlyData, setMonthlyData] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [topVendors, setTopVendors] = useState([]);
  const [byTipeItem, setByTipeItem] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async (overrideFilters) => {
    const currentFilters = overrideFilters || filters;
    setLoading(true);
    setError(null);
    try {
      const buildParams = () => {
        const p = {};
        if (currentFilters.outlet && currentFilters.outlet !== 'all') p.outlet = currentFilters.outlet;
        if (currentFilters.tipe_item) p.tipe_item = currentFilters.tipe_item;
        if (currentFilters.year) p.year = parseInt(currentFilters.year, 10);
        if (currentFilters.start_date) p.start_date = currentFilters.start_date;
        if (currentFilters.end_date) p.end_date = currentFilters.end_date;
        return p;
      };
      const params = buildParams();
      const limit = parseInt(currentFilters.top_n, 10) || 5;

      const [summaryRes, monthlyRes, itemsRes, vendorsRes, tipeItemRes] = await Promise.all([
        axios.get(`${API_BASE}/purchases/aggregate/summary`, { params }),
        axios.get(`${API_BASE}/purchases/aggregate/monthly`, { params }),
        axios.get(`${API_BASE}/purchases/aggregate/top_items_by_qty`, { params: { ...params, limit } }),
        axios.get(`${API_BASE}/purchases/aggregate/top_vendors`, { params: { ...params, limit } }),
        axios.get(`${API_BASE}/purchases/aggregate/by_tipe_item`, { params })
      ]);

      setSummary(summaryRes.data);
      setMonthlyData(monthlyRes.data);
      setTopItems(itemsRes.data);
      setTopVendors(vendorsRes.data);
      setByTipeItem(tipeItemRes.data);
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
        console.error('Init error:', err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };
    init();
    return () => { isMounted = false; };
  }, []);


  const handleApplyFilters = (e) => {
    e?.preventDefault();
    fetchData();
  };

  const handleClearFilters = () => {
    const cleared = { outlet: 'all', tipe_item: '', year: '', start_date: '', end_date: '', top_n: '5' };
    setFilters(cleared);
    fetchData(cleared);
  };

  const exportMonthlyCSV = useCallback(() => {
    setExporting(true);
    const headers = [
      { label: 'Month', key: 'month' },
      { label: 'Bandung', key: 'bandung' },
      { label: 'Serpong', key: 'serpong' }
    ];
    const csv = convertToCSV(chartData, headers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchase_monthly_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    setExporting(false);
  }, [monthlyData]); // chartData depends on monthlyData, so safe

  const exportTopItemsCSV = useCallback(() => {
    setExporting(true);
    const headers = [
      { label: 'Rank', key: 'rank' },
      { label: 'Item', key: 'item' },
      { label: 'Unit', key: 'unit' },
      { label: 'Total Qty', key: 'total_qty' },
      { label: 'Total Amount', key: 'total_amount' }
    ];
    const data = topItems.map((item, idx) => ({ ...item, rank: idx + 1 }));
    const csv = convertToCSV(data, headers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchase_top_items_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    setExporting(false);
  }, [topItems]);

  const exportTopVendorsCSV = useCallback(() => {
    setExporting(true);
    const headers = [
      { label: 'Rank', key: 'rank' },
      { label: 'Vendor', key: 'vendor' },
      { label: 'Unit', key: 'unit' },
      { label: 'Total Qty', key: 'total_qty' },
      { label: 'Total Amount', key: 'total_amount' }
    ];
    const data = topVendors.map((v, idx) => ({ ...v, rank: idx + 1 }));
    const csv = convertToCSV(data, headers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchase_top_vendors_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    setExporting(false);
  }, [topVendors]);

  // Styling
  const cardBg = 'bg-white dark:bg-gray-800';
  const cardText = 'text-gray-900 dark:text-gray-100';
  const borderClass = 'border border-gray-200 dark:border-gray-700';
  const inputClass = 'mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectClass = inputClass;
  const buttonBase = 'px-4 py-2 rounded-md font-semibold transition-colors disabled:opacity-50';
  const primaryBtn = `${buttonBase} bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600`;
  const secondaryBtn = `${buttonBase} bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200`;

  const chartData = useMemo(() => {
    if (!monthlyData.length) return [];
    const monthMap = {};
    monthlyData.forEach(item => {
      const month = item.month;
      if (!monthMap[month]) monthMap[month] = { month };
      monthMap[month][item.outlet] = Number(item.total_amount);
    });
    const sortedMonths = Object.keys(monthMap).sort();
    return sortedMonths.map(m => monthMap[m]);
  }, [monthlyData]);

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
          📈 Purchase Monitoring
        </h1>
        <div className="flex gap-2">
          <button onClick={exportMonthlyCSV} disabled={exporting || loading} className={secondaryBtn}>
            📊 Monthly CSV
          </button>
          <button onClick={exportTopItemsCSV} disabled={exporting || loading} className={secondaryBtn}>
            📦 Items CSV
          </button>
          <button onClick={exportTopVendorsCSV} disabled={exporting || loading} className={secondaryBtn}>
            🏢 Vendors CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4 mb-6`}>
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Filters</h2>
        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 md:grid-cols-6 gap-4">
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

      {/* Stat Card */}
      <div className={`${cardBg} rounded-lg shadow ${borderClass} p-6 mb-6`}>
        <div className="text-sm text-gray-500 dark:text-gray-400">Total Purchase Amount</div>
        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
          {loading ? '...' : formatCurrency(summary.total_amount)}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Qty: {formatNumber(summary.total_qty)} | Transactions: {formatNumber(summary.count)}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Bar Chart */}
        {!loading && chartData.length > 0 && (
          <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4`}>
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Monthly Purchase by Outlet</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis dataKey="month" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 12 }} stroke="currentColor" className="text-gray-600 dark:text-gray-300" />
                <YAxis tickFormatter={(v) => 'Rp ' + (v / 1e6).toFixed(1) + 'M'} tick={{ fontSize: 12 }} stroke="currentColor" className="text-gray-600 dark:text-gray-300" />
                <Tooltip formatter={(value) => ['Rp ' + value.toLocaleString('id-ID'), '']} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }} />
                <Legend />
                <Bar dataKey="bandung" name="Bandung" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="serpong" name="Serpong" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Pie Chart */}
        {!loading && byTipeItem.length > 0 && (
          <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4`}>
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Purchase by Tipe Item (Amount)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={byTipeItem}
                  dataKey="total_amount"
                  nameKey="tipe_item"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  label={({ tipe_item, percent }) => `${tipe_item} (${(percent * 100).toFixed(0)}%)`}
                >
                  {byTipeItem.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top Items */}
      {!loading && topItems.length > 0 && (
        <div className={`${cardBg} rounded-lg shadow ${borderClass} mb-6 overflow-hidden`}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Top {filters.top_n} Items by Amount</h2>
              <select
                name="top_n_items"
                value={filters.top_n}
                onChange={(e) => {
                  const newFilters = {...filters, top_n: e.target.value};
                  setFilters(newFilters);
                  fetchData(newFilters);
                }}
                className="border-gray-300 dark:border-gray-600 rounded text-sm p-1"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </div>
            <button onClick={exportTopItemsCSV} disabled={exporting} className="text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-1 rounded">
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Item</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty (pcs)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total Amount (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {topItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{idx + 1}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={item.item}>{item.item}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-left text-gray-900 dark:text-gray-100">{item.unit || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatNumber(item.total_qty)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(item.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Vendors */}
      {!loading && topVendors.length > 0 && (
        <div className={`${cardBg} rounded-lg shadow ${borderClass} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Top {filters.top_n} Vendors by Purchase</h2>
              <select
                name="top_n_vendors"
                value={filters.top_n}
                onChange={(e) => {
                  const newFilters = {...filters, top_n: e.target.value};
                  setFilters(newFilters);
                  fetchData(newFilters);
                }}
                className="border-gray-300 dark:border-gray-600 rounded text-sm p-1"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </div>
            <button onClick={exportTopVendorsCSV} disabled={exporting} className="text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-1 rounded">
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Vendor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total Qty (pcs)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total Amount (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {topVendors.map((vendor, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{idx + 1}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={vendor.vendor}>{vendor.vendor}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-left text-gray-900 dark:text-gray-100">{vendor.unit || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatNumber(vendor.total_qty)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(vendor.total_amount)}</td>
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

export default PurchaseDashboard;

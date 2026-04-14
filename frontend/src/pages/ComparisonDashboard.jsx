import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { exportToExcel } from '../utils/excelExport';

const API_BASE = window.location.origin;

// Utility: format currency (small currency)
const formatCurrency = (value) => {
  if (typeof value !== 'number') return '-';
  if (value >= 1e12) return 'Rp ' + (value / 1e12).toFixed(2) + ' T';
  if (value >= 1e9) return 'Rp ' + (value / 1e9).toFixed(2) + ' M';
  if (value >= 1e6) return 'Rp ' + (value / 1e6).toFixed(1) + ' Jt';
  return 'Rp ' + value.toLocaleString('id-ID');
};

// Utility: format number with thousand separators
const formatNumber = (value) => {
  if (typeof value !== 'number') return '-';
  return value.toLocaleString('id-ID');
};

function ComparisonDashboard() {
  // ---- Filters ----
  const [filters, setFilters] = useState({
    outlet: 'all',
    tipe_item: '',
    year: '',
    start_date: '',
    end_date: ''
  });

  // Metadata
  const [salesTipeItems, setSalesTipeItems] = useState([]);
  const [purchaseTipeItems, setPurchaseTipeItems] = useState([]);
  const [years, setYears] = useState([]);

  // Data
  const [salesSummary, setSalesSummary] = useState({ total_amount: 0, total_qty: 0, count: 0 });
  const [purchaseSummary, setPurchaseSummary] = useState({ total_amount: 0, total_qty: 0, count: 0 });
  const [monthlySales, setMonthlySales] = useState([]);
  const [monthlyPurchase, setMonthlyPurchase] = useState([]);
  const [topSalesItems, setTopSalesItems] = useState([]);
  const [topPurchaseItems, setTopPurchaseItems] = useState([]);
  const [topPurchaseVendors, setTopPurchaseVendors] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async (overrideFilters) => {
    const currentFilters = overrideFilters || filters;
    console.log('[fetchData] called, overrideFilters:', overrideFilters, 'currentFilters:', currentFilters);
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

      const [salesSum, purchSum, salesMon, purchMon, salesTop, purchTop, purchVendors] = await Promise.all([
        axios.get(`${API_BASE}/sales/aggregate/summary`, { params }),
        axios.get(`${API_BASE}/purchases/aggregate/summary`, { params }),
        axios.get(`${API_BASE}/sales/aggregate/monthly`, { params }),
        axios.get(`${API_BASE}/purchases/aggregate/monthly`, { params }),
        axios.get(`${API_BASE}/sales/aggregate/top_items_by_qty`, { params: { ...params, limit: 5 } }),
        axios.get(`${API_BASE}/purchases/aggregate/top_items_by_qty`, { params: { ...params, limit: 5 } }),
        axios.get(`${API_BASE}/purchases/aggregate/top_vendors`, { params: { ...params, limit: 5 } })
      ]);

      setSalesSummary(salesSum.data);
      setPurchaseSummary(purchSum.data);
      setMonthlySales(salesMon.data);
      setMonthlyPurchase(purchMon.data);
      setTopSalesItems(salesTop.data);
      setTopPurchaseItems(purchTop.data);
      setTopPurchaseVendors(purchVendors.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
      console.error(err);
    } finally {
      console.log('[fetchData] finally - setLoading(false)');
      setLoading(false);
    }
  }, [filters]);

  // Fetch metadata and initial data (run once)
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    console.log('[ComparisonDashboard] useEffect started');
    let isMounted = true;
    const init = async () => {
      try {
        const [salesTipeRes, purchaseTipeRes, salesYearsRes, purchaseYearsRes] = await Promise.all([
          axios.get(`${API_BASE}/sales/distinct/tipe_items`),
          axios.get(`${API_BASE}/purchases/distinct/tipe_items`),
          axios.get(`${API_BASE}/sales/distinct/years`),
          axios.get(`${API_BASE}/purchases/distinct/years`)
        ]);
        console.log('[ComparisonDashboard] Metadata fetched');
        setSalesTipeItems(salesTipeRes.data);
        setPurchaseTipeItems(purchaseTipeRes.data);
        const allYears = [...new Set([...salesYearsRes.data, ...purchaseYearsRes.data])].sort((a, b) => b - a);
        setYears(allYears);
        const defaultYear = allYears[0] ? String(allYears[0]) : '';
        setFilters(prev => ({ ...prev, year: defaultYear }));
        console.log('[ComparisonDashboard] About to call fetchData with year:', defaultYear);
        // Use fresh filters after defaultYear set
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, filters]);


  // Debounced fetch when filters change via Apply button
  const handleApplyFilters = (e) => {
    e?.preventDefault();
    fetchData();
  };

  const handleClearFilters = () => {
    const cleared = { outlet: 'all', tipe_item: '', year: '', start_date: '', end_date: '' };
    setFilters(cleared);
    fetchData(cleared);
  };

  // Prepare tipe items dropdown (union of both)
  const tipeItemsOptions = useMemo(() => {
    const uniq = [...new Set([...salesTipeItems, ...purchaseTipeItems])].sort();
    return uniq;
  }, [salesTipeItems, purchaseTipeItems]);

  // Prepare monthly combined data
  const combinedMonthlyData = useMemo(() => {
    const monthMap = {};

    monthlySales.forEach(rec => {
      const m = rec.month;
      if (!monthMap[m]) monthMap[m] = { month: m };
      monthMap[m].sales_amount = (monthMap[m].sales_amount || 0) + Number(rec.total_amount);
      monthMap[m].sales_qty = (monthMap[m].sales_qty || 0) + Number(rec.total_qty);
      monthMap[m].sales_count = (monthMap[m].sales_count || 0) + Number(rec.count);
    });

    monthlyPurchase.forEach(rec => {
      const m = rec.month;
      if (!monthMap[m]) monthMap[m] = { month: m };
      monthMap[m].purchase_amount = (monthMap[m].purchase_amount || 0) + Number(rec.total_amount);
      monthMap[m].purchase_qty = (monthMap[m].purchase_qty || 0) + Number(rec.total_qty);
      monthMap[m].purchase_count = (monthMap[m].purchase_count || 0) + Number(rec.count);
    });

    const sortedMonths = Object.keys(monthMap).sort();
    return sortedMonths.map(m => {
      const entry = monthMap[m];
      const sales = entry.sales_amount || 0;
      const purchase = entry.purchase_amount || 0;
      const marginAmt = sales - purchase;
      const marginPct = sales > 0 ? ((sales - purchase) / sales) * 100 : 0;
      return { ...entry, margin_amount: marginAmt, margin_percent: +marginPct.toFixed(2) };
    });
  }, [monthlySales, monthlyPurchase]);

  // Overall margin
  const overallMargin = useMemo(() => {
    const sales = salesSummary.total_amount || 0;
    const purchase = purchaseSummary.total_amount || 0;
    return sales > 0 ? ((sales - purchase) / sales) * 100 : 0;
  }, [salesSummary, purchaseSummary]);

  // Export functions
  const exportMonthlyExcel = useCallback(() => {
    setExporting(true);
    try {
      exportToExcel(combinedMonthlyData, `sales_vs_purchase_monthly_${new Date().toISOString().slice(0,10)}`, 'Sales vs Purchase');
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting to Excel');
    } finally {
      setExporting(false);
    }
  }, [combinedMonthlyData]);

  // ---- Render helpers ----
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
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
          <button onClick={() => fetchData()} className="mt-3 bg-red-600 text-white px-4 py-2 rounded">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">
          📊 Sales vs Purchasing
        </h1>
        <div className="flex gap-2">
          <button onClick={exportMonthlyExcel} disabled={exporting || loading} className={secondaryBtn}>
            {exporting ? 'Exporting...' : '📥 Export Excel'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4 mb-6`}>
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Filters</h2>
        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
              {tipeItemsOptions.map(t => <option key={t} value={t}>{t}</option>)}
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

          {/* Actions */}
          <div className="flex items-end gap-2">
            <button type="button" onClick={handleApplyFilters} disabled={loading} className={primaryBtn}>
              {loading ? '⏳...' : 'Apply'}
            </button>
            <button type="button" onClick={handleClearFilters} className={secondaryBtn}>Clear</button>
          </div>
        </form>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">Loading...</div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className={`${cardBg} rounded-lg shadow ${borderClass} p-6`}>
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Sales</div>
          <div className="text-2xl md:text-3xl font-bold text-green-600 dark:text-green-400">
            {loading ? '...' : formatCurrency(salesSummary.total_amount)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatNumber(salesSummary.total_qty)} qty | {formatNumber(salesSummary.count)} txn
          </div>
        </div>

        <div className={`${cardBg} rounded-lg shadow ${borderClass} p-6`}>
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Purchasing</div>
          <div className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">
            {loading ? '...' : formatCurrency(purchaseSummary.total_amount)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatNumber(purchaseSummary.total_qty)} qty | {formatNumber(purchaseSummary.count)} txn
          </div>
        </div>

        <div className={`${cardBg} rounded-lg shadow ${borderClass} p-6`}>
          <div className="text-sm text-gray-500 dark:text-gray-400">Net Margin</div>
          <div className={`text-2xl md:text-3xl font-bold ${(salesSummary.total_amount - purchaseSummary.total_amount) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {loading ? '...' : formatCurrency(salesSummary.total_amount - purchaseSummary.total_amount)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">vs Sales</div>
        </div>

        <div className={`${cardBg} rounded-lg shadow ${borderClass} p-6`}>
          <div className="text-sm text-gray-500 dark:text-gray-400">Margin %</div>
          <div className={`text-2xl md:text-3xl font-bold ${overallMargin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {loading ? '...' : overallMargin.toFixed(2) + '%'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">overall</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {!loading && combinedMonthlyData.length > 0 && (
          <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4`}>
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Monthly Sales vs Purchasing</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={combinedMonthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis dataKey="month" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 12 }} stroke="currentColor" className="text-gray-600 dark:text-gray-300" />
                <YAxis tickFormatter={(v) => 'Rp ' + (v / 1e9).toFixed(1) + 'B'} tick={{ fontSize: 12 }} stroke="currentColor" className="text-gray-600 dark:text-gray-300" />
                <Tooltip formatter={(value, name) => [formatCurrency(value), name]} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }} />
                <Legend />
                <Bar dataKey="sales_amount" name="Sales" fill="#10b981" radius={[4,4,0,0]} />
                <Bar dataKey="purchase_amount" name="Purchasing" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {!loading && combinedMonthlyData.length > 0 && (
          <div className={`${cardBg} rounded-lg shadow ${borderClass} p-4`}>
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Margin Trend (%)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={combinedMonthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis dataKey="month" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 12 }} stroke="currentColor" className="text-gray-600 dark:text-gray-300" />
                <YAxis tickFormatter={(v) => v.toFixed(1) + '%'} tick={{ fontSize: 12 }} stroke="currentColor" className="text-gray-600 dark:text-gray-300" domain={['auto', 'auto']} />
                <Tooltip formatter={(value) => value.toFixed(2) + '%'} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }} />
                <Legend />
                <Area type="monotone" dataKey="margin_percent" name="Margin %" stroke="#f59e0b" fill="#fbbf24" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Monthly Table */}
      {!loading && combinedMonthlyData.length > 0 && (
        <div className={`${cardBg} rounded-lg shadow ${borderClass} mb-6 overflow-hidden`}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Monthly Overview</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Month</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Sales</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Purchasing</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Margin (Rp)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {combinedMonthlyData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{row.month}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.sales_amount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.purchase_amount)}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${row.margin_amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(row.margin_amount)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${row.margin_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {row.margin_percent.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Items & Vendors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top 5 Sales Items */}
        {!loading && topSalesItems.length > 0 && (
          <div className={`${cardBg} rounded-lg shadow ${borderClass} overflow-hidden`}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Top 5 Sales Items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Rank</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {topSalesItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={item.item}>{item.item}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-left text-gray-900 dark:text-gray-100">{item.unit || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatNumber(item.total_qty)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(item.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top 5 Purchase Items */}
        {!loading && topPurchaseItems.length > 0 && (
          <div className={`${cardBg} rounded-lg shadow ${borderClass} overflow-hidden`}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Top 5 Purchase Items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Rank</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {topPurchaseItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={item.item}>{item.item}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-left text-gray-900 dark:text-gray-100">{item.unit || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatNumber(item.total_qty)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(item.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Top Purchase Vendors */}
      {!loading && topPurchaseVendors.length > 0 && (
        <div className={`${cardBg} rounded-lg shadow ${borderClass} mt-6 overflow-hidden`}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Top 5 Vendors by Purchasing</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Vendor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total Qty</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {topPurchaseVendors.map((v, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{idx + 1}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={v.vendor}>{v.vendor}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-left text-gray-900 dark:text-gray-100">{v.unit || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatNumber(v.total_qty)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(v.total_amount)}</td>
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

export default ComparisonDashboard;

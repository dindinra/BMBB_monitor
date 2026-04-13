import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getInventory, updateBuffer, generatePO, exportInventory, exportGeneratePO } from '../services/inventory';
import './Inventory.css';

const formatCurrency = (value) => {
  if (typeof value !== 'number') return '-';
  return 'Rp ' + value.toLocaleString('id-ID');
};

const STATUS_COLORS = {
  low: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  ok: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
};

function Inventory() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    outlet: '',
    gudang: '',
    kategori: '',
    low_stock_only: false,
    threshold: '',
    search: ''
  });
  const [filterOptions, setFilterOptions] = useState({ outlets: [], gudangs: [], kategoris: [] });
  const [summary, setSummary] = useState({ total_items: 0, low_stock_count: 0, total_value: 0 });
  const [poOpen, setPoOpen] = useState(false);
  const [poItems, setPoItems] = useState([]);
  const [poLoading, setPoLoading] = useState(false);
  const [savingBuffer, setSavingBuffer] = useState({}); // { itemId: true/false }
  const [bufferEdit, setBufferEdit] = useState({}); // { [itemId]: editable value }

  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const sortedData = useMemo(() => {
    if (!sortField) return data;
    return [...data].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA;
      }
      if (typeof valA === 'string' && typeof valB === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Fetch inventory data - NOT auto-triggered on filter change
const fetchData = useCallback(async (overrideFilters = null) => {
    const currentFilters = overrideFilters || filters;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (currentFilters.outlet) params.outlet = currentFilters.outlet;
      if (currentFilters.gudang) params.gudang = currentFilters.gudang;
      if (currentFilters.kategori) params.kategori = currentFilters.kategori;
      if (currentFilters.low_stock_only) params.low_stock_only = true;
      if (currentFilters.threshold) params.threshold = parseInt(currentFilters.threshold, 10);
      if (currentFilters.search) params.search = currentFilters.search;

      const res = await getInventory(params);
      const items = res.data.items || [];
      setData(items);

      // Update filter options from response
      if (res.data.filters) {
        setFilterOptions({
          outlets: res.data.filters.outlets || [],
          gudangs: res.data.filters.gudangs || [],
          kategoris: res.data.filters.kategoris || []
        });
      }

      // Compute summary
      const total_items = items.length;
      const low_stock_count = items.filter(i => i.status === 'low').length;
      const total_value = items.reduce((sum, i) => sum + (i.total || 0), 0);
      setSummary({ total_items, low_stock_count, total_value });
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Init: load data on mount
  useEffect(() => {
    fetchData();
  }, []);

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleApplyFilters = (e) => {
    e?.preventDefault();
    fetchData();
  };

  const handleClearFilters = () => {
    const cleared = {
      outlet: '',
      gudang: '',
      kategori: '',
      low_stock_only: false,
      threshold: '',
      search: ''
    };
    setFilters(cleared);
    fetchData(cleared);
  };

  // Auto-fetch when filters change
  useEffect(() => {
    fetchData();
  }, [filters]);

  // Buffer editing
  const handleBufferChange = (e, itemId) => {
    const value = e.target.value;
    setBufferEdit(prev => ({ ...prev, [itemId]: value }));
  };

  const handleBufferBlur = async (itemId, originalBuffer) => {
    const newVal = bufferEdit[itemId];
    if (newVal === undefined) return;
    const newBuffer = parseInt(newVal, 10);
    if (isNaN(newBuffer) || newBuffer < 0) {
      // invalid: revert
      setBufferEdit(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      return;
    }
    if (newBuffer === originalBuffer) {
      // no change
      setBufferEdit(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      return;
    }
    setSavingBuffer(prev => ({ ...prev, [itemId]: true }));
    try {
      await updateBuffer(itemId, newBuffer);
      // Update local data
      setData(prev => prev.map(row => {
        if (row.inventory_id === itemId) {
          return { ...row, buffer: newBuffer, selisih: row.ending_qty - newBuffer, status: row.ending_qty < newBuffer ? 'low' : 'ok' };
        }
        return row;
      }));
    } catch (err) {
      console.error(err);
      alert('Gagal update buffer');
      // revert to original
      setBufferEdit(prev => ({ ...prev, [itemId]: originalBuffer }));
    } finally {
      setSavingBuffer(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      // Clear edit state so input shows updated row.buffer
      setBufferEdit(prev => {
        if (prev[itemId] !== undefined) {
          const next = { ...prev };
          delete next[itemId];
          return next;
        }
        return prev;
      });
    }
  };

  // Generate PO
  const handleGeneratePO = async () => {
    setPoLoading(true);
    setPoOpen(true);
    try {
      const params = {};
      if (filters.outlet) params.outlet = filters.outlet;
      if (filters.gudang) params.gudang = filters.gudang;
      if (filters.kategori) params.kategori = filters.kategori;
      const res = await generatePO(params);
      setPoItems(res.data.items || []);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
      setPoOpen(false);
    } finally {
      setPoLoading(false);
    }
  };

  // Export inventory to Excel
  const handleExport = () => {
    const params = {};
    if (filters.outlet) params.outlet = filters.outlet;
    if (filters.gudang) params.gudang = filters.gudang;
    if (filters.kategori) params.kategori = filters.kategori;
    if (filters.low_stock_only) params.low_stock_only = true;
    if (filters.threshold) params.threshold = parseInt(filters.threshold, 10);
    exportInventory(params);
  };

  // Compute summary values from data after any updates (e.g., after buffer edit we could update summary, but for simplicity we recalc when data changes)
  useEffect(() => {
    const total_items = data.length;
    const low_stock_count = data.filter(i => i.status === 'low').length;
    const total_value = data.reduce((sum, i) => sum + (i.total || 0), 0);
    setSummary({ total_items, low_stock_count, total_value });
  }, [data]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white">📦 Inventory Monitor</h1>

      {/* Filter Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          {/* Search */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">🔎 Search (Item Code/Name)</label>
            <input
              type="text"
              name="search"
              value={filters.search}
              onChange={handleFilterChange}
              placeholder="cth: HP037 atau Tabung Gas"
              className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Outlet</label>
            <select name="outlet" value={filters.outlet} onChange={handleFilterChange} className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:text-white">
              <option value="">Semua</option>
              {filterOptions.outlets.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Gudang</label>
            <select name="gudang" value={filters.gudang} onChange={handleFilterChange} className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:text-white">
              <option value="">Semua</option>
              {filterOptions.gudangs.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori</label>
            <select name="kategori" value={filters.kategori} onChange={handleFilterChange} className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:text-white">
              <option value="">Semua</option>
              {filterOptions.kategoris.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleApplyFilters} disabled={loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
              {loading ? 'Loading...' : '🔍 Apply'}
            </button>
            <button onClick={handleClearFilters} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200">
              🗑️ Reset
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input type="checkbox" name="low_stock_only" checked={filters.low_stock_only} onChange={handleFilterChange} />
            Hanya low stock
          </label>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-700 dark:text-gray-300">Buffer Threshold (override):</label>
            <input
              type="number"
              name="threshold"
              value={filters.threshold}
              onChange={handleFilterChange}
              placeholder="cth: 100"
              className="w-24 border rounded px-2 py-1 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Items</h3>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{summary.total_items}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Low Stock</h3>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.low_stock_count}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Value</h3>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{formatCurrency(summary.total_value)}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button onClick={handleGeneratePO} disabled={poLoading || data.length === 0} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded disabled:opacity-50">
          📋 Generate PO Suggestion
        </button>
        <button onClick={handleExport} disabled={data.length === 0} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50">
          📥 Export Excel
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>

                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('item_name')}>
                  Item Name {sortField === 'item_name' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('unit')}>
                  Unit {sortField === 'unit' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>

                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('gudang')}>
                  Gudang {sortField === 'gudang' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>

                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('ending_qty')}>
                  Ending Qty {sortField === 'ending_qty' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('buffer')}>
                  Buffer {sortField === 'buffer' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>

                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('total')}>
                  Total {sortField === 'total' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('status')}>
                  Status {sortField === 'status' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('selisih')}>
                  Selisih {sortField === 'selisih' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {sortedData.map(row => (
                <tr key={row.inventory_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">

                  <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-800 dark:text-gray-200">{row.item_name}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">{row.unit}</td>

                  <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">{row.gudang}</td>

                  <td className="px-2 py-2 whitespace-nowrap text-xs text-right text-gray-800 dark:text-gray-200">{row.ending_qty}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">
                    <input
                      type="number"
                      min="0"
                      value={bufferEdit[row.inventory_id] !== undefined ? bufferEdit[row.inventory_id] : row.buffer}
                      onChange={(e) => handleBufferChange(e, row.inventory_id)}
                      onBlur={() => handleBufferBlur(row.inventory_id, row.buffer)}
                      disabled={savingBuffer[row.inventory_id]}
                      className="w-20 text-right border rounded px-2 py-1 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    {savingBuffer[row.inventory_id] && <span className="ml-2 text-xs text-blue-500">...</span>}
                  </td>

                  <td className="px-2 py-2 whitespace-nowrap text-xs text-right text-gray-800 dark:text-gray-200">{formatCurrency(row.total)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[row.status]}`}>{row.status.toUpperCase()}</span>
                  </td>
                  <td className={`px-2 py-2 whitespace-nowrap text-xs text-right font-medium ${row.selisih < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {row.selisih < 0 ? '-' : '+'}{Math.abs(row.selisih)}
                  </td>
                </tr>
              ))}
              {data.length === 0 && !loading && (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    Tidak ada data inventory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate PO Modal */}
      {poOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-2 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">📋 PO Suggestion</h2>
              <button onClick={() => setPoOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {poLoading ? (
                <div className="text-center py-10">Loading suggestions...</div>
              ) : poItems.length === 0 ? (
                <div className="text-center py-10 text-gray-500">No low stock items found for current filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Item Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Item Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Outlet</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Gudang</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ending</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Buffer</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Rec. Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {poItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 text-xs text-gray-800 dark:text-gray-200">{item.item_code}</td>
                        <td className="px-4 py-3 text-xs text-gray-800 dark:text-gray-200">{item.item_name}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{item.outlet}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{item.gudang}</td>
                        <td className="px-4 py-3 text-xs text-right text-gray-600 dark:text-gray-300">{item.ending_qty}</td>
                        <td className="px-4 py-3 text-xs text-right text-gray-600 dark:text-gray-300">{item.buffer}</td>
                        <td className="px-4 py-3 text-xs text-right text-orange-600 dark:text-orange-400 font-medium">{item.recommended_qty}</td>
                        <td className="px-4 py-3 text-xs text-right text-gray-600 dark:text-gray-300">{formatCurrency(item.last_cost)}</td>
                        <td className="px-4 py-3 text-xs text-right text-gray-800 dark:text-gray-200">{formatCurrency(item.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
            <div className="px-2 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => exportGeneratePO(filters)}
                disabled={poItems.length === 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
              >
                Export Excel
              </button>
              <button onClick={() => setPoOpen(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 rounded">
          {error}
        </div>
      )}
    </div>
  );
}

export default Inventory;

import React, { useState } from 'react';
import axios from 'axios';

const API_BASE = window.location.origin;

// Reusable Import Panel component
function ImportPanel({ title, icon, file, setFile, importLoading, handleImport, handleClear, importStatus, clearStatus, removeDuplicates, setRemoveDuplicates }) {
  const cardBg = 'bg-white dark:bg-gray-800';
  const borderClass = 'border border-gray-200 dark:border-gray-700';

  return (
    <div className={`${cardBg} rounded-lg shadow ${borderClass} p-6`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{icon}</span>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">{title} Import</h2>
      </div>

      {/* File Upload */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Pilih File Excel</label>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files[0])}
          className="block w-full text-sm text-gray-500 dark:text-gray-400
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            dark:file:bg-blue-900 dark:file:text-blue-200
            hover:file:bg-blue-100 dark:hover:file:bg-blue-800
          "
        />
        {file && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </div>

      {/* Remove duplicates toggle */}
      <div className="mb-4 flex items-center gap-2">
        <input
          type="checkbox"
          id={`${title}-dedup`}
          checked={removeDuplicates}
          onChange={(e) => setRemoveDuplicates(e.target.checked)}
          className="rounded text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor={`${title}-dedup`} className="text-sm text-gray-700 dark:text-gray-300">
          Hapus duplicate dari file
        </label>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleImport}
          disabled={importLoading || !file}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-md font-medium transition flex items-center gap-2"
        >
          {importLoading ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
              Importing...
            </>
          ) : (
            '🚀 Import'
          )}
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium transition"
        >
          🗑️ Clear All
        </button>
      </div>

      {/* Status messages */}
      {importStatus && (
        <div className={`p-3 rounded border ${importStatus.success ? 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'}`}>
          {importStatus.success ? (
            <div>
              <p className="font-semibold">✅ Import berhasil!</p>
              <pre className="text-xs mt-2 whitespace-pre-wrap">{JSON.stringify(importStatus.data, null, 2)}</pre>
            </div>
          ) : (
            <p>❌ Error: {importStatus.error}</p>
          )}
        </div>
      )}

      {clearStatus && (
        <div className={`p-3 rounded border ${clearStatus.success ? 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'}`}>
          {clearStatus.success ? (
            <p>✅ {clearStatus.data.message || 'All data cleared.'}</p>
          ) : (
            <p>❌ Error: {clearStatus.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Admin() {
  const [activeTab, setActiveTab] = useState('purchase');

  // Purchase states
  const [purchaseFile, setPurchaseFile] = useState(null);
  const [purchaseImportStatus, setPurchaseImportStatus] = useState(null);
  const [purchaseClearStatus, setPurchaseClearStatus] = useState(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseRemoveDuplicates, setPurchaseRemoveDuplicates] = useState(true);
  const [purchaseClearMonth, setPurchaseClearMonth] = useState('');
  const [purchaseClearByMonthStatus, setPurchaseClearByMonthStatus] = useState(null);

  // Sales states
  const [salesFile, setSalesFile] = useState(null);
  const [salesImportStatus, setSalesImportStatus] = useState(null);
  const [salesClearStatus, setSalesClearStatus] = useState(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesRemoveDuplicates, setSalesRemoveDuplicates] = useState(true);
  const [salesClearMonth, setSalesClearMonth] = useState('');
  const [salesClearByMonthStatus, setSalesClearByMonthStatus] = useState(null);

  // Inventory states
  const [inventoryFile, setInventoryFile] = useState(null);
  const [inventoryImportStatus, setInventoryImportStatus] = useState(null);
  const [inventoryClearStatus, setInventoryClearStatus] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryRemoveDuplicates, setInventoryRemoveDuplicates] = useState(true);

  const handlePurchaseImport = async () => {
    if (!purchaseFile) {
      setPurchaseImportStatus({ error: 'Pilih file Excel dulu bre!' });
      return;
    }
    setPurchaseLoading(true);
    setPurchaseImportStatus(null);
    const formData = new FormData();
    formData.append('file', purchaseFile);

    try {
      const url = `${API_BASE}/import_export/import_clean?remove_duplicates=${purchaseRemoveDuplicates}`;
      const res = await axios.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPurchaseImportStatus({ success: true, data: res.data });
      setPurchaseFile(null);
      // Reset file input
      document.getElementById('purchase-file-input') && (document.getElementById('purchase-file-input').value = '');
    } catch (err) {
      setPurchaseImportStatus({ error: err.response?.data?.detail || err.message });
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handlePurchaseClear = async () => {
    if (!window.confirm('Yakin mau hapus SEMUA data purchase? Ga bisa batasin lagi nih!')) return;
    setPurchaseClearStatus(null);
    try {
      const res = await axios.post(`${API_BASE}/import_export/clear`);
      setPurchaseClearStatus({ success: true, data: res.data });
    } catch (err) {
      setPurchaseClearStatus({ error: err.response?.data?.detail || err.message });
    }
  };

  const handlePurchaseClearByMonth = async () => {
    if (!purchaseClearMonth) {
      setPurchaseClearByMonthStatus({ error: 'Pilih bulan dulu!' });
      return;
    }
    const [year, month] = purchaseClearMonth.split('-').map(Number);
    if (!window.confirm(`Yakin mau hapus data purchase untuk ${purchaseClearMonth}?`)) return;
    setPurchaseClearByMonthStatus(null);
    try {
      const res = await axios.post(`${API_BASE}/purchases/clear_by_month?year=${year}&month=${month}`);
      setPurchaseClearByMonthStatus({ success: true, data: res.data });
    } catch (err) {
      setPurchaseClearByMonthStatus({ error: err.response?.data?.detail || err.message });
    }
  };

  const handleSalesImport = async () => {
    if (!salesFile) {
      setSalesImportStatus({ error: 'Pilih file Excel dulu bre!' });
      return;
    }
    setSalesLoading(true);
    setSalesImportStatus(null);
    const formData = new FormData();
    formData.append('file', salesFile);

    try {
      const url = `${API_BASE}/sales/import_clean?remove_duplicates=${salesRemoveDuplicates}`;
      const res = await axios.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSalesImportStatus({ success: true, data: res.data });
      setSalesFile(null);
      document.getElementById('sales-file-input') && (document.getElementById('sales-file-input').value = '');
    } catch (err) {
      setSalesImportStatus({ error: err.response?.data?.detail || err.message });
    } finally {
      setSalesLoading(false);
    }
  };

  const handleSalesClear = async () => {
    if (!window.confirm('Yakin mau hapus SEMUA data sales? Ga bisa batasin lagi nih!')) return;
    setSalesClearStatus(null);
    try {
      const res = await axios.post(`${API_BASE}/sales/clear`);
      setSalesClearStatus({ success: true, data: res.data });
    } catch (err) {
      setSalesClearStatus({ error: err.response?.data?.detail || err.message });
    }
  };

  const handleSalesClearByMonth = async () => {
    if (!salesClearMonth) {
      setSalesClearByMonthStatus({ error: 'Pilih bulan dulu!' });
      return;
    }
    const [year, month] = salesClearMonth.split('-').map(Number);
    if (!window.confirm(`Yakin mau hapus data sales untuk ${salesClearMonth}?`)) return;
    setSalesClearByMonthStatus(null);
    try {
      const res = await axios.post(`${API_BASE}/sales/clear_by_month?year=${year}&month=${month}`);
      setSalesClearByMonthStatus({ success: true, data: res.data });
    } catch (err) {
      setSalesClearByMonthStatus({ error: err.response?.data?.detail || err.message });
    }
  };

  const handleInventoryImport = async () => {
    if (!inventoryFile) {
      setInventoryImportStatus({ error: 'Pilih file Excel dulu bre!' });
      return;
    }
    setInventoryLoading(true);
    setInventoryImportStatus(null);
    const formData = new FormData();
    formData.append('file', inventoryFile);

    try {
      const url = `${API_BASE}/inventory/import?remove_duplicates=${inventoryRemoveDuplicates}`;
      const res = await axios.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setInventoryImportStatus({ success: true, data: res.data });
      setInventoryFile(null);
      // Reset file input
      document.getElementById('inventory-file-input') && (document.getElementById('inventory-file-input').value = '');
    } catch (err) {
      setInventoryImportStatus({ error: err.response?.data?.detail || err.message });
    } finally {
      setInventoryLoading(false);
    }
  };

  const handleInventoryClear = async () => {
    if (!window.confirm('Yakin mau hapus SEMUA data inventory? Ga bisa batasin lagi nih!')) return;
    setInventoryClearStatus(null);
    try {
      const res = await axios.post(`${API_BASE}/inventory/clear`);
      setInventoryClearStatus({ success: true, data: res.data });
    } catch (err) {
      setInventoryClearStatus({ error: err.response?.data?.detail || err.message });
    }
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white mb-6">🔧 Admin Panel</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('purchase')}
            className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'purchase'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            📦 Purchase Import
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'sales'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
           💰 Sales Import
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'inventory'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            📦 Inventory Import
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'purchase' && (
        <>
          <ImportPanel
            title="Purchase"
            icon="📦"
            file={purchaseFile}
            setFile={setPurchaseFile}
            importLoading={purchaseLoading}
            handleImport={handlePurchaseImport}
            handleClear={handlePurchaseClear}
            importStatus={purchaseImportStatus}
            clearStatus={purchaseClearStatus}
            removeDuplicates={purchaseRemoveDuplicates}
            setRemoveDuplicates={setPurchaseRemoveDuplicates}
          />
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-2">🗑️ Clear Purchase by Month</h3>
            <div className="flex items-center gap-4 mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulan:</label>
              <input
                type="month"
                value={purchaseClearMonth}
                onChange={(e) => setPurchaseClearMonth(e.target.value)}
                className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <button
                onClick={handlePurchaseClearByMonth}
                disabled={!purchaseClearMonth}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-md font-medium transition"
              >
                🗑️ Clear by Month
              </button>
            </div>
            {purchaseClearByMonthStatus && (
              <div className={`p-3 rounded border ${purchaseClearByMonthStatus.success ? 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'}`}>
                {purchaseClearByMonthStatus.success ? (
                  <p>✅ {purchaseClearByMonthStatus.data.message}</p>
                ) : (
                  <p>❌ Error: {purchaseClearByMonthStatus.error}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'sales' && (
        <>
          <ImportPanel
            title="Sales"
            icon="💰"
            file={salesFile}
            setFile={setSalesFile}
            importLoading={salesLoading}
            handleImport={handleSalesImport}
            handleClear={handleSalesClear}
            importStatus={salesImportStatus}
            clearStatus={salesClearStatus}
            removeDuplicates={salesRemoveDuplicates}
            setRemoveDuplicates={setSalesRemoveDuplicates}
          />
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-2">🗑️ Clear Sales by Month</h3>
            <div className="flex items-center gap-4 mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulan:</label>
              <input
                type="month"
                value={salesClearMonth}
                onChange={(e) => setSalesClearMonth(e.target.value)}
                className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <button
                onClick={handleSalesClearByMonth}
                disabled={!salesClearMonth}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-md font-medium transition"
              >
                🗑️ Clear by Month
              </button>
            </div>
            {salesClearByMonthStatus && (
              <div className={`p-3 rounded border ${salesClearByMonthStatus.success ? 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'}`}>
                {salesClearByMonthStatus.success ? (
                  <p>✅ {salesClearByMonthStatus.data.message}</p>
                ) : (
                  <p>❌ Error: {salesClearByMonthStatus.error}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'inventory' && (
        <ImportPanel
          title="Inventory"
          icon="📦"
          file={inventoryFile}
          setFile={setInventoryFile}
          importLoading={inventoryLoading}
          handleImport={handleInventoryImport}
          handleClear={handleInventoryClear}
          importStatus={inventoryImportStatus}
          clearStatus={inventoryClearStatus}
          removeDuplicates={inventoryRemoveDuplicates}
          setRemoveDuplicates={setInventoryRemoveDuplicates}
        />
      )}
    </div>
  );
}

export default Admin;

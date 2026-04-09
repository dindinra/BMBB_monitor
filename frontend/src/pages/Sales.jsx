import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = (() => { const host = window.location.hostname || 'localhost'; return `http://${host}:8000`; })();

function Sales() {
  const [file, setFile] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [clearStatus, setClearStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [removeDuplicates, setRemoveDuplicates] = useState(true);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setImportStatus(null);
  };

  const handleImport = async () => {
    if (!file) {
      setImportStatus({ error: 'Pilih file Excel dulu bre!' });
      return;
    }
    setLoading(true);
    setImportStatus(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const url = `${API_BASE}/sales/import_clean?remove_duplicates=${removeDuplicates}`;
      const res = await axios.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportStatus({ success: true, data: res.data });
    } catch (err) {
      setImportStatus({ error: err.response?.data?.detail || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Yakin mau hapus SEMUA data sales? Action ini tidak bisa dibatalkan.')) {
      return;
    }
    setClearStatus(null);
    try {
      const res = await axios.post(`${API_BASE}/sales/clear`);
      setClearStatus({ success: true, data: res.data });
    } catch (err) {
      setClearStatus({ error: err.response?.data?.detail || err.message });
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">📦 Data Sales</h1>

      {/* Import Section */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-3 text-blue-700">📥 Import Excel</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload file .xlsx/.xls. Pilihan deduplikasi bisa diubah.
        </p>

        <div className="flex flex-col space-y-4">
          {/* File input */}
          <div className="flex items-center space-x-4">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="block file:mr-4 file:py-2 file:px-4 file:border-2 file:border-blue-500 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <button
              onClick={handleImport}
              disabled={loading || !file}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded"
            >
              {loading ? 'Proses...' : 'Import'}
            </button>
          </div>

          {/* Deduplication checkbox */}
          <div className="flex items-start space-x-2 p-3 bg-gray-50 rounded border">
            <input
              type="checkbox"
              id="removeDuplicates"
              checked={removeDuplicates}
              onChange={(e) => setRemoveDuplicates(e.target.checked)}
              className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div>
              <label htmlFor="removeDuplicates" className="font-medium text-gray-800 cursor-pointer">
                Hapus duplicate dari file
              </label>
              <p className="text-xs text-gray-600 mt-1">
                {removeDuplicates
                  ? '✓ Aktif: Baris dengan nilai sama persis pada 10 field required akan dihilangkan sebelum import.'
                  : '✗ Nonaktif: Semua baris akan di-insert termasuk yang terduplikasi di dalam file.'}
              </p>
            </div>
          </div>
        </div>

        {/* Import Status */}
        {importStatus && (
          <div className={`mt-4 p-4 rounded ${importStatus.error ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {importStatus.error ? (
              <p>❌ Error: {importStatus.error}</p>
            ) : (
              <div>
                <p className="font-semibold mb-2">✅ {importStatus.data.message}</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div className="bg-white bg-opacity-50 p-3 rounded">
                    <div className="text-2xl font-bold">{importStatus.data.summary.total_rows_in_file.toLocaleString()}</div>
                    <div className="text-xs uppercase opacity-75">Total File Rows</div>
                  </div>
                  <div className="bg-white bg-opacity-50 p-3 rounded">
                    <div className="text-2xl font-bold text-orange-600">{importStatus.data.summary.duplicate_rows_removed_from_file.toLocaleString()}</div>
                    <div className="text-xs uppercase opacity-75">Duplicates in File</div>
                  </div>
                  <div className="bg-white bg-opacity-50 p-3 rounded">
                    <div className="text-2xl font-bold text-blue-600">{importStatus.data.summary.existing_records_replaced.toLocaleString()}</div>
                    <div className="text-xs uppercase opacity-75">DB Replaced</div>
                  </div>
                  <div className="bg-white bg-opacity-50 p-3 rounded">
                    <div className="text-2xl font-bold text-green-600">{importStatus.data.summary.new_records_inserted.toLocaleString()}</div>
                    <div className="text-xs uppercase opacity-75">New Inserted</div>
                  </div>
                  <div className="bg-white bg-opacity-50 p-3 rounded">
                    <div className="text-2xl font-bold">{importStatus.data.total_rows_after_import.toLocaleString()}</div>
                    <div className="text-xs uppercase opacity-75">Total Now</div>
                  </div>
                </div>
                <div className="text-sm space-y-2">
                  <p><strong>What happened?</strong></p>
                  <ul className="list-disc ml-5 space-y-1">
                    <li>File contains <strong>{importStatus.data.summary.total_rows_in_file.toLocaleString()} rows</strong>. Among them, <strong>{importStatus.data.summary.duplicate_rows_removed_from_file.toLocaleString()} rows</strong> are duplicates based on the combination of 10 required fields and were excluded from import.</li>
                    <li>The system then compared the remaining <strong>{importStatus.data.summary.new_records_inserted.toLocaleString()} unique rows</strong> against existing records in the database. Any existing records with exactly the same values for all required fields were considered duplicates and were <strong>deleted</strong> before inserting the new data.</li>
                    <li>As a result, <strong>{importStatus.data.summary.existing_records_replaced.toLocaleString()} old records</strong> were removed and <strong>{importStatus.data.summary.new_records_inserted.toLocaleString()} new records</strong> were inserted. The database now contains <strong>{importStatus.data.total_rows_after_import.toLocaleString()} total sales records</strong>.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clear Database Button */}
        <div className="mt-6 pt-4 border-t">
          <button
            onClick={handleClear}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Clear All Sales Data
          </button>
          {clearStatus && (
            <div className={`mt-2 p-3 rounded ${clearStatus.error ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {clearStatus.error ? (
                <p>❌ Error: {clearStatus.error}</p>
              ) : (
                <p>✅ {clearStatus.data.message}. Records deleted: {clearStatus.data.records_deleted}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 text-sm text-gray-600">
        <p>Required columns in Excel:</p>
        <ul className="list-disc ml-6 mt-1">
          <li>tanggal (date)</li>
          <li>kode_item</li>
          <li>item</li>
          <li>kategori</li>
          <li>qty</li>
          <li>unit</li>
          <li>harga</li>
          <li>total</li>
          <li>tipe_item</li>
          <li>outlet</li>
          <li>bulan, hari, minggu, tahun (optional but recommended)</li>
          <li>source_name (optional)</li>
        </ul>
      </div>
    </div>
  );
}

export default Sales;

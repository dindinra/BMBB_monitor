import React, { useState } from 'react';

function PurchaseList({ purchases, loading }) {
  const [sortConfig, setSortConfig] = useState({ key: 'tanggal', direction: 'desc' });

  const sortedPurchases = React.useMemo(() => {
    let sortable = [...purchases];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortable;
  }, [purchases, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded shadow text-center">
        <div className="animate-pulse text-gray-500">Loading purchases...</div>
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <div className="bg-white p-6 rounded shadow text-center text-gray-500">
        No purchase data available.
      </div>
    );
  }

  return (
    <div className="bg-white rounded shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {[
                { key: 'tanggal', label: 'Date' },
                { key: 'outlet', label: 'Outlet' },
                { key: 'item', label: 'Item' },
                { key: 'vendor', label: 'Vendor' },
                { key: 'qty', label: 'Qty' },
                { key: 'harga', label: 'Price' },
                { key: 'total', label: 'Total' },
                { key: 'kategori', label: 'Category' }
              ].map(col => (
                <th
                  key={col.key}
                  onClick={() => requestSort(col.key)}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  {col.label}{getSortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedPurchases.map((purchase, idx) => (
              <tr key={purchase.id || idx} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{purchase.tanggal}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{purchase.outlet}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate" title={purchase.item}>
                  {purchase.item}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{purchase.vendor}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{purchase.qty}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {new Intl.NumberFormat('id-ID').format(purchase.harga)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                  {new Intl.NumberFormat('id-ID').format(purchase.total)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{purchase.kategori}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PurchaseList;
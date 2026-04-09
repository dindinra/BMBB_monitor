import React from 'react';

function StatCard({ title, value, unit, format = 'number' }) {
  const formatValue = () => {
    if (format === 'currency') {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
      }).format(value);
    }
    return new Intl.NumberFormat('id-ID').format(value);
  };

  return (
    <div className="bg-white p-6 rounded shadow">
      <div className="text-sm text-gray-600 uppercase tracking-wide">{title}</div>
      <div className="mt-2 text-4xl font-bold text-gray-900">
        {formatValue()}
        {unit && <span className="text-lg font-normal text-gray-600 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

export default StatCard;
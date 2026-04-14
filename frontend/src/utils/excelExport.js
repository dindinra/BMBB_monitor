import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Export data to Excel file
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Filename without extension
 * @param {string} sheetName - Excel sheet name (default: 'Sheet1')
 */
export const exportToExcel = (data, filename = 'export', sheetName = 'Sheet1') => {
  try {
    // Create a new workbook
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Generate Excel file
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw error;
  }
};

/**
 * Format currency for Excel export
 * @param {number} value - Currency value
 * @returns {string} Formatted currency string
 */
export const formatCurrencyForExport = (value) => {
  if (typeof value !== 'number') return value;
  return value.toLocaleString('id-ID');
};

/**
 * Format number for Excel export
 * @param {number} value - Number value
 * @returns {string} Formatted number string
 */
export const formatNumberForExport = (value) => {
  if (typeof value !== 'number') return value;
  return value.toLocaleString('id-ID');
};

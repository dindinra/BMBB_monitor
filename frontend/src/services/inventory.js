import axios from 'axios';

// Dynamically construct API base based on current hostname
const API_BASE = window.location.origin;

export const getInventory = (params = {}) =>
  axios.get(`${API_BASE}/inventory`, { params });

export const updateBuffer = (inventoryId, buffer) => {
  return axios.patch(`${API_BASE}/inventory/${inventoryId}/buffer`, { buffer });
};
export const generatePO = (params = {}) =>
  axios.get(`${API_BASE}/inventory/generate_po`, { params });

export const importInventory = (file, removeDuplicates = true) => {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post(`${API_BASE}/inventory/import?remove_duplicates=${removeDuplicates}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const exportInventory = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE}/inventory/export?${query}`;
  // Open in new tab to trigger download without leaving the page
  window.open(url, '_blank');
};

export const exportGeneratePO = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE}/inventory/generate_po/export?${query}`;
  window.open(url, '_blank');
};

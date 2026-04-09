import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import ComparisonDashboard from './pages/ComparisonDashboard';
import PurchaseDashboard from './pages/PurchaseDashboard';
import PriceComparison from './pages/PriceComparison';
import LastCost from './pages/LastCost';
import PriceTrends from './pages/PriceTrends';
import Admin from './pages/Admin';
import PurchaseDetails from './pages/PurchaseDetails';
import SalesDashboard from './pages/SalesDashboard';
import Inventory from './pages/Inventory';
import Sidebar from './components/Sidebar';
import AIAssistant from './components/AIAssistant';
import './index.css';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
          <Sidebar />
          <div className="flex-1 overflow-auto">
            <main className="container mx-auto p-4 md:p-6">
              <Routes>
                <Route path="/" element={<ComparisonDashboard />} />
                <Route path="/purchase" element={<PurchaseDashboard />} />
                <Route path="/price-comparison" element={<PriceComparison />} />
                <Route path="/last-cost" element={<LastCost />} />
                <Route path="/price-trends" element={<PriceTrends />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/purchase-details" element={<PurchaseDetails />} />
                <Route path="/sales" element={<SalesDashboard />} />
                <Route path="/inventory" element={<Inventory />} />
              </Routes>
            </main>
          </div>
        </div>
      </Router>
      {/* Floating AI Assistant */}
      <AIAssistant />
    </ThemeProvider>
  );
}

export default App;

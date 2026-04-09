import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

function Sidebar() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [openDropdown, setOpenDropdown] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    {
      path: '/',
      label: 'Dashboard',
      icon: '📊'
    },
    {
      path: '/purchase',
      label: 'Purchase',
      icon: '📈',
      children: [
        { path: '/purchase', label: 'Dashboard' },
        { path: '/price-comparison', label: 'Price Comparison' },
        { path: '/last-cost', label: 'Last Cost' },
        { path: '/purchase-details', label: 'Rincian Purchase' }
      ]
    },
    { path: '/inventory', label: 'Inventory', icon: '📦' },
    { path: '/sales', label: 'Sales', icon: '💰' },
    { path: '/admin', label: 'Admin', icon: '🔧' }
  ];

  const toggleDropdown = (label) => {
    setOpenDropdown(openDropdown === label ? null : label);
  };

  const isChildActive = (children) => {
    return children?.some(child => location.pathname === child.path);
  };

  // Helper: link class based on active state
  const linkClass = (isActive, dark = false) => {
    const base = 'flex items-center px-4 py-3 rounded transition-colors';
    if (isActive) {
      return `${base} bg-blue-600 text-white ${dark ? 'dark:bg-blue-700' : ''}`;
    }
    return `${base} hover:bg-gray-700 text-gray-300 dark:hover:bg-gray-600`;
  };

  // Sub-link class
  const subLinkClass = (isActive) => {
    if (isActive) {
      return 'block px-4 py-2 rounded transition-colors bg-blue-500 text-white';
    }
    return 'block px-4 py-2 rounded transition-colors hover:bg-gray-700 text-gray-300';
  };

  // Mobile sidebar overlay
  const sidebarContent = (
    <>
      {/* Header with logo + theme toggle + mobile close */}
      <div className="flex items-center justify-between mb-6 mt-2">
        <h2 className="text-xl font-bold text-white truncate">BMBB Monitor</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-gray-700 text-yellow-400"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {/* Mobile close button */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-2 rounded hover:bg-gray-700 text-white"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Mobile nav items */}
      <nav className="space-y-2 flex-1">
        {navItems.map(item => {
          const hasChildren = item.children && item.children.length > 0;
          const isActive = location.pathname === item.path || (hasChildren && isChildActive(item.children));
          const isOpen = openDropdown === item.label;

          return (
            <div key={item.path} className="relative">
              <div className={linkClass(isActive, true)}>
                <Link
                  to={item.path}
                  className="flex items-center flex-1"
                  onClick={(e) => {
                    if (!hasChildren) {
                      // On mobile, close menu after navigation
                      if (window.innerWidth < 768) setMobileMenuOpen(false);
                    } else {
                      toggleDropdown(item.label);
                    }
                  }}
                >
                  <span className="mr-3 text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
                {hasChildren && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      toggleDropdown(item.label);
                    }}
                    className={`focus:outline-none ${isActive ? 'text-white' : 'text-gray-300'}`}
                  >
                    <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </button>
                )}
              </div>

              {/* Dropdown */}
              {hasChildren && isOpen && (
                <div className="mt-1 ml-6 space-y-1">
                  {item.children.map(child => (
                    <Link
                      key={child.path}
                      to={child.path}
                      onClick={() => {
                        setOpenDropdown(null);
                        if (window.innerWidth < 768) setMobileMenuOpen(false);
                      }}
                      className={subLinkClass(location.pathname === child.path)}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="text-xs text-gray-400 mt-auto pt-4 text-center">
        Built by Abdul AI
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button - fixed top */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded shadow-lg"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {mobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-40
          w-64 bg-gray-800 text-white
          transform transition-transform duration-300 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          flex flex-col p-4
        `}
      >
        {sidebarContent}
      </aside>

      {/* Spacer for mobile to avoid content under sidebar */}
      <div className="md:hidden h-12" />
    </>
  );
}

export default Sidebar;

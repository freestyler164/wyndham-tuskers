import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoUrl from '../public/static/logos/wt_logo.png';

const menuItems = [
  { label: 'Home', to: '/' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'About Us', to: '/about' },
];

function SiteNav() {
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const role = localStorage.getItem('role');

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('role');
    setAccountOpen(false);
    setMobileOpen(false);
    navigate('/');
  };

  const closeMenus = () => {
    setAccountOpen(false);
    setMobileOpen(false);
  };

  const accountControl = (
    role ? (
      <div className="account-menu">
        <button
          className="btn btn-primary account-trigger"
          type="button"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((value) => !value)}
        >
          Logged in
          <span aria-hidden="true">v</span>
        </button>
        {accountOpen && (
          <div className="account-dropdown">
            <span className="account-role">{role}</span>
            {role === 'admin' && <Link to="/admin/surveys" onClick={closeMenus}>Admin portal</Link>}
            <button type="button" onClick={logout}>Logout</button>
          </div>
        )}
      </div>
    ) : (
      <Link className="btn btn-primary" to="/login" onClick={closeMenus}>Admin Login</Link>
    )
  );

  return (
    <header className="site-header">
      <Link className="brand" to="/" aria-label="Wyndham Tuskers home" onClick={closeMenus}>
        <div className="brand-mark">
          <img src={logoUrl} alt="" />
        </div>
        <div className="brand-copy">
          <strong>Wyndham Tuskers</strong>
        </div>
      </Link>

      <button
        className="mobile-menu-button"
        type="button"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      <nav className="site-nav" aria-label="Main navigation">
        {menuItems.map((item) => (
          item.to ? (
            <Link key={item.label} to={item.to} onClick={closeMenus}>{item.label}</Link>
          ) : (
            <a key={item.label} href={item.href} onClick={closeMenus}>{item.label}</a>
          )
        ))}
      </nav>

      <div className="header-actions">
        {accountControl}
      </div>

      <div className={`mobile-menu ${mobileOpen ? 'is-open' : ''}`}>
        <nav aria-label="Mobile navigation">
          {menuItems.map((item) => (
            item.to ? (
              <Link key={item.label} to={item.to} onClick={closeMenus}>{item.label}</Link>
            ) : (
              <a key={item.label} href={item.href} onClick={closeMenus}>{item.label}</a>
            )
          ))}
        </nav>
        <div className="mobile-menu-actions">
          {accountControl}
        </div>
      </div>
    </header>
  );
}

export default SiteNav;

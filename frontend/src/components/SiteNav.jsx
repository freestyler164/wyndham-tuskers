import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchJson } from '../api.js';
import logoUrl from '../public/static/logos/wt_logo.png';

const menuItems = [
  { label: 'Home', to: '/' },
  { label: 'Club News', to: '/club-news' },
  { label: 'Member Marketplace', to: '/marketplace' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'About Us', to: '/about' },
];

function SiteNav() {
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [onamMenu, setOnamMenu] = useState(null);
  const [showPaintingMenu, setShowPaintingMenu] = useState(false);
  const navigate = useNavigate();
  const role = localStorage.getItem('role');
  const scopes = JSON.parse(localStorage.getItem('scopes') || '[]');
  const canJudgePainting = role === 'guest' && scopes.includes('painting:judge');
  const canManageOnamSchedule = role === 'guest' && scopes.includes('onam-schedule:manage');

  useEffect(() => {
    fetchJson('/config')
      .then((config) => {
        setOnamMenu(config.onamSchedulePublished ? {
          label: config.onamScheduleMenuLabel || 'Onam 2026',
          to: '/onam-2026',
        } : null);
        setShowPaintingMenu(Boolean(config.paintingCompetitionPublic));
      })
      .catch(() => {
        setOnamMenu(null);
        setShowPaintingMenu(false);
      });
  }, []);

  const visibleMenuItems = useMemo(() => {
    const items = [...menuItems.slice(0, 3)];
    if (showPaintingMenu) items.push({ label: 'Onam Art', to: '/onam-painting-competition' });
    if (onamMenu) items.push(onamMenu);
    return [...items, ...menuItems.slice(3)];
  }, [onamMenu, showPaintingMenu]);

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('role');
    localStorage.removeItem('scopes');
    localStorage.removeItem('authExpiresAt');
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
            {canJudgePainting && <Link to="/admin/painting-competition" onClick={closeMenus}>Painting judging</Link>}
            {canManageOnamSchedule && <Link to="/admin/onam-schedule" onClick={closeMenus}>Onam scheduler</Link>}
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
        {visibleMenuItems.map((item) => (
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
          {visibleMenuItems.map((item) => (
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

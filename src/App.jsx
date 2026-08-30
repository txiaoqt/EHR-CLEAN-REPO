import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/sidebar/Sidebar.jsx';
import PatientSidebar from './components/sidebar/PatientSidebar.jsx';
import PatientHeader from './components/header/PatientHeader.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Appointments from './pages/Appointments.jsx';
import Patients from './pages/Patients.jsx';
import Encounter from './pages/Encounter.jsx';
import Encounters from './pages/Encounters.jsx';
import PatientProfile from './pages/PatientProfile.jsx';
import Reports from './pages/Reports.jsx';
import Inventory from './pages/Inventory.jsx';
import Help from './pages/Help.jsx';
import Events from './pages/Events.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import MyProfile from './pages/MyProfile.jsx';
import PatientDashboard from './pages/patient/PatientDashboard.jsx';
import PatientEvents from './pages/patient/PatientEvents.jsx';
import PatientSchedule from './pages/patient/PatientSchedule.jsx';
import PatientMessages from './pages/patient/PatientMessages.jsx';
import PatientRecords from './pages/patient/PatientRecords.jsx';
import PatientProfilePortal from './pages/patient/PatientProfilePortal.jsx';
import KioskBooking from './pages/patient/KioskBooking.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import PCAccessRequired from './components/PCAccessRequired.jsx';
import { useStaffDeviceCheck } from './hooks/useStaffDeviceCheck.js';
import { useSidebar } from './useSidebar.js';
import './styles/main.css';
import { exportCsv } from './utils.js';
import { useAuth } from './AuthContext.jsx';
import { useTheme, normalizeTheme } from './ThemeContext.jsx';
import { getClinicHoursMessage, hasRequiredRole, isWithinClinicHours } from './accessControl.js';

const DEPLOY_SURFACE = (import.meta.env.VITE_DEPLOY_SURFACE || 'admin').toLowerCase();
const IS_ADMIN_SURFACE = DEPLOY_SURFACE === 'admin';
const IS_USER_SURFACE = DEPLOY_SURFACE === 'user';

const getRoleHome = (role) => ((role || '').toLowerCase() === 'patient' ? '/patient/dashboard' : '/dashboard');
const isPatientRole = (role) => (role || '').toLowerCase() === 'patient';

const ProtectedRoute = ({
  isAuthenticated,
  isPasswordRecoverySession,
  user,
  loading,
  initializing,
  allowedRoles = [],
  isStaffProtected = false,
  isStaffDeviceSupported = true,
  viewport,
  logout,
  children
}) => {
  const location = useLocation();

  // If password recovery is active across any tab, block protected portal routes and redirect to /reset-password
  if (isPasswordRecoverySession) {
    return <Navigate to="/reset-password" replace />;
  }

  // Wait for Supabase auth session to finish restoring before rendering
  if (loading || initializing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--muted)' }}>
        Loading session...
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isWithinClinicHours()) return <Navigate to="/login" replace state={{ sessionMessage: getClinicHoursMessage() }} />;

  const userRole = (user?.role || '').toLowerCase();
  const isRoleAllowedOnSurface = IS_ADMIN_SURFACE ? userRole !== 'patient' : userRole === 'patient';
  if (!isRoleAllowedOnSurface) {
    const errorMessage = IS_ADMIN_SURFACE && userRole === 'patient'
      ? 'Patient accounts are not allowed on this portal.'
      : 'Only patient accounts can log in on this portal.';
    return <Navigate to="/login" replace state={{ sessionMessage: errorMessage }} />;
  }

  if (!hasRequiredRole(user, allowedRoles)) {
    const fallbackHome = IS_USER_SURFACE ? '/patient/dashboard' : '/dashboard';
    if (location.pathname === fallbackHome) {
      return <Navigate to="/login" replace state={{ sessionMessage: 'You do not have permission to access this page.' }} />;
    }
    return <Navigate to={fallbackHome} replace />;
  }
  if (isStaffProtected && !isStaffDeviceSupported) {
    return <PCAccessRequired viewport={viewport} onLogout={logout} />;
  }
  return children;
};

function AppShell() {
  const { isAuthenticated, user, loading, initializing, logout, isPasswordRecoverySession } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebar();
  const autoLogoutInProgressRef = useRef(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const { isSupported: isStaffDeviceSupported, viewport } = useStaffDeviceCheck();

  useEffect(() => { document.title = 'TUP Clinic EHR'; }, []);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    window.exportCsv = exportCsv;
    return () => {
      delete window.exportCsv;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || isPasswordRecoverySession) {
      autoLogoutInProgressRef.current = false;
      return;
    }

    let mounted = true;
    const enforceClinicHours = async () => {
      if (!isWithinClinicHours() && !autoLogoutInProgressRef.current) {
        autoLogoutInProgressRef.current = true;
        try {
          await logout();
        } catch (e) {
          console.error('Auto-logout failed');
        } finally {
          if (mounted) navigate('/login', { replace: true, state: { sessionMessage: getClinicHoursMessage() } });
          autoLogoutInProgressRef.current = false;
        }
      }
    };

    enforceClinicHours();
    const intervalId = setInterval(enforceClinicHours, 30000);
    return () => { mounted = false; clearInterval(intervalId); };
  }, [isAuthenticated, isPasswordRecoverySession, logout, navigate]);

  // Gating order: Evaluate PC/Laptop Access Safeguard BEFORE session initialization and Login
  if (IS_ADMIN_SURFACE && !isStaffDeviceSupported) {
    return <PCAccessRequired viewport={viewport} onLogout={isAuthenticated ? logout : undefined} />;
  }

  // Gate entire AppShell rendering until Supabase Auth session & profile are initialized
  if (loading || initializing) {
    return (
      <div
        id="app-loading"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          color: 'var(--muted)',
          fontFamily: 'inherit',
          fontSize: '15px'
        }}
      >
        Loading session...
      </div>
    );
  }

  const guard = (element, allowedRoles = []) => (
    <ProtectedRoute
      isAuthenticated={isAuthenticated}
      isPasswordRecoverySession={isPasswordRecoverySession}
      user={user}
      loading={loading}
      initializing={initializing}
      allowedRoles={allowedRoles}
      isStaffProtected={IS_ADMIN_SURFACE}
      isStaffDeviceSupported={isStaffDeviceSupported}
      viewport={viewport}
      logout={logout}
    >
      {element}
    </ProtectedRoute>
  );

  const userRole = (user?.role || '').toLowerCase();
  const isRoleAllowedOnSurface = Boolean(
    user && (IS_ADMIN_SURFACE ? userRole !== 'patient' : userRole === 'patient')
  );
  const canAccessAuthenticatedHome = isAuthenticated && isRoleAllowedOnSurface && !isPasswordRecoverySession && isWithinClinicHours();
  const roleHome = getRoleHome(user?.role);
  const surfaceHome = IS_USER_SURFACE ? '/patient/dashboard' : '/dashboard';

  const shouldRenderSidebar = canAccessAuthenticatedHome && (!IS_ADMIN_SURFACE || isStaffDeviceSupported);

  return (
    <div id="app-root" className={sidebarCollapsed ? 'sidebar-collapsed' : ''}>
      {shouldRenderSidebar && (
        <div id="sidebar-container" className={`sidebar-container ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {IS_USER_SURFACE ? (
            <PatientSidebar
              collapsed={!isMobile && sidebarCollapsed}
              toggle={toggleSidebar}
              onClose={isMobile && !sidebarCollapsed ? toggleSidebar : undefined}
            />
          ) : (
            <Sidebar collapsed={sidebarCollapsed} toggle={toggleSidebar} />
          )}
        </div>
      )}
      {shouldRenderSidebar && IS_USER_SURFACE && (
        <>
          <PatientHeader onToggleNav={toggleSidebar} />
          {isMobile && !sidebarCollapsed && (
            <button
              type="button"
              aria-label="Close navigation"
              className="mobile-sidebar-backdrop"
              onClick={toggleSidebar}
            />
          )}
        </>
      )}

      <Routes>
        <Route path="/" element={isPasswordRecoverySession ? <Navigate to="/reset-password" replace /> : (canAccessAuthenticatedHome ? <Navigate to={surfaceHome} replace /> : <Navigate to="/login" replace />)} />
        <Route path="/login" element={isPasswordRecoverySession ? <Navigate to="/reset-password" replace /> : (canAccessAuthenticatedHome ? <Navigate to={surfaceHome} replace /> : <Login />)} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {IS_ADMIN_SURFACE && (
          <>
            <Route path="/dashboard" element={guard(<Dashboard />, ['admin', 'physician', 'nurse'])} />
            <Route path="/appointments" element={guard(<Appointments />, ['admin', 'physician', 'nurse'])} />
            <Route path="/patients" element={guard(<Patients />, ['admin', 'physician', 'nurse'])} />
            <Route path="/encounter" element={guard(<Encounter />, ['admin', 'physician', 'nurse'])} />
            <Route path="/encounters" element={guard(<Encounters />, ['admin', 'physician', 'nurse'])} />
            <Route path="/reports" element={guard(<Reports />, ['admin', 'physician', 'nurse'])} />
            <Route path="/inventory" element={guard(<Inventory />, ['admin', 'physician', 'nurse'])} />
            <Route path="/events" element={guard(<Events />, ['admin', 'physician', 'nurse'])} />
            <Route path="/help" element={guard(<Help />, ['admin', 'physician', 'nurse'])} />
            <Route path="/settings" element={guard(<Settings />, ['admin', 'physician', 'nurse'])} />
            <Route path="/my-profile" element={guard(<MyProfile />, ['admin', 'physician', 'nurse'])} />
            <Route path="/patient-profile" element={guard(<PatientProfile />, ['admin', 'physician', 'nurse'])} />
          </>
        )}

        {IS_USER_SURFACE && (
          <>
            <Route path="/kiosk" element={<KioskBooking />} />
            <Route path="/patient/dashboard" element={guard(<PatientDashboard />, ['patient'])} />
            <Route path="/patient/events" element={guard(<PatientEvents />, ['patient'])} />
            <Route path="/patient/schedule" element={guard(<PatientSchedule />, ['patient'])} />
            <Route path="/patient/messages" element={guard(<PatientMessages />, ['patient'])} />
            <Route path="/patient/records" element={guard(<PatientRecords />, ['patient'])} />
            <Route path="/patient/profile" element={guard(<PatientProfilePortal />, ['patient'])} />
          </>
        )}

        <Route path="*" element={<Navigate to={isPasswordRecoverySession ? '/reset-password' : (canAccessAuthenticatedHome ? surfaceHome : '/login')} replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;

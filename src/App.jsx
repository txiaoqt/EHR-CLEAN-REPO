import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/sidebar/Sidebar.jsx';
import StaffTopBar from './components/header/StaffTopBar.jsx';
import PatientSidebar from './components/sidebar/PatientSidebar.jsx';
import PatientHeader from './components/header/PatientHeader.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Appointments from './pages/Appointments.jsx';
import Patients from './pages/Patients.jsx';
import Encounter from './pages/Encounter.jsx';
import MedicalLog from './pages/MedicalLog.jsx';
import PatientProfile from './pages/PatientProfile.jsx';
import Reports from './pages/Reports.jsx';
import Inventory from './pages/Inventory.jsx';
import Help from './pages/Help.jsx';
import StaffPatientMessages from './pages/StaffPatientMessages.jsx';
import Events from './pages/Events.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import BackupRecovery from './pages/BackupRecovery.jsx';
import EnrolleeHome from './pages/enrollee/EnrolleeHome.jsx';
import EnrolleeMessages from './pages/enrollee/EnrolleeMessages.jsx';
import EnrolleeProfile from './pages/enrollee/EnrolleeProfile.jsx';
import Enrollees from './pages/Enrollees.jsx';
import ArchiveFiles from './pages/ArchiveFiles.jsx';
import EnrolleeReview from './pages/EnrolleeReview.jsx';
import AuditTrail from './pages/AuditTrail.jsx';
import MyProfile from './pages/MyProfile.jsx';
import PatientDashboard from './pages/patient/PatientDashboard.jsx';
import PatientEvents from './pages/patient/PatientEvents.jsx';
import PatientSchedule from './pages/patient/PatientSchedule.jsx';
import PatientMessages from './pages/patient/PatientMessages.jsx';
import PatientRecords from './pages/patient/PatientRecords.jsx';
import PatientProfilePortal from './pages/patient/PatientProfilePortal.jsx';
import PatientSettings from './pages/patient/PatientSettings.jsx';
import PatientHelp from './pages/patient/PatientHelp.jsx';
import KioskBooking from './pages/patient/KioskBooking.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import PCAccessRequired from './components/PCAccessRequired.jsx';
import PolicyAgreement from './components/PolicyAgreement.jsx';
import LegalPolicy from './pages/LegalPolicy.jsx';
import useAppPolicy from './hooks/useAppPolicy.js';
import { StaffPresenceProvider } from './StaffPresenceContext.jsx';
import { useStaffDeviceCheck } from './hooks/useStaffDeviceCheck.js';
import { useSidebar } from './useSidebar.js';
import './styles/main.css';
import { exportCsv } from './utils.js';
import { useAuth } from './AuthContext.jsx';
import { useTheme, normalizeTheme } from './ThemeContext.jsx';
import { getClinicHoursMessage, hasRequiredRole, isWithinClinicHours } from './accessControl.js';
import {
  DEPLOY_SURFACE,
  IS_ADMIN_SURFACE,
  IS_USER_SURFACE,
  isRoleCompatibleWithSurface,
  isUserSurfaceRole as isUserSurfaceRoleOf,
  surfaceHomeForRole,
} from './deploySurface.js';

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
  // An enrollee belongs on the user surface: they are an applicant, not staff,
  // and they sign in with a personal address on the same portal patients use.
  // The rule comes from deploySurface.js rather than being restated here.
  const userSurfaceRole = isUserSurfaceRoleOf(userRole);
  const isRoleAllowedOnSurface = IS_ADMIN_SURFACE ? !userSurfaceRole : userSurfaceRole;
  if (!isRoleAllowedOnSurface) {
    const errorMessage = IS_ADMIN_SURFACE
      ? 'Student accounts are not allowed on this portal.'
      : 'Only student accounts can log in on this portal.';
    return <Navigate to="/login" replace state={{ sessionMessage: errorMessage }} />;
  }

  if (!hasRequiredRole(user, allowedRoles)) {
    const fallbackHome = IS_USER_SURFACE ? surfaceHomeForRole(userRole) : '/dashboard';
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
  const { isAuthenticated, user, session, loading, initializing, logout, isPasswordRecoverySession, registrationInProgress } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublicPolicyPath = ['/privacy', '/terms'].includes(location.pathname);
  const policyBackgroundLocation = isPublicPolicyPath &&
    location.state?.policyBackgroundLocation?.pathname === '/login'
    ? location.state.policyBackgroundLocation : null;
  const isRecoveryPath = ['/auth/callback', '/reset-password'].includes(location.pathname);
  const policyCheckEnabled = Boolean(
    IS_USER_SURFACE && isAuthenticated && isUserSurfaceRoleOf(user?.role) &&
    !loading && !initializing && !registrationInProgress &&
    !isPasswordRecoverySession && !isRecoveryPath && !isPublicPolicyPath
  );
  const policyAgreement = useAppPolicy({
    enabled: policyCheckEnabled,
    accountId: session?.user?.id || user?.auth_user_id || user?.id || null,
  });
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

  // Text density is a PATIENT-PORTAL preference (set in PatientSettings). It was
  // read from a single localStorage key on BOTH surfaces, so a patient choosing
  // "compact" also changed the staff portal — and logging out did not undo it,
  // because the stored key outlives the session.
  //
  // The staff portal pins its own density here rather than reading storage, so
  // no patient's preference can change it. Currently: normal (a 14px baseline).
  useEffect(() => {
    if (!IS_USER_SURFACE) {
      document.documentElement.setAttribute('data-density', 'normal');
      return undefined;
    }

    try {
      const savedDensity = localStorage.getItem('tup-clinic-density') || 'normal';
      const normalized = savedDensity === 'compact' || savedDensity === 'comfortable' ? savedDensity : 'normal';
      document.documentElement.setAttribute('data-density', normalized);
    } catch (_) {}

    const onDensityChange = (e) => {
      const density = e?.detail?.density;
      if (density) {
        document.documentElement.setAttribute('data-density', density);
      }
    };
    window.addEventListener('tupDensityChanged', onDensityChange);
    return () => window.removeEventListener('tupDensityChanged', onDensityChange);
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
          fontSize: 'var(--font-size-base)'
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
  const isRoleAllowedOnSurface = Boolean(user && isRoleCompatibleWithSurface(userRole));
  const canAccessAuthenticatedHome = isAuthenticated && isRoleAllowedOnSurface && !isPasswordRecoverySession && !registrationInProgress && isWithinClinicHours();
  const roleHome = getRoleHome(user?.role);
  const surfaceHome = IS_USER_SURFACE ? surfaceHomeForRole(user?.role) : '/dashboard';

  const shouldRenderSidebar = canAccessAuthenticatedHome && !isPublicPolicyPath && (!IS_ADMIN_SURFACE || isStaffDeviceSupported);

  // No dashboard, sidebar, record form, or protected page mounts until the
  // database confirms acceptance. Failed policy checks also keep the gate shut.
  if (policyCheckEnabled && (!policyAgreement.ready ||
    (policyAgreement.required && !policyAgreement.accepted))) {
    return (
      <PolicyAgreement policy={policyAgreement.policy} checking={policyAgreement.checking}
        error={policyAgreement.error} saving={policyAgreement.saving}
        onRetry={policyAgreement.refresh} onAccept={policyAgreement.accept}
        onDecline={async () => {
          await logout({ scope: 'local' });
          navigate('/login', { replace: true, state: {
            sessionMessage: 'You were signed out. Agreement is required before continuing to the portal.',
          } });
        }}
      />
    );
  }

  if (registrationInProgress && !isPublicPolicyPath && !isRecoveryPath && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      id="app-root"
      className={[
        sidebarCollapsed ? 'sidebar-collapsed' : '',
        shouldRenderSidebar && !IS_USER_SURFACE ? 'has-staff-topbar' : '',
        isPublicPolicyPath ? 'public-policy-view' : '',
      ].filter(Boolean).join(' ')}
    >
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

      {shouldRenderSidebar && !IS_USER_SURFACE && <StaffTopBar />}

      {/* Retain the auth form in memory during a same-tab policy visit. The
          hidden screen cannot be read or focused while the policy is open. */}
      <div className="policy-route-content" hidden={Boolean(policyBackgroundLocation)}>
      <Routes location={policyBackgroundLocation || location}>
        <Route path="/privacy" element={<LegalPolicy type="privacy" />} />
        <Route path="/terms" element={<LegalPolicy type="terms" />} />
        <Route path="/" element={isPasswordRecoverySession ? <Navigate to="/reset-password" replace /> : (canAccessAuthenticatedHome ? <Navigate to={surfaceHome} replace /> : <Navigate to="/login" replace />)} />
        <Route path="/login" element={isPasswordRecoverySession ? <Navigate to="/reset-password" replace /> : (canAccessAuthenticatedHome ? <Navigate to={surfaceHome} replace /> : <Login />)} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {IS_ADMIN_SURFACE && (
          <>
            <Route path="/dashboard" element={guard(<Dashboard />, ['admin', 'physician', 'nurse'])} />
            <Route path="/appointments" element={guard(<Appointments />, ['admin', 'physician', 'nurse'])} />
            <Route path="/patients" element={guard(<Patients />, ['admin', 'physician', 'nurse'])} />
            <Route path="/enrollees" element={guard(<Enrollees />, ['admin', 'physician', 'nurse'])} />
            <Route path="/archive-files" element={guard(<ArchiveFiles />, ['admin', 'physician', 'nurse'])} />
            <Route path="/enrollees/:enrolleeId/review" element={guard(<EnrolleeReview />, ['admin', 'physician', 'nurse'])} />
            <Route path="/encounter" element={guard(<Encounter />, ['admin', 'physician', 'nurse'])} />
            <Route path="/medical-log" element={guard(<MedicalLog />, ['admin', 'physician', 'nurse'])} />
            <Route path="/reports" element={guard(<Reports />, ['admin', 'physician', 'nurse'])} />
            <Route path="/inventory" element={guard(<Inventory />, ['admin', 'physician', 'nurse'])} />
            <Route path="/events" element={guard(<Events />, ['admin', 'physician', 'nurse'])} />
            <Route path="/patient-messages" element={guard(<StaffPatientMessages />, ['admin', 'physician', 'nurse'])} />
            <Route path="/messages" element={guard(<StaffPatientMessages />, ['admin', 'physician', 'nurse'])} />
            <Route path="/help" element={guard(<Help />, ['admin', 'physician', 'nurse'])} />
            <Route path="/settings" element={guard(<Settings />, ['admin', 'physician', 'nurse'])} />
            <Route path="/backup-recovery" element={guard(<BackupRecovery />, ['admin', 'physician'])} />
            <Route path="/audit-trail" element={guard(<AuditTrail />, ['admin', 'physician'])} />
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
            <Route path="/patient/settings" element={guard(<PatientSettings />, ['patient'])} />
            <Route path="/patient/help" element={guard(<PatientHelp />, ['patient'])} />
            <Route path="/enrollee/home" element={guard(<EnrolleeHome />, ['enrollee'])} />
            <Route path="/enrollee/messages" element={guard(<EnrolleeMessages />, ['enrollee'])} />
            <Route path="/enrollee/profile" element={guard(<EnrolleeProfile />, ['enrollee'])} />
          </>
        )}

        <Route path="*" element={<Navigate to={isPasswordRecoverySession ? '/reset-password' : (canAccessAuthenticatedHome ? surfaceHome : '/login')} replace />} />
      </Routes>
      </div>
      {policyBackgroundLocation && <LegalPolicy type={location.pathname === '/privacy' ? 'privacy' : 'terms'} />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <StaffPresenceProvider>
        <AppShell />
      </StaffPresenceProvider>
    </Router>
  );
}

export default App;

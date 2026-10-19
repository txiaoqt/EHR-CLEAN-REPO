/**
 * Runs the real src/deploySurface.js and checks the surface/role matrix.
 *
 * It imports the actual module rather than restating the rule, because a copy of
 * the logic passes even when the code it is meant to guard is broken — which is
 * exactly how four call sites drifted apart in the first place.
 *
 * The module reads import.meta.env, so it is bundled with Vite's SSR build
 * before running.
 *
 * Run: node src/scripts/test_deploy_surface_matrix.mjs
 */
import { createServer } from 'vite';
import path from 'node:path';

let total = 0;
let passed = 0;
const check = (condition, message) => {
  total += 1;
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
};

const server = await createServer({
  configFile: path.join(process.cwd(), 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const mod = await server.ssrLoadModule('/src/deploySurface.js');
  const { isUserSurfaceRole, isRoleCompatibleWithSurface, surfaceHomeForRole, accountTableForRole } = mod;

  console.log('\n=== roles on the USER surface (student portal) ===');
  check(isUserSurfaceRole('patient'), 'patient is a user-surface role');
  check(isUserSurfaceRole('enrollee'), 'enrollee is a user-surface role — the bug this fixes');
  check(isUserSurfaceRole('Enrollee'), 'role matching is case-insensitive');
  check(!isUserSurfaceRole('nurse'), 'nurse is not a user-surface role');
  check(!isUserSurfaceRole('admin'), 'admin is not a user-surface role');
  check(!isUserSurfaceRole(''), 'an empty role is not a user-surface role');

  console.log('\n=== destinations ===');
  check(surfaceHomeForRole('enrollee') === '/enrollee/home', 'an enrollee lands on their own portal');
  check(surfaceHomeForRole('patient') === '/patient/dashboard', 'a patient lands on the student dashboard');
  check(surfaceHomeForRole('nurse') === '/dashboard', 'staff land on the staff dashboard');

  console.log('\n=== login counter tables ===');
  check(accountTableForRole('patient') === 'users', 'patient counters live in users');
  check(accountTableForRole('enrollee') === 'users', 'enrollee counters live in users');
  check(accountTableForRole('nurse') === 'admins', 'staff counters live in admins');

  console.log('\n=== surface compatibility (this build is the admin surface) ===');
  // The test build uses the default surface, which is admin.
  check(!isRoleCompatibleWithSurface('patient'), 'admin surface refuses a patient');
  check(!isRoleCompatibleWithSurface('enrollee'), 'admin surface refuses an enrollee');
  check(isRoleCompatibleWithSurface('nurse'), 'admin surface accepts a nurse');
  check(isRoleCompatibleWithSurface('admin'), 'admin surface accepts an admin');
  check(!isRoleCompatibleWithSurface(''), 'an empty role is refused everywhere');
} finally {
  await server.close();
}

console.log(`\n${passed} / ${total} checks passed`);
process.exit(passed === total ? 0 : 1);

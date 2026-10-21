import assert from 'node:assert/strict';
import { createServer } from 'vite';
let checks = 0;
const matrix = { admin: ['admin'], staff: ['physician', 'nurse'], user: ['patient', 'enrollee'] };
for (const [mode, allowed] of Object.entries(matrix)) {
  const server = await createServer({ mode, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const rules = await server.ssrLoadModule('/src/deploySurface.js');
    assert.equal(rules.DEPLOY_SURFACE, mode);
    for (const role of ['admin', 'physician', 'nurse', 'patient', 'enrollee', 'unknown', '']) {
      assert.equal(rules.isRoleCompatibleWithSurface(role), allowed.includes(role), mode + ' / ' + role);
      checks += 1;
    }
    assert.equal(rules.surfaceHomeForRole('admin'), '/admin/overview');
    assert.equal(rules.surfaceHomeForRole('physician'), '/dashboard');
    assert.equal(rules.surfaceHomeForRole('patient'), '/patient/dashboard');
    assert.equal(rules.surfaceHomeForRole('enrollee'), '/enrollee/home');
    assert.equal(rules.accountTableForRole('nurse'), 'admins');
    assert.equal(rules.accountTableForRole('enrollee'), 'users');
    checks += 6;
  } finally { await server.close(); }
}
console.log('PASS: ' + checks + ' deployment role/destination checks across admin, staff, and user modes.');

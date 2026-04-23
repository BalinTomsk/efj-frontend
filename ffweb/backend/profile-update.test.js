const assert = require('node:assert/strict');
const { normalizeProfileUpdate, isLoopbackNetwork } = require('./profile-update');

function run() {
  const preservedUsernameResult = normalizeProfileUpdate(
    { email: ' updated@fishfind.info ', cell: ' 555-0110 ' },
    { username: 'captainfish' }
  );

  assert.deepEqual(preservedUsernameResult, {
    username: 'captainfish',
    email: 'updated@fishfind.info',
    cell: '555-0110'
  });

  const phoneAliasResult = normalizeProfileUpdate(
    { email: 'captain@fishfind.info', phone: ' 555-0199 ' },
    { username: 'captainfish' }
  );

  assert.equal(phoneAliasResult.cell, '555-0199');

  const missingEmailResult = normalizeProfileUpdate({}, { username: 'captainfish' });
  assert.deepEqual(missingEmailResult, { error: 'Email is required' });

  assert.equal(isLoopbackNetwork({ rawIp: '::1', ip6: '::1' }), true);
  assert.equal(isLoopbackNetwork({ rawIp: '127.0.0.1', ip4: '127.0.0.1' }), true);
  assert.equal(isLoopbackNetwork({ rawIp: '203.0.113.10', ip4: '203.0.113.10' }), false);

  console.log('profile-update tests passed');
}

run();

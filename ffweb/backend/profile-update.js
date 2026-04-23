function normalizeProfileUpdate(body = {}, existingUser = {}) {
  const usernameFromBody = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phoneFromBody = typeof body.phone === 'string' ? body.phone.trim() : '';
  const cellFromBody = typeof body.cell === 'string' ? body.cell.trim() : '';

  const username = usernameFromBody || (typeof existingUser.username === 'string' ? existingUser.username.trim() : '');
  const cell = phoneFromBody || cellFromBody;

  if (!username) {
    return { error: 'Username is required' };
  }

  if (!email) {
    return { error: 'Email is required' };
  }

  return {
    username,
    email,
    cell
  };
}

function isLoopbackNetwork(network = {}) {
  const ip4 = typeof network.ip4 === 'string' ? network.ip4.trim() : '';
  const ip6 = typeof network.ip6 === 'string' ? network.ip6.trim().toLowerCase() : '';
  const rawIp = typeof network.rawIp === 'string' ? network.rawIp.trim().toLowerCase() : '';

  return ip4 === '127.0.0.1'
    || ip6 === '::1'
    || rawIp === '127.0.0.1'
    || rawIp === '::1'
    || rawIp === 'localhost';
}

module.exports = {
  normalizeProfileUpdate,
  isLoopbackNetwork
};

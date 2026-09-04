const baseUrl = process.env.MYTUSKERS_API_URL || 'http://localhost:4100';

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${text}`);
  }
  return { response, body };
};

const login = async (username) => {
  const result = await request('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password: 'Password123!' }),
  });
  const cookie = result.response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error(`Missing session cookie for ${username}`);
  return cookie;
};

const main = async () => {
  await request('/health');
  const cookie = await login('+61400000123');
  await request('/v1/me', { headers: { cookie } });
  await request('/v1/teams/team-1xi/home', { headers: { cookie } });
  await request('/v1/teams/team-1xi/wallet/me/transactions', { headers: { cookie } });
  await request('/v1/teams/team-1xi/matches', { headers: { cookie } });
  await request('/v1/teams/team-1xi/matches/match-1xi-hoppers', { headers: { cookie } });
  await request('/v1/teams/team-1xi/matches/match-1xi-hoppers/availability/me', {
    method: 'PUT',
    headers: { cookie },
    body: JSON.stringify({ status: 'AVAILABLE' }),
  });

  const captainCookie = await login('+61400000111');
  await request('/v1/teams/team-1xi/captain/dashboard', { headers: { cookie: captainCookie } });
  const invite = await request('/v1/teams/team-1xi/invites', {
    method: 'POST',
    headers: { cookie: captainCookie },
    body: JSON.stringify({}),
  });
  if (!invite.body.invite?.token) throw new Error('Captain invite creation failed');
  await request('/v1/teams/team-1xi/players/user-ravi/wallet/credits', {
    method: 'POST',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ amountMinor: 1000, reason: 'Smoke credit' }),
  });

  const adminCookie = await login('+61473623614');
  await request('/v1/admin/teams', { headers: { cookie: adminCookie } });
  await request('/v1/admin/users', { headers: { cookie: adminCookie } });
  await request('/v1/admin/audit', { headers: { cookie: adminCookie } });
  console.log('MyTuskers API smoke test passed.');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

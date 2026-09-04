const baseUrl = process.env.MYTUSKERS_API_URL || 'http://localhost:4100';

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  return { response, body };
};

const expectStatus = async (path, expectedStatus, options = {}) => {
  const result = await request(path, options);
  if (result.response.status !== expectedStatus) {
    throw new Error(`${options.method || 'GET'} ${path} expected ${expectedStatus}, got ${result.response.status}: ${JSON.stringify(result.body)}`);
  }
  return result;
};

const login = async (username) => {
  const result = await expectStatus('/v1/auth/login', 200, {
    method: 'POST',
    body: JSON.stringify({ username, password: 'Password123!' }),
  });
  const cookie = result.response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error(`Missing session cookie for ${username}`);
  return cookie;
};

const main = async () => {
  await expectStatus('/health', 200);
  await expectStatus('/v1/auth/login', 401, {
    method: 'POST',
    body: JSON.stringify({ username: '+61499999999', password: 'Password123!' }),
  });
  await expectStatus('/v1/auth/otp/request', 410, {
    method: 'POST',
    body: JSON.stringify({ phone: '+61400000123' }),
  });
  const signup = await expectStatus('/v1/auth/signup', 201, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Integration New User',
      email: `integration-${Date.now()}@example.test`,
      phone: `+614${String(Date.now()).slice(-8)}`,
      password: 'Password123!',
    }),
  });
  if (!signup.body.verificationUrl) throw new Error('Local signup should return verificationUrl for testing.');
  const signupCookie = signup.response.headers.get('set-cookie')?.split(';')[0];
  if (!signupCookie) throw new Error('Missing session cookie for signup user.');

  const playerCookie = await login('+61400000123');
  const captainCookie = await login('+61400000111');
  const t20CaptainCookie = await login('+61400000112');
  const adminCookie = await login('+61473623614');

  await expectStatus('/v1/admin/teams', 403, { headers: { cookie: playerCookie } });
  await expectStatus('/v1/teams/team-1xi/captain/dashboard', 403, { headers: { cookie: playerCookie } });
  await expectStatus('/v1/teams/team-1xi/players/user-ravi/wallet/credits', 403, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ amountMinor: 1000, reason: 'Should fail' }),
  });

  await expectStatus('/v1/teams/team-1xi/captain/dashboard', 200, { headers: { cookie: captainCookie } });
  await expectStatus('/v1/admin/teams', 403, { headers: { cookie: captainCookie } });
  await expectStatus('/v1/teams/team-t20/captain/dashboard', 403, { headers: { cookie: captainCookie } });
  await expectStatus('/v1/teams/team-1xi/players/user-ravi/wallet/adjustments', 200, {
    method: 'POST',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ amountMinor: -500, reason: 'Integration correction' }),
  });
  await expectStatus('/v1/teams/team-1xi/members/user-dan/role', 200, {
    method: 'PATCH',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ role: 'TEAM_ADMIN' }),
  });
  await expectStatus('/v1/teams/team-1xi/captain/dashboard', 200, { headers: { cookie: t20CaptainCookie } });

  const topup = await expectStatus('/v1/teams/team-t20/wallet/me/topups', 201, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ amountMinor: 5000, paymentConfirmed: true, note: 'Integration topup' }),
  });
  await expectStatus(`/v1/teams/team-t20/topups/${topup.body.request.requestId}/approve`, 200, {
    method: 'POST',
    headers: { cookie: t20CaptainCookie },
  });

  const draftDetail = await expectStatus('/v1/teams/team-t20/matches/match-t20-pointcook', 200, { headers: { cookie: playerCookie } });
  if (draftDetail.body.lineup !== null || !draftDetail.body.lineupHiddenReason) {
    throw new Error('Player should not see draft lineup for T20 match.');
  }

  await expectStatus('/v1/admin/teams', 200, { headers: { cookie: adminCookie } });
  await expectStatus('/v1/admin/users', 200, { headers: { cookie: adminCookie } });
  await expectStatus('/v1/admin/audit', 200, { headers: { cookie: adminCookie } });
  await expectStatus('/v1/teams/team-1xi/captain/dashboard', 200, { headers: { cookie: adminCookie } });

  const publishedDetail = await expectStatus('/v1/teams/team-1xi/matches/match-1xi-hoppers', 200, { headers: { cookie: playerCookie } });
  const awardRecipient = publishedDetail.body.lineup.startingPlayers.find((player) => player.userId);
  await expectStatus('/v1/teams/team-1xi/matches/match-1xi-hoppers/award', 403, {
    method: 'PUT',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ recipientUserId: awardRecipient.userId, reason: 'Should fail' }),
  });
  await expectStatus('/v1/teams/team-1xi/matches/match-1xi-hoppers/award', 400, {
    method: 'PUT',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ recipientUserId: 'user-not-in-lineup', reason: 'Should fail' }),
  });
  const award = await expectStatus('/v1/teams/team-1xi/matches/match-1xi-hoppers/award', 200, {
    method: 'PUT',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ recipientUserId: awardRecipient.userId, reason: 'Strong leadership' }),
  });
  if (award.body.award.recipientUserId !== awardRecipient.userId) throw new Error('Captain award recipient was not saved.');
  const awardRead = await expectStatus('/v1/teams/team-1xi/matches/match-1xi-hoppers/award', 200, { headers: { cookie: playerCookie } });
  if (awardRead.body.award.reason !== 'Strong leadership') throw new Error('Captain award was not readable by active player.');

  const captainAvailPath = '/v1/teams/team-1xi/matches/match-1xi-hoppers/captain-availability';
  // Players must not see or touch the captain's private list.
  await expectStatus(captainAvailPath, 403, { headers: { cookie: playerCookie } });
  await expectStatus(`${captainAvailPath}/user-ravi`, 403, {
    method: 'PUT',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ status: 'AVAILABLE' }),
  });

  const marked = await expectStatus(`${captainAvailPath}/user-ravi`, 200, {
    method: 'PUT',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ status: 'AVAILABLE', note: 'Confirmed by phone' }),
  });
  if (marked.body.entry.status !== 'AVAILABLE' || marked.body.entry.note !== 'Confirmed by phone') {
    throw new Error('Captain availability was not saved.');
  }
  if (marked.body.entry.setByUserId !== 'user-priya') throw new Error('Captain availability did not record who set it.');
  await expectStatus(`${captainAvailPath}/user-ravi`, 400, {
    method: 'PUT',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ status: 'PROBABLY' }),
  });
  await expectStatus(`${captainAvailPath}/user-not-in-team`, 400, {
    method: 'PUT',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ status: 'AVAILABLE' }),
  });
  await expectStatus(captainAvailPath, 200, {
    method: 'PUT',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ entries: [{ userId: 'user-jas', status: 'MAYBE' }, { userId: 'user-sam', status: 'UNAVAILABLE' }] }),
  });

  // The captain's mark must not overwrite what the player answered.
  const captainView = await expectStatus('/v1/teams/team-1xi/matches/match-1xi-hoppers', 200, { headers: { cookie: captainCookie } });
  const raviRow = captainView.body.availabilityRows.find((row) => row.userId === 'user-ravi');
  if (raviRow.captainStatus !== 'AVAILABLE') throw new Error('Captain mark missing from match detail.');
  if (raviRow.captainNote !== 'Confirmed by phone') throw new Error('Captain note missing from match detail.');
  if (captainView.body.captainAvailabilitySummary.AVAILABLE !== 1 || captainView.body.captainAvailabilitySummary.MAYBE !== 1) {
    throw new Error('Captain availability summary is wrong.');
  }
  const playerView = await expectStatus('/v1/teams/team-1xi/matches/match-1xi-hoppers', 200, { headers: { cookie: playerCookie } });
  if (playerView.body.captainAvailabilitySummary !== null || playerView.body.availabilityRows.length) {
    throw new Error("Players must not see the captain's availability list.");
  }
  const dashboard = await expectStatus('/v1/teams/team-1xi/captain/dashboard', 200, { headers: { cookie: captainCookie } });
  const hoppers = dashboard.body.matchSummaries.find((item) => item.matchId === 'match-1xi-hoppers');
  if (hoppers.captainAvailabilitySummary.AVAILABLE !== 1) throw new Error('Match hub badge summary is wrong.');

  await expectStatus(`${captainAvailPath}/user-ravi`, 200, { method: 'DELETE', headers: { cookie: captainCookie } });
  const afterClear = await expectStatus('/v1/teams/team-1xi/matches/match-1xi-hoppers', 200, { headers: { cookie: captainCookie } });
  if (afterClear.body.availabilityRows.find((row) => row.userId === 'user-ravi').captainStatus !== 'NOT_MARKED') {
    throw new Error('Captain availability was not cleared.');
  }

  const hoppersPath = '/v1/teams/team-1xi/matches/match-1xi-hoppers';
  await expectStatus(hoppersPath, 403, {
    method: 'PATCH',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ status: 'COMPLETED', result: 'WON' }),
  });
  const completedMatch = await expectStatus(hoppersPath, 200, {
    method: 'PATCH',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ status: 'COMPLETED', result: 'WON', resultSummary: 'Won by 5 wickets chasing 142.' }),
  });
  if (completedMatch.body.match.result !== 'WON') throw new Error('Match result was not saved.');
  if (completedMatch.body.match.resultSummary !== 'Won by 5 wickets chasing 142.') throw new Error('Match result summary was not saved.');
  if (!completedMatch.body.match.completedAt) throw new Error('Completing a match must stamp completedAt.');

  // An unrelated edit to a completed match must leave the result alone.
  const editedMatch = await expectStatus(hoppersPath, 200, {
    method: 'PATCH',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ notes: 'Post-match debrief on Tuesday.' }),
  });
  if (editedMatch.body.match.result !== 'WON') throw new Error('An unrelated edit wiped the match result.');

  const closedPlayerView = await expectStatus(hoppersPath, 200, { headers: { cookie: playerCookie } });
  if (closedPlayerView.body.match.result !== 'WON') throw new Error('Players cannot see the match result.');
  if (!closedPlayerView.body.lineup) throw new Error('A completed match must still expose its published lineup.');
  if (!closedPlayerView.body.award) throw new Error('A completed match must still expose the captain award.');

  const badResult = await expectStatus(hoppersPath, 200, {
    method: 'PATCH',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ result: 'THRASHED' }),
  });
  if (badResult.body.match.result) throw new Error('An unknown match result should be dropped.');

  await expectStatus(hoppersPath, 200, {
    method: 'PATCH',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ result: 'LOST' }),
  });
  const reopenedMatch = await expectStatus(hoppersPath, 200, {
    method: 'PATCH',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ status: 'SCHEDULED' }),
  });
  if (reopenedMatch.body.match.result || reopenedMatch.body.match.resultSummary) {
    throw new Error('Reopening a match must clear its result.');
  }

  const appreciation = await expectStatus('/v1/teams/team-1xi/appreciation', 201, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({
      recipientUserId: 'user-priya',
      shortDescription: 'Great energy in the field.',
      longDescription: 'Priya kept the side switched on for the full innings and lifted everyone after a tough over.',
    }),
  });
  if (appreciation.body.post.recipientUserId !== 'user-priya') throw new Error('Appreciation recipient was not saved.');
  if (appreciation.body.post.shortDescription !== 'Great energy in the field.' || !appreciation.body.post.longDescription) {
    throw new Error('Appreciation descriptions were not saved.');
  }
  const appreciationNoMention = await expectStatus('/v1/teams/team-1xi/appreciation', 201, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ shortDescription: 'No specific teammate mention.' }),
  });
  if (appreciationNoMention.body.post.recipientUserId) throw new Error('Appreciation should not require a recipient.');
  await expectStatus('/v1/teams/team-1xi/appreciation', 400, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ recipientUserId: 'user-not-in-team', shortDescription: 'Should fail.' }),
  });
  await expectStatus('/v1/teams/team-1xi/appreciation', 403, { headers: { cookie: signupCookie } });
  const comment = await expectStatus(`/v1/teams/team-1xi/appreciation/${appreciation.body.post.postId}/comments`, 201, {
    method: 'POST',
    headers: { cookie: captainCookie },
    body: JSON.stringify({ message: 'Well said.' }),
  });
  if (comment.body.comment.message !== 'Well said.' || comment.body.comment.authorUserId !== 'user-priya') {
    throw new Error('Appreciation comment was not saved.');
  }
  const appreciationList = await expectStatus('/v1/teams/team-1xi/appreciation', 200, { headers: { cookie: playerCookie } });
  const listedPost = appreciationList.body.posts.find((post) => post.postId === appreciation.body.post.postId);
  if (listedPost?.latestComment?.commentId !== comment.body.comment.commentId || listedPost.commentCount < 1) {
    throw new Error('Feed cards did not carry the latest comment.');
  }
  if (listedPost.comments) throw new Error('Feed cards should not carry the full comment list.');
  const liked = await expectStatus(`/v1/teams/team-1xi/appreciation/${appreciation.body.post.postId}/like`, 200, {
    method: 'POST',
    headers: { cookie: playerCookie },
  });
  if (liked.body.reactionSummary.likeCount !== 1 || !liked.body.reactionSummary.likedByMe) throw new Error('Like was not applied.');
  const likedAgain = await expectStatus(`/v1/teams/team-1xi/appreciation/${appreciation.body.post.postId}/like`, 200, {
    method: 'POST',
    headers: { cookie: playerCookie },
  });
  if (likedAgain.body.reactionSummary.likeCount !== 1) throw new Error('Like should be idempotent.');
  const unliked = await expectStatus(`/v1/teams/team-1xi/appreciation/${appreciation.body.post.postId}/like`, 200, {
    method: 'DELETE',
    headers: { cookie: playerCookie },
  });
  if (unliked.body.reactionSummary.likeCount !== 0 || unliked.body.reactionSummary.likedByMe) throw new Error('Unlike was not applied.');

  const postId = appreciation.body.post.postId;
  await expectStatus(`/v1/teams/team-1xi/appreciation/${postId}/like`, 200, { method: 'POST', headers: { cookie: captainCookie } });
  const detail = await expectStatus(`/v1/teams/team-1xi/appreciation/${postId}`, 200, { headers: { cookie: playerCookie } });
  if (!detail.body.post.comments?.some((item) => item.commentId === comment.body.comment.commentId)) {
    throw new Error('Detail response did not include the full comment list.');
  }
  if (detail.body.post.likedBy?.length !== 1 || detail.body.post.likedBy[0].userId !== 'user-priya') {
    throw new Error('Detail response did not hydrate likers.');
  }
  if (!detail.body.post.likedBy[0].displayName || !detail.body.post.likedBy[0].initials) {
    throw new Error('Liker was not hydrated with a display name and initials.');
  }
  if (detail.body.post.reactionSummary.likedByMe) throw new Error('likedByMe should reflect the requesting user.');
  const cardLikers = (await expectStatus('/v1/teams/team-1xi/appreciation', 200, { headers: { cookie: playerCookie } }))
    .body.posts.find((post) => post.postId === postId)?.reactionSummary?.topLikers;
  if (cardLikers?.length !== 1) throw new Error('Feed cards did not carry top likers.');
  await expectStatus('/v1/teams/team-1xi/appreciation/appreciation-missing', 404, { headers: { cookie: playerCookie } });

  // user-ben is a plain player in team-1xi, so neither author nor manager.
  // Assert on the message so a team-access 403 cannot pass this by accident.
  const benCookie = await login('+61400000117');
  const forbidden = await expectStatus(`/v1/teams/team-1xi/appreciation/${postId}`, 403, { method: 'DELETE', headers: { cookie: benCookie } });
  if (!/author or a team manager/.test(forbidden.body.message || '')) {
    throw new Error(`Delete was refused for the wrong reason: ${forbidden.body.message}`);
  }
  // A team manager who is not the author may delete.
  const managerDeletable = await expectStatus('/v1/teams/team-1xi/appreciation', 201, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ shortDescription: 'Manager delete check.' }),
  });
  await expectStatus(`/v1/teams/team-1xi/appreciation/${managerDeletable.body.post.postId}`, 200, {
    method: 'DELETE',
    headers: { cookie: captainCookie },
  });
  await expectStatus(`/v1/teams/team-1xi/appreciation/${postId}`, 200, { method: 'DELETE', headers: { cookie: playerCookie } });
  await expectStatus(`/v1/teams/team-1xi/appreciation/${postId}`, 404, { headers: { cookie: playerCookie } });
  const afterDelete = await expectStatus('/v1/teams/team-1xi/appreciation', 200, { headers: { cookie: playerCookie } });
  if (afterDelete.body.posts.some((post) => post.postId === postId)) throw new Error('Deleted post still appears in the feed.');

  const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const upload = await expectStatus('/v1/teams/team-1xi/appreciation/media', 201, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ dataUrl: onePixelPng, contentType: 'image/png', width: 1, height: 1, dominantColor: '#334455' }),
  });
  if (!upload.body.media.key.startsWith('feed-media/team-1xi/')) throw new Error('Feed media was stored under the wrong prefix.');
  if (upload.body.media.url !== `/${upload.body.media.key}`) throw new Error('Feed media URL should be the S3 key path.');
  await expectStatus('/v1/teams/team-1xi/appreciation/media', 400, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ dataUrl: onePixelPng, contentType: 'application/pdf', width: 1, height: 1 }),
  });

  const photoPost = await expectStatus('/v1/teams/team-1xi/appreciation', 201, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({ shortDescription: 'Weekend photo.', media: [upload.body.media] }),
  });
  if (photoPost.body.post.media?.[0]?.key !== upload.body.media.key) throw new Error('Photo was not attached to the post.');
  if (photoPost.body.post.media[0].width !== 1) throw new Error('Photo dimensions were not stored.');
  // Binary body, so this cannot go through the JSON request helper.
  const photoAsset = await fetch(`${baseUrl}/${upload.body.media.key}`, { headers: { cookie: playerCookie } });
  if (photoAsset.status !== 200) throw new Error('Feed media was not served back.');
  if (!photoAsset.headers.get('content-type')?.startsWith('image/')) throw new Error('Feed media was served with the wrong content type.');

  // A client must not be able to attach an object it does not own.
  await expectStatus('/v1/teams/team-1xi/appreciation', 400, {
    method: 'POST',
    headers: { cookie: playerCookie },
    body: JSON.stringify({
      shortDescription: 'Forged media.',
      media: [{ ...upload.body.media, key: 'receipts/team-1xi/secret.pdf' }],
    }),
  });
  await expectStatus(`/v1/teams/team-1xi/appreciation/${photoPost.body.post.postId}`, 200, {
    method: 'DELETE',
    headers: { cookie: playerCookie },
  });

  // Every post created above is deleted again, so pagination needs its own
  // fixtures rather than depending on what a previous run left behind.
  for (const label of ['Pagination fixture one.', 'Pagination fixture two.']) {
    await expectStatus('/v1/teams/team-1xi/appreciation', 201, {
      method: 'POST',
      headers: { cookie: playerCookie },
      body: JSON.stringify({ shortDescription: label }),
    });
  }

  const firstFeedPage = await expectStatus('/v1/teams/team-1xi/appreciation?limit=1', 200, { headers: { cookie: playerCookie } });
  if (firstFeedPage.body.posts.length !== 1) throw new Error('Feed limit was not honoured.');
  if (!firstFeedPage.body.nextCursor) throw new Error('Feed did not return a cursor while more posts remain.');
  if (!firstFeedPage.body.members.length) throw new Error('First feed page should include the roster.');
  const secondFeedPage = await expectStatus(
    `/v1/teams/team-1xi/appreciation?limit=1&cursor=${encodeURIComponent(firstFeedPage.body.nextCursor)}`,
    200,
    { headers: { cookie: playerCookie } },
  );
  if (secondFeedPage.body.posts.length !== 1) throw new Error('Feed second page was empty.');
  if (secondFeedPage.body.posts[0].postId === firstFeedPage.body.posts[0].postId) {
    throw new Error('Feed pagination returned the same post twice.');
  }
  if (secondFeedPage.body.members.length) throw new Error('Later feed pages should omit the roster.');
  if (firstFeedPage.body.posts[0].createdAt < secondFeedPage.body.posts[0].createdAt) {
    throw new Error('Feed pages are not ordered newest first.');
  }
  await expectStatus('/v1/teams/team-1xi/appreciation?cursor=not-a-cursor', 400, { headers: { cookie: playerCookie } });

  console.log('MyTuskers API integration tests passed.');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

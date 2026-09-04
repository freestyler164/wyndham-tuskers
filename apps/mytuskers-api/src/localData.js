import bcrypt from 'bcryptjs';

const now = () => new Date().toISOString();

const addDays = (days, hour = 13) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const completedOnboardingAt = '2026-07-01T00:00:00.000Z';
const seedPassword = 'Password123!';
const seedPasswordHash = bcrypt.hashSync(seedPassword, 10);

const users = [
  { userId: 'user-admin', email: 'admin@wyndhamtuskers.com', phone: '+61473623614', displayName: 'Global Admin', preferredName: 'Admin', initials: 'GA', needsProfile: false, onboardingCompletedAt: completedOnboardingAt, globalRole: 'GLOBAL_ADMIN', playingRole: 'BATTER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
  { userId: 'user-ravi', email: 'ravi@wyndhamtuskers.local', phone: '+61400000123', displayName: 'Ravi Sharma', preferredName: 'Ravi', initials: 'RS', needsProfile: false, onboardingCompletedAt: completedOnboardingAt, playingRole: 'BATTER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
  { userId: 'user-priya', email: 'priya@wyndhamtuskers.local', phone: '+61400000111', displayName: 'Priya N', preferredName: 'Priya', initials: 'PN', needsProfile: false, onboardingCompletedAt: completedOnboardingAt, playingRole: 'BATTER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
  { userId: 'user-dan', email: 'dan@wyndhamtuskers.local', phone: '+61400000112', displayName: 'Dan W', preferredName: 'Dan', initials: 'DW', needsProfile: false, onboardingCompletedAt: completedOnboardingAt, playingRole: 'BATTER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
  { userId: 'user-jas', email: 'jas@wyndhamtuskers.local', phone: '+61400000113', displayName: 'Jas K', preferredName: 'Jas', initials: 'JK', needsProfile: false, onboardingCompletedAt: completedOnboardingAt, playingRole: 'ALL_ROUNDER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
  { userId: 'user-marcus', email: 'marcus@wyndhamtuskers.local', phone: '+61400000114', displayName: 'Marcus L', preferredName: 'Marcus', initials: 'ML', needsProfile: false, onboardingCompletedAt: completedOnboardingAt, playingRole: 'ALL_ROUNDER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
  { userId: 'user-sam', email: 'sam@wyndhamtuskers.local', phone: '+61400000115', displayName: 'Sam T', preferredName: 'Sam', initials: 'ST', needsProfile: false, onboardingCompletedAt: completedOnboardingAt, playingRole: 'KEEPER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
  { userId: 'user-arjun', email: 'arjun@wyndhamtuskers.local', phone: '+61400000116', displayName: 'Arjun P', preferredName: 'Arjun', initials: 'AP', needsProfile: false, onboardingCompletedAt: completedOnboardingAt, playingRole: 'ALL_ROUNDER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
  { userId: 'user-ben', email: 'ben@wyndhamtuskers.local', phone: '+61400000117', displayName: 'Ben H', preferredName: 'Ben', initials: 'BH', needsProfile: false, onboardingCompletedAt: completedOnboardingAt, playingRole: 'BOWLER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
  { userId: 'user-guest', email: 'guest@wyndhamtuskers.local', phone: '+61400000444', displayName: '', preferredName: '', initials: 'G', needsProfile: true, onboardingCompletedAt: '', playingRole: 'BOWLER', emailVerifiedAt: completedOnboardingAt, passwordHash: seedPasswordHash },
];

const teams = [
  { teamId: 'team-1xi', name: 'Tuskers 1st XI', shortName: '1XI', sport: 'CRICKET', playerCount: 14, status: 'ACTIVE', captainUserId: 'user-priya', walletCardColor: '#063d93', walletCardImageUrl: '' },
  { teamId: 'team-t20', name: 'Tuskers T20', shortName: 'T20', sport: 'CRICKET', playerCount: 12, status: 'ACTIVE', captainUserId: 'user-dan', walletCardColor: '#11100f', walletCardImageUrl: '' },
];

const membership = (teamId, userId, role = 'PLAYER', playerType = 'CLUB_MEMBER') => ({
  teamId,
  userId,
  role,
  status: 'ACTIVE',
  playerType,
  playingRole: users.find((user) => user.userId === userId)?.playingRole || 'BATTER',
  joinedAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const memberships = [
  membership('team-1xi', 'user-ravi'),
  membership('team-t20', 'user-ravi'),
  membership('team-1xi', 'user-priya', 'CAPTAIN'),
  membership('team-t20', 'user-dan', 'CAPTAIN'),
  membership('team-1xi', 'user-dan'),
  membership('team-1xi', 'user-jas'),
  membership('team-1xi', 'user-marcus'),
  membership('team-1xi', 'user-sam'),
  membership('team-1xi', 'user-arjun'),
  membership('team-1xi', 'user-ben'),
  membership('team-t20', 'user-jas'),
  membership('team-t20', 'user-sam'),
];

const matches = [
  {
    matchId: 'match-1xi-hoppers',
    teamId: 'team-1xi',
    opponent: 'Hoppers Crossing CC',
    competition: 'Round 9 - Home',
    matchFormat: 'One day',
    gameType: 'TOURNAMENT',
    matchFeeMinor: 1500,
    startAt: addDays(6, 13),
    arrivalAt: addDays(6, 12),
    timezone: 'Australia/Melbourne',
    venueName: 'Presidents Park, Oval 2',
    venueAddress: 'McGrath Road, Werribee VIC',
    notes: 'Get directions from the venue link. Bring warm-up gear.',
    availabilityDeadline: addDays(4, 18),
    status: 'SCHEDULED',
    createdByUserId: 'user-priya',
    createdAt: now(),
    updatedAt: now(),
  },
  {
    matchId: 'match-1xi-training',
    teamId: 'team-1xi',
    title: 'Training - nets',
    opponent: 'Training - nets',
    competition: 'Training',
    matchFormat: 'Training',
    gameType: 'FRIENDLY',
    matchFeeMinor: 0,
    startAt: addDays(12, 18),
    timezone: 'Australia/Melbourne',
    venueName: 'Wyndham Indoor Centre',
    status: 'SCHEDULED',
    createdByUserId: 'user-priya',
    createdAt: now(),
    updatedAt: now(),
  },
  {
    matchId: 'match-t20-pointcook',
    teamId: 'team-t20',
    opponent: 'Point Cook CC',
    competition: 'T20 League',
    matchFormat: 'T20',
    gameType: 'TOURNAMENT',
    matchFeeMinor: 1200,
    startAt: addDays(13, 13),
    timezone: 'Australia/Melbourne',
    venueName: 'Saltwater Reserve',
    notes: 'Away game. Availability due Friday.',
    availabilityRequestedAt: now(),
    availabilityRequestedByUserId: 'user-dan',
    availabilityDeadline: addDays(10, 18),
    status: 'SCHEDULED',
    createdByUserId: 'user-dan',
    createdAt: now(),
    updatedAt: now(),
  },
  {
    matchId: 'match-1xi-old-complete',
    teamId: 'team-1xi',
    opponent: 'Werribee Centrals CC',
    competition: 'Round 7 - Away',
    matchFormat: 'One day',
    gameType: 'TOURNAMENT',
    matchFeeMinor: 1500,
    startAt: addDays(-21, 13),
    arrivalAt: addDays(-21, 12),
    timezone: 'Australia/Melbourne',
    venueName: 'Galvin Park, Oval 1',
    venueAddress: 'Shaws Road, Werribee VIC',
    notes: 'Completed seeded historical fixture.',
    status: 'COMPLETED',
    result: 'WON',
    resultSummary: 'Won by 4 wickets with 11 balls to spare. Chased 168 after a tight middle overs squeeze.',
    completedAt: addDays(-21, 18),
    createdByUserId: 'user-priya',
    createdAt: addDays(-30, 10),
    updatedAt: addDays(-21, 18),
  },
  {
    matchId: 'match-1xi-old-cancelled',
    teamId: 'team-1xi',
    opponent: 'Seabrook CC',
    competition: 'Practice match',
    matchFormat: 'Friendly',
    gameType: 'FRIENDLY',
    matchFeeMinor: 0,
    startAt: addDays(-14, 10),
    timezone: 'Australia/Melbourne',
    venueName: 'Presidents Park, Oval 3',
    notes: 'Cancelled seeded historical fixture.',
    status: 'CANCELLED',
    cancelledAt: addDays(-15, 16),
    createdByUserId: 'user-priya',
    createdAt: addDays(-25, 10),
    updatedAt: addDays(-15, 16),
  },
  {
    matchId: 'match-1xi-overdue-closeout',
    teamId: 'team-1xi',
    opponent: 'Altona North CC',
    competition: 'Round 8 - Home',
    matchFormat: 'One day',
    gameType: 'TOURNAMENT',
    matchFeeMinor: 1500,
    startAt: addDays(-3, 13),
    arrivalAt: addDays(-3, 12),
    timezone: 'Australia/Melbourne',
    venueName: 'Presidents Park, Oval 2',
    venueAddress: 'McGrath Road, Werribee VIC',
    notes: 'Past seeded fixture left scheduled so captains can test close-out.',
    availabilityRequestedAt: addDays(-7, 9),
    availabilityRequestedByUserId: 'user-priya',
    availabilityDeadline: addDays(-5, 18),
    status: 'SCHEDULED',
    createdByUserId: 'user-priya',
    createdAt: addDays(-10, 10),
    updatedAt: addDays(-7, 9),
  },
];

const availability = [
  { teamId: 'team-1xi', matchId: 'match-1xi-hoppers', userId: 'user-ravi', status: 'AVAILABLE', note: '', respondedAt: now(), updatedAt: now() },
  { teamId: 'team-1xi', matchId: 'match-1xi-hoppers', userId: 'user-priya', status: 'AVAILABLE', respondedAt: now(), updatedAt: now() },
  { teamId: 'team-1xi', matchId: 'match-1xi-hoppers', userId: 'user-dan', status: 'AVAILABLE', respondedAt: now(), updatedAt: now() },
  { teamId: 'team-1xi', matchId: 'match-1xi-hoppers', userId: 'user-jas', status: 'AVAILABLE', respondedAt: now(), updatedAt: now() },
  { teamId: 'team-1xi', matchId: 'match-1xi-hoppers', userId: 'user-marcus', status: 'UNAVAILABLE', respondedAt: now(), updatedAt: now() },
  { teamId: 'team-1xi', matchId: 'match-1xi-hoppers', userId: 'user-sam', status: 'MAYBE', respondedAt: now(), updatedAt: now() },
  { teamId: 'team-1xi', matchId: 'match-1xi-old-complete', userId: 'user-ravi', status: 'AVAILABLE', note: '', respondedAt: addDays(-24, 18), updatedAt: addDays(-24, 18) },
  { teamId: 'team-1xi', matchId: 'match-1xi-old-complete', userId: 'user-priya', status: 'AVAILABLE', respondedAt: addDays(-24, 18), updatedAt: addDays(-24, 18) },
  { teamId: 'team-1xi', matchId: 'match-1xi-old-complete', userId: 'user-dan', status: 'AVAILABLE', respondedAt: addDays(-24, 18), updatedAt: addDays(-24, 18) },
  { teamId: 'team-1xi', matchId: 'match-1xi-overdue-closeout', userId: 'user-ravi', status: 'AVAILABLE', note: '', respondedAt: addDays(-6, 18), updatedAt: addDays(-6, 18) },
  { teamId: 'team-1xi', matchId: 'match-1xi-overdue-closeout', userId: 'user-priya', status: 'AVAILABLE', respondedAt: addDays(-6, 18), updatedAt: addDays(-6, 18) },
  { teamId: 'team-1xi', matchId: 'match-1xi-overdue-closeout', userId: 'user-dan', status: 'UNAVAILABLE', respondedAt: addDays(-6, 18), updatedAt: addDays(-6, 18) },
];

const lineupPlayers = ['user-priya', 'user-dan', 'user-jas', 'user-ravi', 'user-marcus', 'user-sam', 'user-arjun', 'user-ben'].map((userId, index) => ({
  userId,
  displayOrder: index + 1,
  positionLabel: users.find((user) => user.userId === userId)?.playingRole?.replace('_', '-').toLowerCase(),
}));

const lineups = [
  {
    teamId: 'team-1xi',
    matchId: 'match-1xi-hoppers',
    lineupId: 'lineup-1xi-hoppers-published',
    status: 'PUBLISHED',
    revisionNumber: 1,
    startingPlayers: lineupPlayers,
    reservePlayers: [{ userId: 'user-sam', displayOrder: 1, positionLabel: 'keeper' }],
    captainNote: 'Batting order is provisional.',
    publishedAt: now(),
    publishedByUserId: 'user-priya',
    createdAt: now(),
    updatedAt: now(),
  },
  {
    teamId: 'team-t20',
    matchId: 'match-t20-pointcook',
    lineupId: 'lineup-t20-pointcook-draft',
    status: 'DRAFT',
    revisionNumber: 1,
    startingPlayers: [
      { userId: 'user-dan', displayOrder: 1, positionLabel: 'bat' },
      { userId: 'user-ravi', displayOrder: 2, positionLabel: 'bat' },
      { userId: 'user-jas', displayOrder: 3, positionLabel: 'all-round' },
    ],
    reservePlayers: [],
    captainNote: 'Draft only.',
    createdAt: now(),
    updatedAt: now(),
  },
  {
    teamId: 'team-1xi',
    matchId: 'match-1xi-old-complete',
    lineupId: 'lineup-1xi-old-complete-published',
    status: 'PUBLISHED',
    revisionNumber: 1,
    startingPlayers: lineupPlayers,
    reservePlayers: [],
    captainNote: 'Historical lineup retained after completion.',
    chargedMatchFeeMinor: 1500,
    publishedAt: addDays(-22, 18),
    publishedByUserId: 'user-priya',
    createdAt: addDays(-22, 18),
    updatedAt: addDays(-22, 18),
  },
];

const wallets = [
  { walletId: 'wallet-team-1xi', teamId: 'team-1xi', ownerType: 'TEAM', availableMinor: 92500, pendingMinor: 0, currency: 'AUD' },
  { walletId: 'wallet-team-t20', teamId: 'team-t20', ownerType: 'TEAM', availableMinor: 64000, pendingMinor: 0, currency: 'AUD' },
  { walletId: 'wallet-team-1xi-user-ravi', teamId: 'team-1xi', ownerType: 'PLAYER', ownerUserId: 'user-ravi', availableMinor: 14250, pendingMinor: 2000, currency: 'AUD' },
  { walletId: 'wallet-team-t20-user-ravi', teamId: 'team-t20', ownerType: 'PLAYER', ownerUserId: 'user-ravi', availableMinor: 9200, pendingMinor: 0, currency: 'AUD' },
  { walletId: 'wallet-team-1xi-user-priya', teamId: 'team-1xi', ownerType: 'PLAYER', ownerUserId: 'user-priya', availableMinor: 18000, pendingMinor: 0, currency: 'AUD' },
  { walletId: 'wallet-team-t20-user-dan', teamId: 'team-t20', ownerType: 'PLAYER', ownerUserId: 'user-dan', availableMinor: 16500, pendingMinor: 0, currency: 'AUD' },
  { walletId: 'wallet-team-1xi-user-dan', teamId: 'team-1xi', ownerType: 'PLAYER', ownerUserId: 'user-dan', availableMinor: 11000, pendingMinor: 0, currency: 'AUD' },
  { walletId: 'wallet-team-1xi-user-jas', teamId: 'team-1xi', ownerType: 'PLAYER', ownerUserId: 'user-jas', availableMinor: 7600, pendingMinor: 0, currency: 'AUD' },
  { walletId: 'wallet-team-t20-user-jas', teamId: 'team-t20', ownerType: 'PLAYER', ownerUserId: 'user-jas', availableMinor: 7200, pendingMinor: 0, currency: 'AUD' },
  { walletId: 'wallet-team-1xi-user-sam', teamId: 'team-1xi', ownerType: 'PLAYER', ownerUserId: 'user-sam', availableMinor: 5000, pendingMinor: 0, currency: 'AUD' },
  { walletId: 'wallet-team-t20-user-sam', teamId: 'team-t20', ownerType: 'PLAYER', ownerUserId: 'user-sam', availableMinor: 5000, pendingMinor: 0, currency: 'AUD' },
];

const transactions = [
  { transactionId: 'tx-open-ravi', teamId: 'team-1xi', walletId: 'wallet-team-1xi-user-ravi', ownerType: 'PLAYER', ownerUserId: 'user-ravi', amountMinor: 18000, currency: 'AUD', direction: 'CREDIT', transactionType: 'OPENING_CREDIT', status: 'POSTED', reason: 'Opening balance', createdByUserId: 'user-priya', createdAt: addDays(-15, 9) },
  { transactionId: 'tx-ground-hire', teamId: 'team-1xi', walletId: 'wallet-team-1xi-user-ravi', ownerType: 'PLAYER', ownerUserId: 'user-ravi', amountMinor: 1250, currency: 'AUD', direction: 'DEBIT', transactionType: 'EXPENSE_DEBIT', status: 'POSTED', reason: 'Ground hire - Round 7', createdByUserId: 'user-priya', createdAt: addDays(-7, 10) },
  { transactionId: 'tx-tea-refund', teamId: 'team-1xi', walletId: 'wallet-team-1xi-user-ravi', ownerType: 'PLAYER', ownerUserId: 'user-ravi', amountMinor: 4500, currency: 'AUD', direction: 'CREDIT', transactionType: 'REFUND', status: 'POSTED', reason: 'Afternoon tea - Round 7', createdByUserId: 'user-priya', createdAt: addDays(-5, 14) },
];

const expenses = [
  { expenseId: 'expense-balls-round-8', teamId: 'team-1xi', submittedByUserId: 'user-ravi', title: 'Match balls - Round 8', amountMinor: 2000, status: 'SUBMITTED', appliesTo: 'SELF', allocations: [{ userId: 'user-ravi', amountMinor: 2000 }], pendingAllocatedMinor: 2000, createdAt: addDays(-1, 12), updatedAt: addDays(-1, 12) },
  { expenseId: 'expense-ground-round-7', teamId: 'team-1xi', submittedByUserId: 'user-priya', title: 'Ground hire - Round 7', amountMinor: 1250, status: 'APPROVED', appliesTo: 'WHOLE_TEAM', allocations: [{ userId: 'user-ravi', amountMinor: 1250 }], createdAt: addDays(-7, 10), updatedAt: addDays(-6, 10) },
  { expenseId: 'expense-petrol-away', teamId: 'team-1xi', submittedByUserId: 'user-ravi', title: 'Petrol to away game', amountMinor: 3000, status: 'REJECTED', appliesTo: 'SELF', allocations: [{ userId: 'user-ravi', amountMinor: 3000 }], createdAt: addDays(-10, 10), updatedAt: addDays(-9, 10) },
];

const topupRequests = [
  { requestId: 'topup-ravi-low-balance', teamId: 'team-t20', userId: 'user-ravi', amountMinor: 5000, status: 'SUBMITTED', paymentConfirmed: true, note: 'Paid by bank transfer', createdAt: addDays(-1, 17), updatedAt: addDays(-1, 17) },
];

const collections = [
  {
    collectionId: 'collection-jerseys-local',
    teamId: 'team-1xi',
    title: 'Onam jerseys 2026',
    note: 'Adult and kids sizes. Pay before ordering.',
    status: 'OPEN',
    totalDueMinor: 16000,
    totalPrepaidMinor: 0,
    totalSpentMinor: 0,
    createdByUserId: 'user-priya',
    createdAt: addDays(-2, 10),
    updatedAt: addDays(-2, 10),
  },
];

const collectionShares = [
  {
    collectionId: 'collection-jerseys-local',
    teamId: 'team-1xi',
    userId: 'user-ravi',
    amountDueMinor: 8000,
    amountPrepaidMinor: 0,
    amountSpentMinor: 0,
    status: 'REQUESTED',
    createdAt: addDays(-2, 10),
    updatedAt: addDays(-2, 10),
  },
  {
    collectionId: 'collection-jerseys-local',
    teamId: 'team-1xi',
    userId: 'user-dan',
    amountDueMinor: 8000,
    amountPrepaidMinor: 0,
    amountSpentMinor: 0,
    status: 'REQUESTED',
    createdAt: addDays(-2, 10),
    updatedAt: addDays(-2, 10),
  },
];

const awards = [
  {
    teamId: 'team-1xi',
    matchId: 'match-1xi-old-complete',
    awardType: 'CAPTAIN_MOTM',
    recipientType: 'PLAYER',
    recipientUserId: 'user-jas',
    recipientDisplayName: 'Jas',
    reason: '3 for 21 off four overs and a calm finish with the bat.',
    awardedByUserId: 'user-priya',
    createdAt: addDays(-21, 19),
    updatedAt: addDays(-21, 19),
  },
];

export const seed = {
  users,
  teams,
  memberships,
  matches,
  availability,
  lineups,
  awards,
  wallets,
  transactions,
  expenses,
  topupRequests,
  collections,
  collectionShares,
  invite: {
    token: 'join-1st-xi-local',
    inviteId: 'invite-1xi-local',
    teamId: 'team-1xi',
    status: 'ACTIVE',
    approvalRequired: true,
    maxUses: 25,
    usedCount: 3,
    expiresAt: addDays(14, 23),
    invitedByUserId: 'user-priya',
  },
};

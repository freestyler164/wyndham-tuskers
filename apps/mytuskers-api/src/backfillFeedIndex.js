// One-off migration: appreciation posts created before the feed moved to GSI1
// have no GSI1PK/GSI1SK, so they are invisible to the new newest-first query.
// Run once per environment after deploying, then this script can be deleted.
//
//   node src/backfillFeedIndex.js          # report what would change
//   node src/backfillFeedIndex.js --apply  # write the attributes
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config, db } from './aws.js';

const apply = process.argv.includes('--apply');

const scanAppreciationPosts = async () => {
  const items = [];
  let exclusiveStartKey;
  do {
    const result = await db.send(new ScanCommand({
      TableName: config.coreTable,
      FilterExpression: 'entityType = :type',
      ExpressionAttributeValues: { ':type': 'APPRECIATION_POST' },
      ExclusiveStartKey: exclusiveStartKey,
    }));
    items.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
};

const run = async () => {
  const posts = await scanAppreciationPosts();
  const pending = posts.filter((post) => !post.GSI1PK || !post.GSI1SK);

  console.log(`Found ${posts.length} appreciation posts; ${pending.length} need the feed index.`);
  if (!pending.length) return;

  if (!apply) {
    for (const post of pending) {
      console.log(`  would index ${post.teamId} / ${post.postId} (${post.createdAt})`);
    }
    console.log('\nDry run only. Re-run with --apply to write these attributes.');
    return;
  }

  let updated = 0;
  for (const post of pending) {
    await db.send(new UpdateCommand({
      TableName: config.coreTable,
      Key: { PK: post.PK, SK: post.SK },
      UpdateExpression: 'SET GSI1PK = :pk, GSI1SK = :sk',
      // Never clobber a post that a concurrent write already indexed.
      ConditionExpression: 'attribute_not_exists(GSI1PK)',
      ExpressionAttributeValues: {
        ':pk': `TEAM#${post.teamId}#FEED`,
        ':sk': `${post.createdAt}#${post.postId}`,
      },
    })).then(() => { updated += 1; }).catch((error) => {
      if (error.name === 'ConditionalCheckFailedException') return;
      throw error;
    });
  }
  console.log(`Indexed ${updated} posts.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

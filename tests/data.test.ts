import test from 'node:test';
import assert from 'node:assert/strict';
import topics from '../data/topics.json';
import articles from '../data/articles.json';
import sources from '../data/sources.json';
import relations from '../data/relations.json';

test('seed contains a connected, expandable taxonomy and complete dossiers', () => {
  assert.equal(topics.filter(t => t.parentId === null).length, 7);
  assert.ok(topics.filter(t => t.parentId).length >= 40);
  const ids = new Set(topics.map(t => t.id));
  assert.equal(ids.size, topics.length);
  for (const topic of topics) if (topic.parentId) assert.ok(ids.has(topic.parentId));
  const dossiers = topics.filter(t => t.featured);
  assert.ok(dossiers.length >= 3);
  for (const topic of dossiers) {
    assert.ok(topic.description.length > 50);
    assert.ok(topic.readingPath.length >= 3);
    for (const slug of topic.readingPath) assert.ok(articles.some(a => a.slug === slug && (a.topics.includes(topic.slug) || a.topics.some(s => topics.some(t => t.slug === s && t.parentId === topic.id)))));
  }
});

test('every published seed article has an original source, original guide and valid topics', () => {
  assert.ok(articles.length >= 20 && articles.length <= 30);
  const knownTopics = new Set(topics.map(t => t.slug));
  const knownSources = new Set(sources.map(s => s.id));
  assert.equal(new Set(articles.map(a => a.canonicalUrl)).size, articles.length);
  for (const article of articles) {
    assert.equal(new URL(article.url).protocol, 'https:');
    assert.ok(knownSources.has(article.sourceId));
    assert.ok(article.summary.length > 40);
    assert.ok(article.takeaways.length >= 2);
    assert.ok(article.topics.length >= 2);
    for (const slug of article.topics) assert.ok(knownTopics.has(slug));
    if (article.publishedAt) assert.ok(!Number.isNaN(new Date(article.publishedAt).valueOf()));
  }
  assert.deepEqual(new Set(articles.map(a => a.layer)), new Set(['primary', 'community', 'engineering']));
});

test('confirmed relations have evidence and exactly one endpoint on each side', () => {
  const articleIds = new Set(articles.map(a => a.id));
  const topicIds = new Set(topics.map(t => t.id));
  for (const relation of relations) {
    assert.equal(Number(!!relation.fromArticleId) + Number(!!relation.fromTopicId), 1);
    assert.equal(Number(!!relation.toArticleId) + Number(!!relation.toTopicId), 1);
    if (relation.fromArticleId) assert.ok(articleIds.has(relation.fromArticleId));
    if (relation.toArticleId) assert.ok(articleIds.has(relation.toArticleId));
    if (relation.fromTopicId) assert.ok(topicIds.has(relation.fromTopicId));
    if (relation.toTopicId) assert.ok(topicIds.has(relation.toTopicId));
    if (relation.status === 'confirmed') assert.ok(relation.evidenceUrl);
  }
  assert.ok(relations.some(r => r.status === 'suggested'));
});

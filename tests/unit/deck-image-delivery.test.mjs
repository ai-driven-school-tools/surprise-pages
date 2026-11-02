import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createDeckEditHarness} from '../checks/deck-edit-harness.mjs';
import {mediaDeliveryHarness} from '../checks/media-delivery-harness.mjs';

test('saved image bytes survive live and historical delivery without renaming', async () => {
  const h = await createDeckEditHarness({extra: `
    export * from './src/lib/deck/edit/assets';
    export {assetKey} from './src/lib/pages/assets';
    export {pageRefOf as storedPageRefOf} from './src/lib/pages/store';
    export {saveOptimizedImage} from './src/lib/deck/media/image-optimize';
  `});
  // 画像の置き場の鍵（src/lib/deck/media/image-optimize.ts と同じ組み方）。動画の保存部品を外したので、ここで組む
  const mediaStorageKey = (organization, page, src) => { const ref = h.api.storedPageRefOf(page); if (!ref || !h.api.isDeckMediaAssetPath(src)) throw new Error('bad media path'); return h.api.assetKey(organization, ref.slugPrefix, [...ref.slug, ...src.split('/')]); };
  try {
    await h.seed(await h.api.newDeckDocument());
    const bytes = await sharp({create: {width: 640, height: 360, channels: 3, background: '#407080'}}).png().toBuffer();
    const upload = await h.as(h.owner, () => h.api.upload(new Request('https://pages.example/api/pages/deck-edit/assets?page=internal/example/design&name=photo.png', {method: 'POST', body: bytes})));
    assert.equal(upload.status, 201);
    const saved = await upload.json();
    assert.match(saved.src, /^_deck\/media-[a-f0-9]{64}\.(webp|png)$/);
    // Search, URL import and reuse use this exact same image writer.
    const repeated = await h.api.saveOptimizedImage(h.organization,'internal/example/design', bytes, 'image/png');
    assert.equal(repeated.src, saved.src);
    assert.equal(globalThis.__deckAssets.size, 1);
    const stored = globalThis.__deckAssets.get(mediaStorageKey(h.organization,'internal/example/design', saved.src));
    assert.equal(stored.options.access, 'private');

    const source = h.api.prepareDeckEdit('<body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="slide"></section></main></body>').html;
    const inserted = h.api.applyDeckEditOperations(source, [{kind: 'insert', target: 'slide', node: {id: 'photo', tag: 'img', src: saved.src, alt: '写真', style: {width: '640px', height: '360px'}}}]);
    assert.ok(inserted.html.includes(saved.src));
    await h.seed(inserted.html);
    const slug = ['example', 'design', ...saved.src.split('/')];
    const {state, routes} = await mediaDeliveryHarness();
    state.pageSlug = 'internal/example/design';
    state.files.set(mediaStorageKey(h.organization,state.pageSlug, saved.src), {bytes: stored.bytes, type: saved.contentType, etag: '"saved-image"'});
    const response = await routes.internalGET(new Request('https://pages.example/internal/' + slug.join('/')), {params: Promise.resolve({slug})});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), saved.contentType);
    const delivered = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(delivered, stored.bytes);
    const dimensions = await sharp(delivered).metadata();
    assert.equal(dimensions.width, 640);
    assert.equal(dimensions.height, 360);

    // Old revisions may fall back only to the same immutable live asset.
    const archived = await h.api.readArchivedAsset(h.organization,'internal', ['example', 'design'], 'a'.repeat(40), saved.src.split('/'));
    assert.ok(archived);
    assert.deepEqual(Buffer.from(await new Response(await archived.open(null, new AbortController().signal)).arrayBuffer()), stored.bytes);
    // Archived copies use the same path contract, without a live fallback.
    globalThis.__deckAssets.set('internal/example/design/@archive/' + 'a'.repeat(40) + '/' + saved.src, stored);
    const frozen = await h.api.readArchivedAsset(h.organization,'internal', ['example', 'design'], 'a'.repeat(40), saved.src.split('/'), undefined, false);
    assert.ok(frozen);
    assert.deepEqual(Buffer.from(await new Response(await frozen.open(null, new AbortController().signal)).arrayBuffer()), stored.bytes);

    state.member = false;
    const loggedOut = await routes.internalGET(new Request('https://pages.example/internal/' + slug.join('/')), {params: Promise.resolve({slug})});
    assert.equal(loggedOut.status, 302);
    state.member = true;
    state.allowed = false;
    const denied = await routes.internalGET(new Request('https://pages.example/internal/' + slug.join('/')), {params: Promise.resolve({slug})});
    assert.equal(denied.status, 403);

    const uuid = '11111111-1111-4111-8111-111111111111';
    for (const id of [uuid, 'b'.repeat(64)]) {
      for (const extension of ['png', 'jpg', 'webp', 'gif', 'avif', 'mp4', 'webm']) {
        const path = h.api.deckMediaAssetPath(id, extension);
        assert.equal(h.api.isSafeAssetPath(path.split('/')), true);
        assert.equal(h.api.isSafeAssetPath(['example', 'design', ...path.split('/')]), true);
      }
    }
    assert.equal(h.api.isSafeAssetPath(['_deck', `logo-${uuid}.png`]), true);
    assert.equal(h.api.isSafeAssetPath(['_deck', `logo-${'b'.repeat(64)}.png`]), false);
    for (const invalid of [
      '_deck/media-unknown.png', `_deck/media-${'a'.repeat(63)}.webp`,
      `_deck/media-${'g'.repeat(64)}.webp`, `_deck/media-${'A'.repeat(64)}.webp`,
      `_deck/media-${'a'.repeat(64)}.webp/extra`, `_deck/media-${'a'.repeat(64)}.webp?raw=1`,
      '_deck/../secret.png', '_deck/media-../../secret.png', '_private/secret.png',
      '_deck/media-video-placeholder.png', `_deck-uploads/${uuid}/000`,
    ]) {
      assert.equal(h.api.isSafeAssetPath(invalid.split('/')), false, invalid);
      assert.throws(() => mediaStorageKey(h.organization,'internal/example/design', invalid));
    }
    assert.throws(() => h.api.deckMediaAssetPath('unknown', 'png'));
    assert.throws(() => h.api.deckMediaAssetPath(uuid, 'png/extra'));
  } finally { await h.close(); }
});

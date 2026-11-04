import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHttpUrl, isBlockedAddress } from '../src/core/net.js';
import { RateLimiter } from '../src/core/rate-limit.js';

test('outbound fetches are refused for private and metadata addresses', async () => {
  const blocked = [
    'http://localhost/x',
    'http://foo.localhost/',
    'http://127.0.0.1:9911/',
    'http://0.0.0.0/',
    'http://10.1.2.3/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://100.64.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    'file:///etc/passwd',
    'ftp://example.com/x',
  ];
  for (const url of blocked) {
    await assert.rejects(assertPublicHttpUrl(url), `expected ${url} to be refused`);
  }
});

test('IPv4-mapped IPv6 addresses are judged by the embedded IPv4 address', () => {
  // The URL parser rewrites ::ffff:127.0.0.1 to the hex form ::ffff:7f00:1, so a
  // guard that only matched dotted decimals would let this through.
  assert.equal(isBlockedAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedAddress('::ffff:7f00:1'), true);
  assert.equal(isBlockedAddress('::ffff:169.254.169.254'), true);
  assert.equal(isBlockedAddress('::ffff:a00:1'), true);
  assert.equal(isBlockedAddress('64:ff9b::7f00:1'), true);
});

test('public addresses are still allowed', async () => {
  for (const url of ['https://example.com', 'https://github.com', 'https://api.stripe.com']) {
    const parsed = await assertPublicHttpUrl(url);
    assert.equal(parsed.protocol, 'https:');
  }
  assert.equal(isBlockedAddress('8.8.8.8'), false);
  assert.equal(isBlockedAddress('1.1.1.1'), false);
});

test('a host that cannot be resolved is refused, not fetched', async () => {
  // The guard must fail closed: an unresolvable name is a refusal, not a pass.
  await assert.rejects(assertPublicHttpUrl('http://this-host-does-not-exist.invalid/'));
});

test('isBlockedAddress only classifies actual IP literals', () => {
  // Non-IP strings are not this function's business; hostname checks live in
  // assertPublicHttpUrl. Asserted so the contract is explicit.
  assert.equal(isBlockedAddress('not-an-ip'), false);
  assert.equal(isBlockedAddress('::gggg:1'), false);
});

test('the rate limiter allows up to the cap and then refuses with a retry hint', () => {
  const limiter = new RateLimiter();
  const options = { windowMs: 60_000, max: 3 };

  for (let i = 0; i < 3; i += 1) {
    assert.equal(limiter.check('client-a', options).allowed, true, `request ${i + 1} should pass`);
  }
  const refused = limiter.check('client-a', options);
  assert.equal(refused.allowed, false);
  assert.ok(refused.retryAfterSeconds >= 1);

  // Buckets are per key, so one noisy client must not silence another.
  assert.equal(limiter.check('client-b', options).allowed, true);
});

test('the rate limiter window expires', () => {
  const limiter = new RateLimiter();
  const options = { windowMs: 10, max: 1 };
  assert.equal(limiter.check('k', options).allowed, true);
  assert.equal(limiter.check('k', options).allowed, false);
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      assert.equal(limiter.check('k', options).allowed, true, 'window should have reset');
      resolve();
    }, 20);
  });
});

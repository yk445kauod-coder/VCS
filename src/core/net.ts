/**
 * Outbound-request safety.
 *
 * Duty fetches URLs that a tenant supplies — a business website to learn from,
 * a webhook to deliver to. Those URLs are attacker-influenced input, and on a
 * self-hosted box the network behind Duty is the operator's own: cloud metadata
 * at 169.254.169.254, internal admin panels, databases on localhost. Following
 * such a URL turns Duty into a proxy into that network, and the fetched body is
 * persisted to the knowledge base and readable through the API.
 *
 * `assertPublicHttpUrl` resolves the host and rejects anything that lands on a
 * loopback, private, link-local, or otherwise non-public address. Because
 * `fetch` follows redirects by default, `fetchPublicHttp` re-validates every hop
 * instead of only the URL the caller supplied.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { badRequest } from './errors.js';

const MAX_REDIRECTS = 5;

/** Names that resolve inside the host or to a cloud metadata service. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
]);

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

/**
 * Expand an IPv6 address to its eight 16-bit groups.
 *
 * The WHATWG URL parser canonicalises addresses, so `::ffff:127.0.0.1` arrives
 * as `::ffff:7f00:1`. Matching only the dotted form would miss that — which is
 * a real bypass, not a cosmetic one — so this expands every accepted spelling
 * to hextets and judges the numeric value.
 */
function hextets(address: string): number[] | null {
  const value = address.toLowerCase().split('%')[0];
  let prefix = value;
  let tail: number[] = [];

  const dotted = value.match(/^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    prefix = dotted[1];
    const octets = dotted[2].split('.').map(Number);
    if (octets.some((n) => n > 255)) return null;
    tail = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
  }

  const parse = (part: string) => parseInt(part, 16);
  const split = prefix.split('::');
  if (split.length > 2) return null;

  if (split.length === 1) {
    const groups = [...split[0].split(':').filter(Boolean).map(parse), ...tail];
    if (groups.length !== 8 || groups.some(Number.isNaN)) return null;
    return groups;
  }

  const left = split[0] ? split[0].split(':').filter(Boolean).map(parse) : [];
  const right = split[1] ? split[1].split(':').filter(Boolean).map(parse) : [];
  if ([...left, ...right].some(Number.isNaN)) return null;
  const fill = 8 - (left.length + right.length + tail.length);
  if (fill < 0) return null;
  return [...left, ...new Array(fill).fill(0), ...right, ...tail];
}

function isBlockedIpv6(address: string): boolean {
  const h = hextets(address);
  // An address this code cannot parse is refused rather than allowed: failing
  // open on a malformed host is how a guard becomes decoration.
  if (!h) return true;

  const allZero = h.every((n) => n === 0);
  if (allZero) return true; // ::
  if (h.slice(0, 7).every((n) => n === 0) && h[7] === 1) return true; // ::1

  const toIpv4 = () => `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;

  // ::ffff:0:0/96 (IPv4-mapped) and ::/96 (IPv4-compatible) both embed an IPv4
  // address that must be judged by the IPv4 rules.
  if (h.slice(0, 5).every((n) => n === 0) && (h[5] === 0 || h[5] === 0xffff)) {
    return isBlockedIpv4(toIpv4());
  }
  // 64:ff9b::/96 (NAT64) likewise embeds one.
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((n) => n === 0)) {
    return isBlockedIpv4(toIpv4());
  }

  if ((h[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((h[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return false;
}

/**
 * Throw unless `raw` is an http(s) URL whose host resolves only to public
 * addresses. Returns the parsed URL so callers do not parse twice.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest(`Not a valid URL: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest(`Only http and https URLs are allowed, got "${url.protocol}"`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw badRequest(`Refusing to fetch internal host "${hostname}"`);
  }

  // A literal address can be judged directly; a name has to be resolved first,
  // because "internal.example.com" is free to point at 10.0.0.5.
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw badRequest(`Refusing to fetch non-public address "${hostname}"`);
    return url;
  }

  let resolved: Array<{ address: string }>;
  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    throw badRequest(`Could not resolve host "${hostname}"`);
  }
  if (!resolved.length) throw badRequest(`Could not resolve host "${hostname}"`);
  for (const entry of resolved) {
    if (isBlockedAddress(entry.address)) {
      throw badRequest(`"${hostname}" resolves to the non-public address ${entry.address}`);
    }
  }
  return url;
}

/**
 * `fetch` for tenant-supplied URLs. Validates the initial URL and then every
 * redirect target, so an allowed host cannot bounce the request into the
 * private network.
 */
export async function fetchPublicHttp(
  raw: string,
  init: RequestInit = {},
): Promise<Response> {
  let current = (await assertPublicHttpUrl(raw)).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, { ...init, redirect: 'manual' });
    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get('location');
    if (!isRedirect || !location) return response;
    current = (await assertPublicHttpUrl(new URL(location, current).toString())).toString();
  }
  throw badRequest(`Too many redirects fetching ${raw}`);
}

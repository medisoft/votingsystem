import { isIP } from 'node:net';

export type SourceIpMode = 'truncated' | 'omitted';

let activeSourceIpMode: SourceIpMode = 'truncated';

/**
 * Sets the process-wide IP retention mode used by audit writes.
 *
 * @param mode - `truncated` stores a /24 or /48 prefix; `omitted` stores null.
 */
export function setActiveSourceIpMode(mode: SourceIpMode) {
  activeSourceIpMode = mode;
}

/**
 * Returns the IP retention mode last configured by `setActiveSourceIpMode`.
 */
export function getActiveSourceIpMode(): SourceIpMode {
  return activeSourceIpMode;
}

/**
 * Reduces a client IP to a coarse prefix so audit rows never store a
 * precise address. IPv4 is kept as /24; IPv6 is kept as /48.
 *
 * Truncation happens at write time because `sourceIp` is part of the
 * hash-chained audit payload and cannot be rewritten later.
 *
 * @param ip - Address reported by Fastify, possibly with an IPv6 zone id.
 * @returns Truncated address, or null when the value is missing or invalid.
 */
export function truncateClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = stripZoneId(ip.trim());
  if (!trimmed) return null;
  const mapped = ipv4FromMapped(trimmed);
  const version = isIP(mapped);
  if (version === 4) return truncateIpv4(mapped);
  if (version === 6) return truncateIpv6(mapped);
  return null;
}

/**
 * Applies the configured IP retention mode before an audit write.
 *
 * @param ip - Address reported by the request.
 * @param mode - `truncated` stores a prefix; `omitted` stores null.
 */
export function retainClientIp(
  ip: string | null | undefined,
  mode: SourceIpMode,
): string | null {
  if (mode === 'omitted') return null;
  return truncateClientIp(ip);
}

function stripZoneId(ip: string): string {
  const zone = ip.indexOf('%');
  return zone === -1 ? ip : ip.slice(0, zone);
}

function ipv4FromMapped(ip: string): string {
  const prefix = '::ffff:';
  if (
    ip.toLowerCase().startsWith(prefix) &&
    isIP(ip.slice(prefix.length)) === 4
  )
    return ip.slice(prefix.length);
  return ip;
}

function truncateIpv4(ip: string): string {
  const [a, b, c] = ip.split('.');
  return `${a}.${b}.${c}.0`;
}

function truncateIpv6(ip: string): string | null {
  const groups = expandIpv6(ip);
  if (!groups) return null;
  return `${groups[0]}:${groups[1]}:${groups[2]}::`;
}

/**
 * Expands an IPv6 address into eight lowercase hexadecimal groups.
 *
 * @param ip - Canonical or compressed IPv6 text.
 * @returns Eight groups, or null when the address cannot be expanded.
 */
function expandIpv6(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) =>
    part.length === 0
      ? []
      : part.split(':').filter((group) => group.length > 0);
  const head = parse(halves[0] ?? '');
  const tail = halves.length === 2 ? parse(halves[1] ?? '') : [];
  if (head.length + tail.length > 8) return null;
  const missing = 8 - head.length - tail.length;
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  return groups.map((group) => group.toLowerCase().padStart(4, '0'));
}

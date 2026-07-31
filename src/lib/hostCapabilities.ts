/**
 * What a connected CLI build can understand, derived from its version.
 *
 * Mirror of the CLI's `clients/capabilities.ts`, which gates the same features
 * on the app's version. Both ends ship independently, so each side must assume
 * the other may be older and degrade to the format both understand.
 *
 * To add a capability: add a MIN_VERSION constant and a field on
 * `HostCapabilities`, and default it to `false` for unparseable versions. Never
 * default a capability to `true` on parse failure — an unidentified peer must
 * get the conservative behaviour.
 */
export interface HostCapabilities {
	/**
	 * CLI can gunzip an encrypted envelope carrying `enc: "gzip"`. Older CLIs
	 * decrypt straight to UTF-8 JSON and would fail to parse a compressed
	 * payload, dropping every message.
	 */
	gzipPayloads: boolean;
}

/** First CLI release that understands `enc: "gzip"` on encrypted envelopes. */
const MIN_VERSION_GZIP_PAYLOADS: SemVer = [0, 0, 49];

type SemVer = [major: number, minor: number, patch: number];

const NO_CAPABILITIES: HostCapabilities = {
	gzipPayloads: false,
};

/**
 * Parse the leading semver out of a CLI version string. Returns null for
 * anything that does not start with three dot-separated integers.
 */
function parseVersion(version: string): SemVer | null {
	const match = /^\s*(\d+)\.(\d+)\.(\d+)/.exec(version);
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** `a >= b`, comparing major, then minor, then patch. */
function isAtLeast(a: SemVer, b: SemVer): boolean {
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] > b[i];
	}
	return true;
}

/**
 * Resolve what the connected CLI supports. An unparseable or missing version
 * yields no capabilities, so unknown hosts get the old wire format.
 */
export function getHostCapabilities(
	cliVersion: string | undefined,
): HostCapabilities {
	if (!cliVersion) return NO_CAPABILITIES;
	const version = parseVersion(cliVersion);
	if (!version) return NO_CAPABILITIES;
	return {
		gzipPayloads: isAtLeast(version, MIN_VERSION_GZIP_PAYLOADS),
	};
}

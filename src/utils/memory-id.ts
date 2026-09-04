/**
 * ULID generation for unique memory identifiers.
 * Format: "mem_" prefix + 26-character Crockford Base32 ULID.
 * Pure TypeScript implementation with no external dependencies.
 *
 * ULID structure: 48-bit timestamp (ms) + 80-bit randomness
 * Crockford Base32 alphabet: 0123456789ABCDEFGHJKMNPQRSTVWXYZ
 */

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_LENGTH = 26;
const PREFIX = "mem_";

let lastTimestamp = 0;
let randomCounter = 0;

/**
 * Generate a new memory ID: "mem_" + 26-char Crockford Base32 ULID.
 * Monotonically increasing within the same millisecond.
 */
export function generateMemoryId(): string {
    let timestamp = Date.now();

    // Ensure monotonicity within the same millisecond
    if (timestamp === lastTimestamp) {
        randomCounter++;
        // If counter overflows 80 bits, wait for next ms
        if (randomCounter > 0xffffffffff) {
            while (Date.now() <= lastTimestamp) {
                // Busy wait for next millisecond
            }
            timestamp = Date.now();
            randomCounter = 0;
        }
    } else {
        randomCounter = Math.floor(Math.random() * 0xffffffffff);
        lastTimestamp = timestamp;
    }

    // Encode timestamp (48 bits → 10 Crockford chars)
    const timeChars = encodeTime(timestamp, 10);

    // Encode randomness (80 bits → 16 Crockford chars)
    const randomChars = encodeRandom(randomCounter, 16);

    return `${PREFIX}${timeChars}${randomChars}`;
}

/**
 * Validate memory ID format: /^mem_[0-9A-HJKMNP-TV-Z]{26}$/
 */
export function isValidMemoryId(id: string): boolean {
    if (!id.startsWith(PREFIX)) return false;
    const ulid = id.slice(PREFIX.length);
    if (ulid.length !== ULID_LENGTH) return false;
    return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(ulid);
}

/**
 * Extract creation timestamp from a ULID.
 */
export function extractTimestamp(id: string): Date {
    if (!isValidMemoryId(id)) {
        throw new Error(`Invalid memory ID: ${id}`);
    }
    const ulid = id.slice(PREFIX.length).toUpperCase();
    let timestamp = 0;
    for (let i = 0; i < 10; i++) {
        const charIndex = CROCKFORD_ALPHABET.indexOf(ulid[i]);
        if (charIndex === -1) throw new Error(`Invalid ULID character: ${ulid[i]}`);
        timestamp = timestamp * 32 + charIndex;
    }
    return new Date(timestamp);
}

/**
 * Encode a timestamp into Crockford Base32 characters.
 */
function encodeTime(timestamp: number, length: number): string {
    const chars: string[] = [];
    let value = timestamp;
    for (let i = 0; i < length; i++) {
        chars.unshift(CROCKFORD_ALPHABET[value % 32]);
        value = Math.floor(value / 32);
    }
    return chars.join("");
}

/**
 * Encode randomness into Crockford Base32 characters.
 */
function encodeRandom(value: number, length: number): string {
    const chars: string[] = [];
    let remaining = value;
    for (let i = 0; i < length; i++) {
        chars.unshift(CROCKFORD_ALPHABET[remaining % 32]);
        remaining = Math.floor(remaining / 32);
    }
    return chars.join("");
}

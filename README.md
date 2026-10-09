# Venus AI Local Web v2.2 — Fixed Entity Recognition

v2.1 still showed peripheral source pages even though canonical lookup was implemented.

## Exact bug

The generic entity regex was case-insensitive and too greedy.

For this source sentence:

    It has a mass about two thirds that of Jupiter, largest planet in the Solar System.

it could extract:

    two thirds that of Jupiter

instead of:

    Jupiter

For:

    Atmosphere of Mercury is the closest planet to the Sun.

it could extract:

    Atmosphere of Mercury

instead of:

    Mercury

Canonical lookup then searched for the wrong entity, failed, and kept the original peripheral source.

## v2.2 fix

For planet questions, Venus AI now recognizes the eight Solar System planet names explicitly:

- Mercury
- Venus
- Earth
- Mars
- Jupiter
- Saturn
- Uranus
- Neptune

Superlative relationships such as largest, smallest, and closest-to-Sun are resolved against those planet names before any generic entity extraction is attempted.

The generic regex is also now case-sensitive and less greedy.

## Expected test results

What is the planet Venus?
- source: Venus

What is the largest planet in the solar system?
- answer: Jupiter
- source: Jupiter

Which planet is closest to the Sun?
- answer: Mercury
- source: Mercury (planet)

Is Venus a gas giant or a rocky planet?
- answer: terrestrial/rocky
- source: Venus

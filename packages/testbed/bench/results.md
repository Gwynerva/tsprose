# Testbed benchmark results

Machine: Windows 11, Bun 1.4.2, TypeScript 7.1.0-beta. `bun bench/run.ts <root>` after `bun bench/generate.ts --scale N`.
Scale 1 ≈ Open Math (31 documents, ~27k lines of prose); scale 10 ≈ 301 documents, ~297k lines.

| Metric | content (3 hand-written docs) | generated/1x | generated/10x |
| --- | --- | --- | --- |
| documents / referable nodes | 3 / 70 | 31 / 13 401 | 301 / 139 133 |
| load (import all modules, Bun + transform plugin) | 8 ms | 522 ms | 2 868 ms |
| compile corpus (ids, refs, includes, hooks, derive) | 14 ms | 484 ms | 6 456 ms |
| render HTML | 1 ms | 32 ms | 480 ms |
| JSON round trip | 1 ms | 48 ms | 803 ms |
| heap growth | +3 MB | +47 MB | +424 MB |
| hash collisions (different content, same hash) | 0 / 111 | 0 / 25 612 | 0 / 259 480 |
| largest document: compile / fmt / check | 2 / 1 / 3 ms (136 lines) | 44 / 20 / 27 ms (2 349 lines) | 51 / 33 / 26 ms (2 031 lines) |
| id stability after inserting a paragraph at the top | 44 / 44 unchanged | 1 171 / 1 171 unchanged | — |
| per-file fmt / check sweep | 0.4 ms / file | 8.3 ms / 6.4 ms per file | 13.3 ms / 10.4 ms per file |

Notes

- Every synthetic warning is `title/duplicate` from the generator reusing the title "Почему?"; there are no errors.
- Formatting is idempotent on every file measured; the largest real Open Math article (3 385 lines) formats in ~20 ms warm.
- The 10x stability row is missing because the first 10x run used an older metric; rerun `bun bench/run.ts generated/10x` to fill it.

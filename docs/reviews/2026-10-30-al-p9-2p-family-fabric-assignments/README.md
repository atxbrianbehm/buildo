# AL.P9.2p: Per-member fabric assignment contract

A versioned, owned assignment names six distinct family members and either inherits one validated fabric artifact or supplies a separately validated member override. A content hash protects the assignment, and a scope check compares family and member identities and the pinned inherited fabric hash to the owning source. Unknown members, duplicates, altered assignment data and tampered fabric reject. Assignment creation captures input before asynchronous validation; structural graph and atlas are not touched.

This is an isolated data contract, not yet a saved family format, renderer resource, seeded variation, artist control or visual result. It makes no claim about metagrinder coverage or historical colors. All five repository checks passed: 2,068 tests across 162 files, standard browser smoke, typecheck, lint and build. The build retains its large-chunk warning.

# AL.P9.1e: Atlas and supplemental fabric coexistence

The surface runtime validates a separate awning fabric artifact and binds existing atlas-backed finish layers independently of awning meshes. The scene adapter checks that the surface runtime and the fabric owner pin the same fabric hash. Semantic addresses must be unique, and a supplemental slot cannot alias an atlas slot. Direct surface layers on the awning are explicitly unsupported and reject rather than disappearing. Atlas content remains independent of the fabric source.

A focused integration test uses a real compiled construction fixture and synthetic semantic awning mesh IR to exercise the actual surface runtime and scene adapter, including a finished frame, separate fabric binding, invalid and mismatched fabric, unsupported layer targets and lifecycle. The synthetic geometry is not graph-generated awning geometry and this is not an application screenshot; graph, worker, project/session ownership and product rendering remain pending.

Full repository validation is pending.

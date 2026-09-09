# AI Memory Contract

The SHELL contract for local, per-assistant memory slots living in Memory Box inside SHELL's Core. SHELL owns the store and permission model; Tenari's Companion uses the same path natively.

**Built:**
None yet — this order specifies the contract; nothing below is implemented.

**Not built yet:**
- The 6-step build order: specify the slot schema/identity/provenance/versioning → specify create/read/append/correct/export/delete grants with revocation and audit → implement the SHELL-local reference store, proven never to leak into cloud or sync → publish the external README, conformance fixtures, and tests → connect Tenari's Companion through the native adapter → prove owner inspection, export round-trip, correction, deletion, revocation, and assistant isolation

REQUEST: Treat STOP-style words anywhere in a short message as an opt-out, not only as the first token
LANE: Dev 3
STATUS: open
CONTRACT SECTION: docs/CONTRACTS.md §3.10 (Inbound command grammar), T-MS-01
CHANGE: Today "the first token decides", so "please stop messaging me" is `unknown` and the courier stays opted in. Proposal: if a message of 8 words or fewer contains one of STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT as a whole word, and no earlier token is YES/ACCEPT/NO/DECLINE/JOIN, the command is `stop`. Longer messages keep the first-token rule. Every join_ack and offer already tells the user to "Text STOP", which stays.
WHY (which acceptance criterion needs it): AC-11 (STOP semantics) and the Photon ToS requirement to honor opt-outs (R-PH-10). A missed opt-out is a worse failure than an accidental one, because a user who stops by mistake can text JOIN again.
COMPATIBILITY: additive for senders (messages that were `unknown` and got the help text become `stop`). A behavior change for T-MS-01, which Dev 3 updates.
TESTS AFFECTED: tests/messaging/grammar.test.ts (Dev 3).
DECISION:
MERGED SHA:

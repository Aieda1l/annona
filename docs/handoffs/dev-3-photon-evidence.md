# Photon track evidence: one live run on the deployed stack (Dev 3)

Written 2026-10-18 by Dev 3 (messaging). Everything below was read back from **Photon's own message list** (`GET /v1/projects/<project>/messages`, platform `imessage`) after the run, not from our app's logs, so it is Photon's record of what its network sent and received. Times are UTC on 2026-10-18 (00:36 to 01:23 AM PDT).

## What ran

- **App:** the deployed site (Vercel + Supabase Postgres), `MESSAGING_PROVIDER=photon`, real Gemini for the photo draft.
- **Messaging:** Photon 2.0 Beta, iMessage, one shared line, three opted-in phones (one donor, two couriers). All data is synthetic; the phones are teammates who opted in by texting JOIN.
- **Worker:** `pnpm worker` on a teammate's laptop, polling Photon's message list every 2 s and calling the deployed app's tick and inbound routes with an internal secret. No webhook is used (its signature scheme is unverified), so polling is the inbound transport.
- **Labels below:** phone numbers are not recorded anywhere in the repo. "courier phone 1", "courier phone 2" and "donor phone" are labels in order of first appearance.

## What the record shows

- **49 messages:** 25 inbound from the three phones, 24 sent by Annona. **All 24 sent messages reached `delivered`**, each within 2 s of being sent (Photon's `deliveredAt`).
- **Reply speed:** a command reply (JOIN, HELP, YES, STOP) arrived 1 to 2 s after the text, typically. A donor photo reply (download the attachment, ask Gemini, build the checklist link) took 8 to 9 s.
- **Opt-in (JOIN) x3**, one welcome each; a repeated JOIN got the same welcome again during this run (the "already opted in" reply is merged afterwards, #74).
- **Donor photo to checklist link:** `[photo]` from the donor phone, then a `draft_ready` message with Gemini's description and an https checklist link on the deployed site, opened and completed on the donor's phone.
- **Offer, expiry, re-offer:** an offer to courier phone 1 got no reply inside the 60 s demo window and expired; the next tick offered it to courier phone 2.
- **First claim wins:** courier phone 2 replied `YES <code>` and got the pickup details; courier phone 1's late `YES` on the first offer got "Another courier already claimed this pickup. No assignment was made." with no address.
- **Repeated claim:** the claiming courier's second `YES` got "You already claimed this pickup" with the same details and changed nothing.
- **Late YES after the window:** a courier who replied after the 60 s window got "This donation is no longer available. No assignment was made." with no address.
- **STOP:** the first two STOPs (07:43) were received and applied, but their confirmation was dropped by a bug in our real-gateway route lookup, found by this run and fixed in #73; the rows are in the table with no reply. After the fix, later STOPs from a joined phone were answered with the opt-out confirmation (`stop_ack`) 2 s later. The STOP at 08:03:58 has no reply for a different, expected reason: that phone had already opted out at 07:43 and had not texted JOIN again, so Annona ignores it by design (not a repeat of the #73 bug). A phone that has opted out is ignored until it texts JOIN again, so its later HELP and YES got no reply; that is by design (the 07:45 rows).
- **Nothing was sent twice** and no address went to a phone that had not claimed. Checked against the full text in Photon's record (text not reproduced here): the synthetic pickup address appears in exactly two of the 24 sent messages, both to the courier who claimed (the claim reply at 07:42:08 and the repeat-claim reply at 07:43:04). The losing courier's reply (07:42:17) and the two "no longer available" replies (08:22:22, 08:22:31) contain no address.

## The record (Photon message ids)

Inbound texts other than a command (JOIN, STOP, HELP, YES <code>) or a photo are not reproduced. Annona's messages are labelled by their purpose; their text is not reproduced either, because offers and claim replies contain the synthetic pickup details and the checklist link contains a one-time token.

| Time (UTC) | Direction | What | Photon message id | Status | Delivered at |
|---|---|---|---|---|---|
| 07:36:37 | courier phone 1 -> Annona | JOIN | `pho_msg_4mg4sd12arhmxb077nentz039v` | received |  |
| 07:36:38 | courier phone 2 -> Annona | JOIN | `pho_msg_2g1nvsj1gxhh7sztbsy00wf2p5` | received |  |
| 07:36:40 | Annona -> courier phone 1 | join_ack | `pho_msg_4xymak3kp9g268gfnqn4xm423g` | delivered | 07:36:41 |
| 07:36:40 | Annona -> courier phone 2 | join_ack | `pho_msg_1ytn69f9msgfyb1mffhq5tp9dm` | delivered | 07:36:41 |
| 07:36:46 | donor phone -> Annona | JOIN | `pho_msg_27z9zq68dnh1zr34wr0teqqwv8` | received |  |
| 07:36:47 | Annona -> donor phone | join_ack | `pho_msg_1790jxqsg2gex992jczqwqfej7` | delivered | 07:36:48 |
| 07:38:04 | donor phone -> Annona | [photo] | `pho_msg_7rn4pdz66ng9g9xhjx3hzxf8tn` | received |  |
| 07:38:13 | Annona -> donor phone | draft_ready | `pho_msg_5q9331ww76gcfse4j98h8djj4b` | delivered | 07:38:14 |
| 07:40:48 | Annona -> courier phone 1 | offer | `pho_msg_4g8wdagwxjg6x9wq4xnq64qf17` | delivered | 07:40:49 |
| 07:41:51 | Annona -> courier phone 2 | offer | `pho_msg_4amjnmsdtkhm69r70a4h5add0t` | delivered | 07:41:52 |
| 07:42:06 | courier phone 2 -> Annona | YES CPCW | `pho_msg_1083zpqyhfhm9swy53p0hrwjwn` | received |  |
| 07:42:08 | Annona -> courier phone 2 | claim_result: claimed | `pho_msg_65akwwjb8bhz8am1qw6gfsy8zr` | delivered | 07:42:09 |
| 07:42:15 | courier phone 1 -> Annona | YES 93AK | `pho_msg_6th981mbz3hjarjd8rk2qqqdnv` | received |  |
| 07:42:17 | Annona -> courier phone 1 | claim_result: late claim refused, no address | `pho_msg_7qrbh3twxmhztafnff39wmz4w3` | delivered | 07:42:17 |
| 07:43:02 | courier phone 2 -> Annona | YES CPCW | `pho_msg_3c5jsme7mahe1rwkfn4k7vwe02` | received |  |
| 07:43:04 | Annona -> courier phone 2 | claim_result: already claimed (same details) | `pho_msg_6p9fq4yeq2g96tgd6bfpnsh24e` | delivered | 07:43:05 |
| 07:43:15 | courier phone 1 -> Annona | STOP | `pho_msg_0b6zfpj6nggkn90zvrzhth5vj8` | received |  |
| 07:43:16 | courier phone 2 -> Annona | STOP | `pho_msg_7tt3sy9hgfg11te8t7chkakrt7` | received |  |
| 07:45:41 | courier phone 2 -> Annona | HELP | `pho_msg_1nn4e71y4ygm8tfd3skwnr21kc` | received |  |
| 07:45:56 | courier phone 2 -> Annona | YES CPCW | `pho_msg_3jq1rgkdpagp7r0x7edpxxgqen` | received |  |
| 08:03:58 | courier phone 1 -> Annona | STOP | `pho_msg_4g4banfsqdhazvacnfkw09g8bd` | received |  |
| 08:09:57 | courier phone 1 -> Annona | JOIN | `pho_msg_5xhatpqd7cgc38eb838js5zz5m` | received |  |
| 08:09:59 | Annona -> courier phone 1 | join_ack | `pho_msg_1mx04j81p3h6h9zcjncj229wpc` | delivered | 08:10:00 |
| 08:10:01 | courier phone 2 -> Annona | JOIN | `pho_msg_14k8jvea5qhj9vt6nvbc3mthf3` | received |  |
| 08:10:04 | Annona -> courier phone 2 | join_ack | `pho_msg_64p4f54r0xhn0ad339nhbfy16m` | delivered | 08:10:05 |
| 08:10:07 | courier phone 1 -> Annona | STOP | `pho_msg_4wmedtb8vcg1erqeej0bnkxg6w` | received |  |
| 08:10:09 | Annona -> courier phone 1 | stop_ack | `pho_msg_0qjdps544khnvvxbj9qdxav9tj` | delivered | 08:10:09 |
| 08:10:14 | courier phone 2 -> Annona | HELP | `pho_msg_1373g3q5xhgg6s25esk2jyrdq2` | received |  |
| 08:10:16 | Annona -> courier phone 2 | help | `pho_msg_4e43hkfwgjh289m29jh9wxh43y` | delivered | 08:10:16 |
| 08:10:44 | courier phone 1 -> Annona | JOIN | `pho_msg_0b8n5vfn80ggvs5kw67sa36y5b` | received |  |
| 08:10:46 | Annona -> courier phone 1 | join_ack | `pho_msg_0j5rrt7gy8g4hb6hg3wqx3gw47` | delivered | 08:10:47 |
| 08:10:55 | donor phone -> Annona | [photo] | `pho_msg_3sfxd9qc3rhh88t47je10qgx1a` | received |  |
| 08:11:03 | Annona -> donor phone | draft_ready | `pho_msg_6mf0tp3j79g7fvd66f61ada7ng` | delivered | 08:11:04 |
| 08:13:11 | courier phone 1 -> Annona | HELP | `pho_msg_64xnha82pvhn9ax4x7ftmr0bc3` | received |  |
| 08:13:12 | Annona -> courier phone 1 | help | `pho_msg_2rcsvf1v07hhfa6t5k9f1vmysd` | delivered | 08:13:13 |
| 08:13:37 | courier phone 1 -> Annona | JOIN | `pho_msg_7nfhq6pjerhfdsyssz9p61cnbe` | received |  |
| 08:13:38 | Annona -> courier phone 1 | join_ack | `pho_msg_1wyyq8y1tagfwavfag8qp394rj` | delivered | 08:13:39 |
| 08:13:57 | courier phone 1 -> Annona | JOIN | `pho_msg_1mfqyr24n6h3wrdxzgrdcsq8mx` | received |  |
| 08:13:58 | Annona -> courier phone 1 | join_ack | `pho_msg_3rsakbhc4rgafrf2vdw861g4kz` | delivered | 08:13:59 |
| 08:19:53 | Annona -> courier phone 1 | offer | `pho_msg_2443816zdngbpvc6gpz9q3fsa9` | delivered | 08:19:54 |
| 08:20:55 | Annona -> courier phone 2 | offer | `pho_msg_423mw3wm28h80vjmgtnbhqwqg3` | delivered | 08:20:57 |
| 08:22:20 | courier phone 2 -> Annona | YES 3MTR | `pho_msg_3cwmhr64n3h6cbnw7zm3sj2x9n` | received |  |
| 08:22:22 | Annona -> courier phone 2 | claim_result: not available (late YES after the 60 s window), no address | `pho_msg_6jqqakxvbhgc09t6fc6s6wqcp9` | delivered | 08:22:23 |
| 08:22:30 | courier phone 2 -> Annona | YES 3MTR | `pho_msg_23hn11pq2phz1v2ztrc689mf00` | received |  |
| 08:22:31 | Annona -> courier phone 2 | claim_result: not available (late YES after the 60 s window), no address | `pho_msg_6d561fb6rvgzts20yp4mtbdcnf` | delivered | 08:22:32 |
| 08:22:53 | courier phone 2 -> Annona | STOP | `pho_msg_0d6jzkcdaqhsds2z52b5kgtpqe` | received |  |
| 08:22:55 | Annona -> courier phone 2 | stop_ack | `pho_msg_2bas0gqvkphk8sz0yetvbtbp2f` | delivered | 08:22:56 |
| 08:23:46 | courier phone 1 -> Annona | HELP | `pho_msg_0bebbk7e2ygycsndj6a8b3ytmy` | received |  |
| 08:23:48 | Annona -> courier phone 1 | help | `pho_msg_2qx86krgneg92b7xzwx17pm3v0` | delivered | 08:23:49 |

## What this does not prove

- **Not a race.** The claims above are sequential texts from a few people, not a test of two couriers claiming at the same instant. First-claim-wins under concurrency rests on Dev 2's T-CO-17 run on real Postgres, not on this record.
- **Not a failure path.** No send was refused or failed by Photon during this run, so the `failed` delivery handling has only stubbed-network tests.
- **Photon is Beta.** Its plan and billing were not verified; the project key was created through its API and works.
- **Synthetic data only.** The donor, the food and the pickup details are demo data. Nothing here is a real food donation, and nothing here is a food-safety certification.

## How to re-check

Anyone with the project key can list the same messages with `GET /v1/projects/<project id>/messages?platform=imessage&createdSince=2026-10-18T07:30:00.000Z&order=asc&pageSize=50` and match the ids above. The key is not in the repo.

## Addendum: the repeated-JOIN reply, checked live after #74 was deployed

The table above is from the first run, where a repeated JOIN got the full welcome again. After #74 ("already opted in") was merged and deployed, an already-joined courier phone texted JOIN twice more and Photon's record shows the new reply each time, both delivered within 1 s:

| Time (UTC) | Direction | What | Photon message id | Status | Delivered at |
|---|---|---|---|---|---|
| 09:03:13 | courier phone 1 -> Annona | JOIN | `pho_msg_2p64sx9xe9hxbaa3d9fs2q87tg` | received | |
| 09:03:15 | Annona -> courier phone 1 | join_ack (already opted in) | `pho_msg_5fb88r2v6ahyjrys9mymb9kyyv` | delivered | 09:03:16 |
| 09:03:23 | courier phone 1 -> Annona | JOIN | `pho_msg_4zy9kbv4gwgssbv6w7rdq8xcta` | received | |
| 09:03:25 | Annona -> courier phone 1 | join_ack (already opted in) | `pho_msg_1a4ddfezvrhnnt0khcb0ct90ed` | delivered | 09:03:25 |

For the record: earlier checks of the same phone at 08:53 and 08:58 still got the old welcome, because the deployed site was running an older build than `main`; the first deploys after the merge did not take. It matched `main` by 09:03. Nothing in the app code was wrong.

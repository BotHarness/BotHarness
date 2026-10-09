# #1220: timed question card through the real Web Client

Verified 2026-10-09 (Asia/Tokyo) on application revision
`df380a9599277f858e29adb02856dc21d12b044a` and isolated native DSH
`0.2.0-rc.2`, upstream `639ed015397290b3745d163aafe02ffee4aa3f84`.
Production dependency pins remain RC1. This completes the narrow live DM question tracer;
permission approval, bounded capacity, cold recovery and Group privacy remain gated.

## Observable result

The Human uses the actual Web composer to request one native timed question. After its
two-second foreground deadline, the original card remains answerable. The Human sends an
unrelated message through the composer, receives a real model reply, and waits until that
entire native Turn has ended. Clicking Canary and **Answer and continue** on the original
card submits its answer through the authenticated application bridge. The original Session
admits one qualified native reply, the model sends `ANSWER_1220 Canary` with a matching
canonical Channel receipt, and the card shows answered.

The [sanitized timeline](../evidence/issue-1220/timed-question-card.json) retains the exact
application baseline, original Session/call, pending result, continued/settled Projection,
native Inbox enqueue/admission, actual model route, Channel receipts and zero browser
console warnings/errors. The original pending Tool result is unchanged; no Agent cancellation,
restart, new question, second executor or synthetic ordinary answer input is used.
Wrong-call and settled duplicate native answers refuse.

## Owning boundaries

```text
Native timed request + exact live Agent
  → DM card bound to original Session/call and original Source Event context
  → ASK_TIMED_OUT ends the foreground Promise only
  → native Projection remains the answerability authority
  → same Orchestrator replies to ordinary Human input and becomes idle
  → Human selects the original card
  → existing Bot Runtime serializes a fresh application run for that same live Session
  → current Bot/Session/DM/source-content checks
  → native userQuestions.answer queues its own qualified reply
  → submitted UI until native admission/settlement
  → Channel answer record + real model Channel reply
```

The application-defined binding captures original source context while the question is asked.
It uses the existing per-Bot runtime tail, current authorization and the existing native Agent;
the adapter refuses cold creation for this input. The application run remains available until
native idle, so its Channel tools retain their existing ownership and source-content fences.
It adds no new ordinary Human input or Inbox Admission and does not replay the original work.
All captured source-content fences are checked before native delivery and through the fresh run.

Only the exact native `UserQuestionError` / `ASK_TIMED_OUT` on a timed request permits
continuation. Actual cancellation, stale Agent, changed ownership and missing native question
fail closed. Both foreground and late answers are recorded as answered only after native
settlement. A discarded queued reply can be submitted again; native authority still decides
acceptance. The process-local map correlates cards with live native questions and is discarded
on disposal; it is not a second durable question authority or a cold-recovery implementation.

## Failures retained during qualification

- The [original baseline](1220-native-timed-question-experiment.md) retains the old card's
  cancellation at the native deadline.
- Initial browser attempts targeted a textarea that the Client replaces with a rich composer
  after Channel metadata loads. No Human message was submitted. The runner now uses the
  existing composer input and real send button, checking the actual response.
- An early successful card run answered before the ordinary turn fully settled. A later run
  exposed the application lifecycle gap: native admission and Projection settlement succeeded,
  but three model sends failed with `channel_send: Orchestrator run is unavailable`. The
  [bounded failure](../evidence/issue-1220/timed-question-card-run-gap.json) remains evidence.
  The owning-runtime binding and a mandatory idle-before-answer check address that gap.
- The first card evidence export referenced the Tool-result variable instead of the proof's
  integration field. The checker was corrected without retrying that already accepted answer.

## Reproduce

Build the application, then follow the independent RC2 fixture preparation, strict patch
application, native configuration dump, timed preset and authenticated isolated launch in the
[native experiment](1220-native-timed-question-experiment.md).
Prepare a fresh candidate from the committed application build so `qualification.json` names
that exact application revision. Keep launch JSON, credentials and raw proofs private.

```powershell
node scripts/experiment-timed-question.mjs .humanlayer/tasks/1220/launch-new.json .humanlayer/tasks/1220/card-proof-new.json card
node scripts/experiment-timed-question-proof.mjs .humanlayer/tasks/1220/card-proof-new.json .humanlayer/tasks/1220/card-safe-new.json
```

The `card` argument selects actual browser sends and card selection/submission. The historical
native-only mode remains available for the original incompatible application baseline. The
card runner captures pending and answered screens in both themes at 1500 × 1000. Review the
export before publishing. Stop only the task-owned, verified Host PID after capture.

## Verification and remaining scope

All 76 focused regressions pass, covering legacy cards, foreground and late native settlement, wrong Bot,
invalid answers, duplicate submissions, discarded replies, stale/revoked ownership, native
runtime serialization, authority revoked during run preparation, acknowledgement before completion, same Session and no extra Source
Event. The real browser probe additionally verifies the original native Tool, qualified Inbox
input, model route, completed ordinary Turn and committed replies.

The existing Windows Host Inbox pagination test exceeded its 15-second limit during this run;
four other tests in that file passed. This is reported separately from the focused regression
and CI result. Full Windows repository tests are not claimed. Lint, type checking, bilingual
ledgers, format, application build, Chinese OG font regeneration and direct Astro build pass
(416 pages). CI validates the pushed PR.

This DM control is a question answer, not a permission Grant. Held native countdowns, native
capacity release/reacquisition, restart recovery and same-group privacy rejection/acceptance
need their own real qualification. #1220 → #1036 → #1037 → #1038 remains blocked. No production
upgrade, rollout, upstream post or PR merge is claimed.

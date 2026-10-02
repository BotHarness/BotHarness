# Today Channel activity QA

Baseline: main `e9e716e21bed2248f04fe1368d7508353982c455` before Client changes. Both revisions use the same isolated DSH Profile, two QA Bots, Release room, Planning room, and a real DeepSeek `CHANNEL_READY` reply. Desktop is 1440 × 900; narrow is 420 × 860. Locale and data are matched in both themes.

The baseline has no Channel activity section. After shows six Human Group messages and two DM messages (one Human, one Bot), total eight; sender expansion resolves Captain in the Group and Release QA in DM. The empty Group and empty second DM show zero. Following capture, a ninth message tests late commit refresh.

Run `node scripts/e2e-channel-activity.mjs prepare`, then `node scripts/e2e-channel-activity.mjs check` against a task-isolated instance. Configure `BH_CHANNEL_ACTIVITY_QA_PORT` / `BH_CHANNEL_ACTIVITY_QA_HOME` when using another isolated port/home. No token or private runtime path is committed. The script asserts totals, sender expansion, unchanged unread facts, source Channel navigation and a subsequent committed-message refresh. Host day-boundary/restart, visibility, multi-recipient and real adapter tests cover the canonical query. The measured row height is 56px (40px control + 8px top/bottom), and desktop/narrow layouts have no horizontal overflow.

Human QA: Activity Center → Overview → expand Release room and Release QA, inspect Human/Bot breakdown and Captain; use a row’s arrow to navigate, return to Overview, and try an empty Channel. Toggle the native theme and resize to a narrow viewport. Existing active Bot/actions remain above this section.

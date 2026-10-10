# Native keyboard reading and fixed stage

Before source5cddec35 versus source1c0651ef; DSH0.2.0-rc.1, formal Avatar0.10.0, native dark/English,960×640 CSS viewport, DPR1.425. Both idle screenshots use five real pinned Bots, paused at the same saved horizontal positions.

The before stage uses hidden overflow. After keyboard reading and resize, Ada's stage retains scrollTop4.912px although physical y and CSS bottom are0; character bottom is635.088px. Clip overflow removes the scroll container. All five after stages remain atscrollTop0, with character bottoms640px; at760×540 the bottoms are540.351px within1px device rounding.

Real UI composer requests reach the native model and channel_send; no injected Activity or message state. Text grows in the54px bubble, follows the bottom without a scrollbar, and Control+Home/End reads earlier/latest text. The after recording uses a fixed viewport and is copied byte-for-byte from T3; it successfully decodes without malformed frames. Two recordings that resized mid-capture contained malformed H.264 frames and remain private/excluded. Resize is qualified by actual screenshots and geometry instead. See qualification.json for scopes and exclusions.

Restart deliberately interrupts the owned Host. Its earlier document's connection-lost/shell-timeout is retained; fresh navigation works. No performance, cold-browser, genuine-background or all-motion acceptance is claimed.

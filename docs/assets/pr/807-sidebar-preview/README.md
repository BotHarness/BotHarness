# Channel sidebar display settings evidence (#807)

Captured in the actual pinned DSH 0.2.0 RC1 Web Client, with separate baseline and implementation Profiles using the same fixture shape. Baseline: `647fbe95`. Desktop: 1440 × 900. Mobile overlay: 390 × 844. Each folder names its revision and locale; desktop pairs include light and dark themes.

The isolated PersonaBot **Sidebar Preview QA** has one canonical Memory file, `notes.md`, and an empty Sessions view. No chat messages were sent; Computer and Browser stayed off. The populated preference-dependent presentation is covered by mounted component tests; the actual runtime proves the submenu, exclusive disclosure, repeated choices, keyboard navigation and responsive dismissal.

| Capture                                             | State                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `before*/settings-*.png`                            | Original flat settings; Memory files and Sessions expanded.                                 |
| `after*/memory-git-*.png`                           | Hover terminology, select Git; only Memory evolution expanded and both menus retained.      |
| `after*/memory-terms-*.png`                         | Select Memory again without dismissing either menu.                                         |
| `after*/sessions-workspace-*.png`                   | Move to Sessions layout, select workspace grouping; only Sessions expanded (empty fixture). |
| `after*/sessions-flat-*.png`                        | Select Flat without closing the menus.                                                      |
| `after*/restored-*.png`                             | Escape dismisses settings and restores Memory files plus Sessions.                          |
| `before*/mobile-menu.png`, `after*/mobile-menu.png` | Same 390 × 844 viewport; nested card stays within the overlay viewport.                     |

Reproduction:

1. Select a PersonaBot DM and expand Memory files and Sessions.
2. Open the sidebar gear and hover Memory evolution → Terminology. Other entries collapse temporarily.
3. Switch Git → Memory repeatedly. The selected check and visible terminology update while both menus remain open.
4. Hover Sessions → Session view; choose All → Current. Hover Sessions → Layout; choose By workspace → Flat. Only Sessions remains expanded during each preview.
5. Press Escape, click outside, or toggle the gear. The prior disclosure returns; the selected display preferences remain saved.
6. With the menu open, use arrow keys to focus a group, ArrowRight to enter, Enter to select and ArrowLeft to return. Escape dismisses settings.
7. Repeat in a 390px overlay. Escape dismisses settings while preserving the sidebar and restoring its prior disclosure.

Automated coverage additionally verifies permission revocation, scope changes, disappearing entries, editor cancellation and unchanged stored expansion preferences. Runtime screenshots intentionally contain no private conversation or credentials.

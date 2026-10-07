# #1110 Several apps per platform and the IM apps list

Captured from a real DSH Host (0.2.0-rc.1) with a simulated Lark provider that exposes four apps: Ada has two Lark apps, Bob has one, and one is unbound.

## Before

A Bot could bind only one app per platform. Bind app greyed out a second Lark app, and nothing showed which Bot used which app.

## After

|                      | zh light                      | en dark                      |
| -------------------- | ----------------------------- | ---------------------------- |
| Two Lark apps on Ada | ![](identities-zh-light.webp) | ![](identities-en-dark.webp) |
| Bind app: only free  | ![](bind-zh-light.webp)       | ![](bind-en-dark.webp)       |
| IM apps in settings  | ![](imapps-zh-light.webp)     | ![](imapps-en-dark.webp)     |

The remaining light/dark and zh/en variants are in this folder.

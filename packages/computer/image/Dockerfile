# syntax=docker/dockerfile:1
#
# BotHarness Computer image: a full XFCE desktop with Google Chrome and the
# locales the desktop language needs. Built locally on first use when the
# provider cannot find the image; the base already streams over Selkies.
FROM lscr.io/linuxserver/webtop:ubuntu-xfce

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg locales \
  && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
       | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-chrome-stable \
  && sed -i \
       -e 's/^# *\(en_US.UTF-8 UTF-8\)/\1/' \
       -e 's/^# *\(zh_CN.UTF-8 UTF-8\)/\1/' \
       /etc/locale.gen \
  && locale-gen \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /custom-cont-init.d \
  && printf '%s\n' \
       '#!/bin/sh' \
       'set -e' \
       'mkdir -p /config/Desktop' \
       'cp -f /usr/share/applications/google-chrome.desktop /config/Desktop/google-chrome.desktop' \
       'chmod +x /config/Desktop/google-chrome.desktop' \
       'chown abc:abc /config/Desktop /config/Desktop/google-chrome.desktop' \
       > /custom-cont-init.d/10-desktop-chrome \
  && chmod +x /custom-cont-init.d/10-desktop-chrome

# Overridden per Computer from the DSH locale preference; the generated locales
# above cover the shipped languages.
ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

import { useId, useRef, useState, type ReactElement } from 'react';
import {
  IconDownloadOutlineRegular,
  IconPauseOutlineRegular,
  IconPlayOutlineRegular,
  Tooltip,
  fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const PLAY_EVENT = 'bh-message-audio-play';

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function MessageAudio({
  name,
  size,
  url,
  t,
}: {
  name: string;
  size: number;
  url?: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const instanceId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number>();

  const pauseMount = useMountedResource<HTMLDivElement>(
    (node) => {
      const pauseOthers = (event: Event): void => {
        if (node.isConnected && (event as CustomEvent<string>).detail !== instanceId)
          audioRef.current?.pause();
      };
      window.addEventListener(PLAY_EVENT, pauseOthers);
      return () => window.removeEventListener(PLAY_EVENT, pauseOthers);
    },
    [instanceId],
  );

  const toggle = (): void => {
    const audio = audioRef.current;
    if (audio === null || url === undefined) return;
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent<string>(PLAY_EVENT, { detail: instanceId }));
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  const seek = (value: number): void => {
    const audio = audioRef.current;
    if (audio === null || !Number.isFinite(value)) return;
    audio.currentTime = value;
    setCurrent(value);
  };

  return (
    <div className="bh-message-audio" ref={pauseMount}>
      <button
        type="button"
        className="bh-message-audio-play"
        aria-label={`${playing ? t('message.audio.pause') : t('message.audio.play')}: ${name}`}
        aria-pressed={playing}
        disabled={url === undefined}
        onClick={toggle}
      >
        {playing ? <IconPauseOutlineRegular size={16} /> : <IconPlayOutlineRegular size={16} />}
      </button>
      <span className="bh-message-file-copy">
        <span className="bh-message-file-name" title={name}>
          {name}
        </span>
        <span className="bh-message-audio-meta">
          <span>
            {formatAudioTime(current)} /{' '}
            {duration === undefined ? '--:--' : formatAudioTime(duration)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{fileSizeText(size)}</span>
        </span>
        <input
          type="range"
          className="bh-message-audio-seek"
          min={0}
          max={duration ?? 0}
          step={0.1}
          value={Math.min(current, duration ?? current)}
          disabled={url === undefined || duration === undefined}
          aria-label={`${t('message.audio.seek')}: ${name}`}
          onChange={(event) => seek(event.currentTarget.valueAsNumber)}
        />
      </span>
      {url === undefined ? null : (
        <>
          <span className="bh-message-file-divider" aria-hidden="true" />
          <Tooltip label={t('fileAction.download')} side="bottom" delayMs={500}>
            <a
              className="bh-message-file-download"
              href={url}
              download={name}
              aria-label={`${t('fileAction.download')}: ${name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <IconDownloadOutlineRegular size={16} />
            </a>
          </Tooltip>
        </>
      )}
      {url === undefined ? null : (
        <audio
          ref={audioRef}
          className="bh-message-audio-element"
          src={url}
          preload="metadata"
          aria-label={`${t('message.audio.player')}: ${name}`}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type ReactElement } from 'react';

import {
  Button,
  IconAgentPresetOutline16,
  IconSendOutline16,
  Input,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { Blobatar } from './avatar.js';
import { useClientState } from './bot-sidebar.js';
import { formatRelativeTime } from './labels.js';
import {
  store,
  type BotSummary,
  type ChannelMessage,
  type ChannelSummary,
  type ClientState,
} from './store.js';

function memberName(bots: readonly BotSummary[], slug: string): string {
  return bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
}

function authorLabel(message: ChannelMessage, bots: readonly BotSummary[]): string {
  switch (message.author.kind) {
    case 'human':
      return '你';
    case 'bot':
      return memberName(bots, message.author.slug);
    case 'bridged':
      return message.author.source;
  }
}

function clockTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Welcome({ state }: { state: ClientState }): ReactElement {
  return (
    <div className="bh-root bh-main">
      <div className="bh-content">
        <div className="bh-placeholder">
          <IconAgentPresetOutline16 size={32} />
          <div className="bh-big">与 PersonaBot 对话</div>
          <div>从左侧选择一个 BOT 或频道开始</div>
          {state.bots.length === 0 ? (
            <div className="bh-dim">还没有 PersonaBot；可从左侧「+」或空态按钮创建。</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  bots,
}: {
  message: ChannelMessage;
  bots: readonly BotSummary[];
}): ReactElement {
  const human = message.author.kind === 'human';
  return (
    <div className={`bh-bubble-row${human ? ' bh-bubble-row-me' : ''}`}>
      {message.author.kind === 'bot' ? <Blobatar seed={message.author.slug} size={26} /> : null}
      <div className={`bh-bubble${human ? ' bh-bubble-me' : ''}`}>
        {human ? null : <div className="bh-bubble-author">{authorLabel(message, bots)}</div>}
        <div className="bh-bubble-body">{message.body}</div>
        <div className="bh-bubble-time">{clockTime(message.at)}</div>
      </div>
    </div>
  );
}

function EmptyConversation({
  channel,
  bot,
}: {
  channel: ChannelSummary | undefined;
  bot: BotSummary | undefined;
}): ReactElement {
  if (channel?.type === 'group') {
    return (
      <div className="bh-placeholder bh-chat-empty">
        <span className="bh-channel-mark" aria-hidden="true">
          #
        </span>
        <div className="bh-big">{channel.name}</div>
        <div>群聊消息保存在本地；BOT 参与随 v1.1 到来。</div>
      </div>
    );
  }
  return (
    <div className="bh-placeholder bh-chat-empty">
      {bot !== undefined ? <Blobatar seed={bot.slug} size={56} /> : null}
      <div className="bh-big">
        {bot === undefined ? '本地对话' : `这是与 ${bot.displayName} 的本地对话`}
      </div>
      <div>直接发消息即可；BOT 会自行安排事项，并在这里回复结果。</div>
    </div>
  );
}

function assignmentStatus(activity: 'working' | 'idle' | 'error'): string {
  switch (activity) {
    case 'working':
      return '进行中';
    case 'idle':
      return '已报告';
    case 'error':
      return '出错';
  }
}

function AssignmentsPane({
  state,
  actions,
}: {
  state: ClientState;
  actions: BridgeActions;
}): ReactElement {
  const assignments = state.assignments;
  const selected = assignments.selected;
  return (
    <div className="bh-side-pane-inner">
      <div className="bh-side-pane-head">
        <span>事项</span>
        <Tag tone="neutral">{assignments.items.length}</Tag>
      </div>
      <div className="bh-side-pane-body">
        {assignments.status === 'loading' ? <div className="bh-note">正在加载事项…</div> : null}
        {assignments.status === 'error' && assignments.error !== undefined ? (
          <div className="bh-error">事项加载失败：{assignments.error}</div>
        ) : null}
        {assignments.status === 'ready' && assignments.items.length === 0 ? (
          <div className="bh-note">还没有事项。直接在左侧聊天，BOT 会按需自行安排。</div>
        ) : null}
        {assignments.items.map((assignment) => (
          <button
            type="button"
            className={
              assignment.sessionId === selected?.sessionId
                ? 'bh-assignment-row bh-assignment-row-selected'
                : 'bh-assignment-row'
            }
            key={assignment.sessionId}
            aria-pressed={assignment.sessionId === selected?.sessionId}
            onClick={() => void actions.openAssignment(assignment.sessionId)}
          >
            <div className="bh-assignment-title">{assignment.purpose}</div>
            <div className="bh-assignment-meta">
              <span>{assignmentStatus(assignment.activity)}</span>
              <span>{formatRelativeTime(Date.parse(assignment.updatedAt), Date.now())}</span>
            </div>
            {assignment.latestReport === undefined ? null : (
              <div className="bh-assignment-summary">{assignment.latestReport.summary}</div>
            )}
          </button>
        ))}
        {selected === undefined ? null : (
          <section className="bh-assignment-detail" aria-label="事项详情">
            <div className="bh-assignment-detail-label">事项详情</div>
            <div className="bh-assignment-detail-purpose">{selected.purpose}</div>
            <dl>
              <div>
                <dt>状态</dt>
                <dd>{assignmentStatus(selected.activity)}</dd>
              </div>
              <div>
                <dt>最近报告</dt>
                <dd>{selected.latestReport?.summary ?? '尚未报告'}</dd>
              </div>
              <div>
                <dt>Assignment Session</dt>
                <dd className="bh-assignment-id" title={selected.sessionId}>
                  {selected.sessionId}
                </dd>
              </div>
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}

function MembersPane({
  state,
  channel,
}: {
  state: ClientState;
  channel: ChannelSummary | undefined;
}): ReactElement {
  const members = channel?.members ?? [];
  return (
    <div className="bh-side-pane-inner">
      <div className="bh-side-pane-head">
        <span>成员</span>
        <Tag tone="neutral">{members.length}</Tag>
      </div>
      <div className="bh-side-pane-body">
        {members.length === 0 ? (
          <div className="bh-note">还没有成员。BOT 参与群聊随 v1.1 到来。</div>
        ) : (
          members.map((slug) => (
            <div className="bh-member-row" key={slug}>
              <Blobatar seed={slug} size={26} />
              <span className="bh-name">{memberName(state.bots, slug)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ConversationView({
  state,
  actions,
}: {
  state: ClientState;
  actions: BridgeActions;
}): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');
  const submitting = useRef(false);
  const conversation = state.conversation;
  const channel = conversation.channel;
  const messages = conversation.messages;
  const selection = state.selection;
  const bot =
    selection?.kind === 'bot'
      ? state.bots.find((candidate) => candidate.slug === selection.slug)
      : undefined;
  const title = channel?.name ?? bot?.displayName ?? '群聊';
  const channelId = channel?.id;
  const currentChannel = useRef(channelId);

  useEffect(() => {
    currentChannel.current = channelId;
  }, [channelId]);

  useEffect(() => {
    setDraft('');
  }, [channelId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [messages.length, channelId]);

  const submit = async (): Promise<void> => {
    const body = draft.trim();
    if (body.length === 0 || conversation.sending || submitting.current) return;
    submitting.current = true;
    const submittedFor = currentChannel.current;
    setDraft('');
    try {
      const sent = await actions.send(body);
      if (!sent && currentChannel.current === submittedFor) setDraft(body);
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div className="bh-root bh-main">
      <div className="bh-chat-layout">
        <section className="bh-chat-pane">
          <div className="bh-topbar">
            {bot !== undefined ? (
              <Blobatar seed={bot.slug} size={22} />
            ) : (
              <span className="bh-channel-mark bh-channel-mark-sm" aria-hidden="true">
                #
              </span>
            )}
            <span className="bh-title">{title}</span>
            {bot === undefined || bot.roles.length === 0 ? null : (
              <span className="bh-role-badges">
                {bot.roles.map((role) => (
                  <Tag key={role} tone="neutral">
                    {role}
                  </Tag>
                ))}
              </span>
            )}
            <Tag tone="quiet" className="bh-pill">
              {channel?.type === 'group' ? '群聊' : '私聊'}
            </Tag>
          </div>
          <div className="bh-chat-body" ref={scrollRef}>
            {conversation.status === 'loading' && messages.length === 0 ? (
              <div className="bh-note">正在加载消息…</div>
            ) : null}
            {conversation.status === 'error' && conversation.error !== undefined ? (
              <div className="bh-error">消息加载失败：{conversation.error}</div>
            ) : null}
            {messages.length === 0 && conversation.status !== 'loading' ? (
              <EmptyConversation channel={channel} bot={bot} />
            ) : null}
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} bots={state.bots} />
            ))}
          </div>
          <div className="bh-composer">
            <Input
              className="bh-composer-input"
              placeholder={`发消息给 ${title}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <Button
              variant="primary"
              size="sm"
              icon={<IconSendOutline16 size={16} />}
              aria-label="发送"
              disabled={draft.trim().length === 0 || conversation.sending}
              onClick={() => void submit()}
            >
              {conversation.sending ? '发送中' : '发送'}
            </Button>
          </div>
        </section>
        <aside className="bh-side-pane">
          {state.selection?.kind === 'bot' ? (
            <AssignmentsPane state={state} actions={actions} />
          ) : (
            <MembersPane state={state} channel={channel} />
          )}
        </aside>
      </div>
    </div>
  );
}

export function BotMain({ actions }: { actions: BridgeActions }): ReactElement {
  const state = useClientState();
  if (state.selection === undefined) return <Welcome state={state} />;
  return <ConversationView state={state} actions={actions} />;
}

export function BotPanel({ actions }: { actions: BridgeActions }): ReactElement {
  useEffect(() => {
    store.setMode('bot');
    return () => {
      store.setMode('dsh');
    };
  }, []);
  return <BotMain actions={actions} />;
}

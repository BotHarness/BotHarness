import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';

/** Locale namespace owning the Computer client's copy. */
export const LOCALE_NS = 'botharness-computer';

/** Simplified Chinese dictionary and the key-set source of truth. */
export const zh = {
  'entry.label': '电脑',
  'entry.screen.title': '{name} 的屏幕',
  'entry.shared':
    '这台电脑由本 profile 的所有 PersonaBot 共享：各自拥有自己的窗口，共享登录态与文件。',
  'entry.start': '启动',
  'entry.starting': '启动中…',
  'entry.stop': '停止',
  'entry.stopping': '停止中…',
  'entry.reconnect': '重新连接',
  'entry.connecting': '连接中',
  'entry.reconnecting': '正在重新连接',
  'entry.live': '已连接',
  'entry.noScreen': '暂无画面',
  'entry.openFullscreen': '打开大屏',
  'entry.collapseFullscreen': '收起全屏',
  'entry.authorize': '授权并启动',
  'entry.cancel': '取消',
  'entry.remember': '本次会话内不再询问',
  'entry.authorizeIntro': '启动会在你的机器上执行：',
  'entry.authorize.probe': '检测本机容器运行时；缺失时只给安装引导，不会自动安装',
  'entry.authorize.volume': '创建/复用持久卷（登录态与文件保留在这台电脑上）',
  'entry.authorize.pull': '拉取镜像（首次约 1.2 GB 网络流量）并创建容器',
  'entry.authorize.bind': '把 Web VNC 绑定到 127.0.0.1 的本地端口，仅本机可访问',
  'entry.authorize.storage': '存储位置：{target}',
  'entry.authorize.storageBindRisk':
    'Bind mount 把浏览器 profile（含 SQLite 与缓存）直接落在宿主目录；在 Docker Desktop / Colima 等虚拟文件共享下文件锁不可靠，可能损坏数据，仅建议 Linux 原生 Docker 使用。详见 Docker 文档：https://docs.docker.com/storage/bind-mounts/',
  'entry.phase.pulling': '正在拉取镜像',
  'entry.phase.starting': '正在启动',
  'entry.phase.stopping': '正在停止',
  'entry.phase.exporting': '正在导出',
  'entry.phase.importing': '正在导入',
  'entry.phase.working': '处理中',
  'entry.wait': '请稍候',
  'entry.elapsed': '已用时 {seconds}s',
  'entry.updated': '最后更新 {seconds}s 前',
  'entry.setup':
    '未检测到容器运行时。任选其一安装后重试：\n\nColima（推荐，MIT）：\n  brew install colima docker\n  brew services start colima\n\n或 Docker Desktop：https://www.docker.com/products/docker-desktop/',
  'section.title': 'Computer',
  'section.description': '导出目录、空闲停止与导出 / 导入',
  'rows.exportDir.title': 'Computer 导出目录',
  'rows.exportDir.current': '当前：{dir}',
  'rows.exportDir.empty': '未配置时使用默认导出目录',
  'rows.exportDir.pick': '选择…',
  'rows.exportDir.manual': '手动输入路径',
  'rows.exportDir.save': '保存',
  'rows.exportDir.saving': '正在保存…',
  'rows.exportDir.saved': '导出目录已保存：{dir}',
  'rows.exportDir.needsAbsolute': '路径必须是绝对路径，例如 /path/to/exports',
  'rows.exportDir.saveRejected': 'Host 未接受该导出目录，已恢复原值；请重试',
  'rows.exportDir.open': '打开目录',
  'rows.idle.title': '空闲停止',
  'rows.idle.description': '无观看者时 Computer 自动停止的等待时间',
  'rows.idle.minutes': '{minutes} 分钟',
  'rows.transfer.title': '导出 / 导入',
  'rows.transfer.description': '把 Computer 的持久存储打包成一个归档，或从归档恢复',
  'rows.export': '导出',
  'rows.exporting': '导出中…',
  'rows.download': '下载',
  'rows.exportTo': '导出到…',
  'rows.authorizeExport': '授权并导出',
  'rows.import': '导入…',
  'rows.importing': '导入中…',
  'rows.chooseFile': '选择归档文件…',
  'rows.cancelImport': '取消导入',
  'rows.authorizeImport': '授权并导入 {file}',
  'rows.exported': '已导出：{archive}',
  'rows.exportedDone': '导出完成。',
  'rows.imported': '已从 {file} 导入并重启 Computer。',
  'rows.noArchives': '该目录还没有归档；先导出一次。',
  'rows.noSettings': '设置服务不可用：可以导出/导入，但无法修改目录与空闲时间。',
  'rows.pickerFallback': '目录选择器不可用，已使用当前导出目录：{dir}',
} as const;

/** English dictionary; same keys as the Chinese one. */
export const en: Record<keyof typeof zh, string> = {
  'entry.label': 'Computer',
  'entry.screen.title': "{name}'s screen",
  'entry.shared':
    'This Computer is shared by every PersonaBot in the profile: each keeps its own window and they share logins and files.',
  'entry.start': 'Start',
  'entry.starting': 'Starting…',
  'entry.stop': 'Stop',
  'entry.stopping': 'Stopping…',
  'entry.reconnect': 'Reconnect',
  'entry.connecting': 'Connecting',
  'entry.reconnecting': 'Reconnecting',
  'entry.live': 'Connected',
  'entry.noScreen': 'No picture',
  'entry.openFullscreen': 'Open fullscreen',
  'entry.collapseFullscreen': 'Leave fullscreen',
  'entry.authorize': 'Authorize and start',
  'entry.cancel': 'Cancel',
  'entry.remember': "Don't ask again in this session",
  'entry.authorizeIntro': 'Starting runs these steps on your machine:',
  'entry.authorize.probe':
    'Detect the local container runtime; a missing one only gets setup guidance, never an automatic install',
  'entry.authorize.volume':
    'Create or reuse the persistent volume (logins and files stay on this Computer)',
  'entry.authorize.pull': 'Pull the image (about 1.2 GB the first time) and create the container',
  'entry.authorize.bind':
    'Bind the web VNC endpoint to a loopback port, reachable only from this machine',
  'entry.authorize.storage': 'Storage location: {target}',
  'entry.authorize.storageBindRisk':
    'A bind mount places the browser profile (including SQLite and caches) directly on a host directory; file locking over virtual filesystem sharing (Docker Desktop, Colima, …) is unreliable and can corrupt data — recommended only for native Linux Docker. See the Docker docs: https://docs.docker.com/storage/bind-mounts/',
  'entry.phase.pulling': 'Pulling the image',
  'entry.phase.starting': 'Starting',
  'entry.phase.stopping': 'Stopping',
  'entry.phase.exporting': 'Exporting',
  'entry.phase.importing': 'Importing',
  'entry.phase.working': 'Working',
  'entry.wait': 'Please wait',
  'entry.elapsed': 'Elapsed {seconds}s',
  'entry.updated': 'Last update {seconds}s ago',
  'entry.setup':
    'No container runtime found. Install one of these, then retry:\n\nColima (recommended, MIT):\n  brew install colima docker\n  brew services start colima\n\nOr Docker Desktop: https://www.docker.com/products/docker-desktop/',
  'section.title': 'Computer',
  'section.description': 'Export directory, idle stop, and export / import',
  'rows.exportDir.title': 'Computer export directory',
  'rows.exportDir.current': 'Current: {dir}',
  'rows.exportDir.empty': 'Uses the default export directory when none is set',
  'rows.exportDir.pick': 'Choose…',
  'rows.exportDir.manual': 'Type a path',
  'rows.exportDir.save': 'Save',
  'rows.exportDir.saving': 'Saving…',
  'rows.exportDir.saved': 'Export directory saved: {dir}',
  'rows.exportDir.needsAbsolute': 'Path must be absolute, e.g. /path/to/exports',
  'rows.exportDir.saveRejected':
    'The Host did not accept the export directory — the previous value was restored; try again',
  'rows.exportDir.open': 'Open folder',
  'rows.idle.title': 'Idle stop',
  'rows.idle.description': 'How long the Computer waits without viewers before stopping',
  'rows.idle.minutes': '{minutes} min',
  'rows.transfer.title': 'Export / import',
  'rows.transfer.description': 'Pack the persistent store into one archive, or restore from one',
  'rows.export': 'Export',
  'rows.exporting': 'Exporting…',
  'rows.download': 'Download',
  'rows.exportTo': 'Export to…',
  'rows.authorizeExport': 'Authorize and export',
  'rows.import': 'Import…',
  'rows.importing': 'Importing…',
  'rows.chooseFile': 'Choose archive file…',
  'rows.cancelImport': 'Cancel import',
  'rows.authorizeImport': 'Authorize and import {file}',
  'rows.exported': 'Exported: {archive}',
  'rows.exportedDone': 'Export complete.',
  'rows.imported': 'Imported {file} and restarted the Computer.',
  'rows.noArchives': 'No archives in that directory yet — export once first.',
  'rows.noSettings':
    'Settings service unavailable: export and import still work, but the directory and idle time cannot be changed.',
  'rows.pickerFallback': 'Directory picker unavailable — using the current export directory: {dir}',
};

/** Keys of the Computer client's copy. */
export type ComputerKey = keyof typeof zh;

/**
 * Server-reported phase → the locale key shown while it runs. Shared by the
 * sidebar entry card and the settings rows so both surfaces label a transfer
 * the same way.
 */
export const PHASE_LABEL: Partial<Record<string, ComputerKey>> = {
  pulling: 'entry.phase.pulling',
  starting: 'entry.phase.starting',
  stopping: 'entry.phase.stopping',
  exporting: 'entry.phase.exporting',
  importing: 'entry.phase.importing',
};

/** Namespace-bound translate function. */
export type ComputerTranslate = TranslateNS<typeof LOCALE_NS>;

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Computer client copy. */
    'botharness-computer': ComputerKey;
  }
}

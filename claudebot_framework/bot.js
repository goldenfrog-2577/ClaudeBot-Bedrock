// ClaudeBot — бот-помощник с Claude для мира Minecraft Bedrock 1.19.51 (карта Shop for Ore).
// https://github.com/goldenfrog-2577/ClaudeBot-Bedrock — MIT, (c) 2026 GoldenFrog
//
// Пишет игровой чат в chat.log и выполняет строки из commands.txt:
//   /команда      — команда (нужны права оператора)
//   текст         — сообщение в чат
//   #form ID JSON — ответ на форму (JSON: число кнопки, массив полей или null = закрыть)
//   #quit         — выйти из мира
// В игре отвечает на «@claude <вопрос>» через Claude Code (см. README).
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const bedrock = require('bedrock-protocol')

const DIR = __dirname
const CHAT = path.join(DIR, 'chat.log')
const CMDS = path.join(DIR, 'commands.txt')
const cfg = Object.assign(
  { host: '127.0.0.1', port: 19132, username: 'ClaudeBot', version: '1.19.50' },
  fs.existsSync(path.join(DIR, 'config.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8')) : {}
)

const ts = () => new Date().toLocaleString('ru-RU')
const log = (tag, s) => {
  const line = `[${ts()}] ${tag} ${s}`
  fs.appendFileSync(CHAT, line + '\n')
  console.log(line)
}

// rawtext из tellraw -> читаемая строка: text как есть, translate как {ключ}
function flat (raw) {
  try {
    const j = JSON.parse(raw)
    return (j.rawtext || []).map(p => p.text ?? (p.translate ? `{${p.translate}${p.with ? ' ' + JSON.stringify(p.with) : ''}}` : JSON.stringify(p))).join('')
  } catch { return raw }
}

log('BOT', `подключаюсь к ${cfg.host}:${cfg.port} как ${cfg.username} (протокол ${cfg.version})`)
const client = bedrock.createClient({
  host: cfg.host, port: cfg.port, username: cfg.username, offline: true,
  version: cfg.version, raknetBackend: cfg.raknetBackend ?? 'raknet-native', skipPing: false,
  followPort: cfg.followPort ?? false, connectTimeout: cfg.connectTimeout ?? 30000
})

client.on('join', () => log('BOT', 'соединение установлено (join)'))
client.on('spawn', () => log('BOT', 'появился в мире (spawn)'))
client.on('kick', p => log('KICK', JSON.stringify(p)))
client.on('disconnect', p => log('DISCONNECT', JSON.stringify(p)))
client.on('close', () => { log('BOT', 'соединение закрыто'); process.exit(0) })
client.on('error', e => log('ERROR', e && (e.stack || e.message || e)))

client.on('text', p => {
  let msg = p.message
  if (p.type === 'json' || p.type === 'json_whisper' || p.type === 'json_announcement') msg = flat(msg)
  if (p.parameters && p.parameters.length) msg += '  ' + JSON.stringify(p.parameters)
  if (!msg.trim()) return
  log(`CHAT:${p.type}`, (p.source_name ? `<${p.source_name}> ` : '') + msg)
  onChatLine(p, msg)
})
client.on('modal_form_request', p => {
  log('FORM', `${p.form_id} ${p.data}`)
  // окно входа карты: отвечаем тестовым паролем бота из bot_account.txt
  try {
    const f = JSON.parse(p.data)
    const acc = path.join(DIR, 'bot_account.txt')
    if (f.title === '%account.login.title' && fs.existsSync(acc)) {
      const pw = (fs.readFileSync(acc, 'utf8').match(/password:\s*(\S+)/) || [])[1]
      if (pw) setTimeout(() => send(`#form ${p.form_id} ${JSON.stringify([pw])}`), 1500)
    }
  } catch {}
})
client.on('command_output', p => log('CMD_OUT', JSON.stringify(p.output)))
// actionbar карты приходит несколько раз в секунду: пишем только изменения
let lastBar = ''
client.on('set_title', p => {
  if (!p.text || !p.text.trim()) return
  if (p.type.startsWith('action_bar')) {
    const t = flat(p.text).replace(/\n/g, ' | ')
    if (t === lastBar) return
    lastBar = t
    return log('HUD', t)
  }
  log(`TITLE:${p.type}`, p.text)
})

function send (line) {
  if (line === '#quit') { log('BOT', 'выхожу'); client.disconnect(); return }
  if (line.startsWith('#form ')) {
    const [, id, ...rest] = line.split(' ')
    const json = rest.join(' ').trim()
    const cancel = json === 'null' || json === ''
    client.queue('modal_form_response', cancel
      ? { form_id: Number(id), has_response_data: false, has_cancel_reason: true, cancel_reason: 'closed' }
      : { form_id: Number(id), has_response_data: true, data: json, has_cancel_reason: false })
    log('SENT', `форма ${id}: ${cancel ? 'закрыта' : 'ответ отправлен'}`)
    return
  }
  if (line.startsWith('/')) {
    client.queue('command_request', {
      command: line, internal: false,
      origin: { type: 'player', uuid: crypto.randomUUID(), request_id: '' }
    })
    log('SENT', line)
  } else {
    // чат карты: не больше 200 символов, не больше 5 сообщений за 10 с, без повторов
    for (const part of splitChat(line, 190)) chatQueue.push(part)
  }
}

// ---- очередь чата под ограничения карты (scripts/chat/chat.js) ----
const chatQueue = []
let lastChat = { text: '', at: 0 }
function splitChat (text, max) {
  const out = []; let rest = text.trim()
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max)
    if (cut < max * 0.5) cut = max
    out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}
setInterval(() => {
  const msg = chatQueue.shift()
  if (!msg) return
  // повтор того же текста в пределах 10 с карта отбросит — пропускаем
  if (msg === lastChat.text && Date.now() - lastChat.at < 11000) return
  client.queue('text', {
    type: 'chat', needs_translation: false, source_name: client.username,
    message: msg, xuid: '', platform_chat_id: ''
  })
  lastChat = { text: msg, at: Date.now() }
  log('SENT', msg)
}, 2200)

// Раз в секунду забираем новые строки из commands.txt и очищаем файл
setInterval(() => {
  if (!fs.existsSync(CMDS)) return
  const txt = fs.readFileSync(CMDS, 'utf8').replace(/^﻿/, '')
  if (!txt.trim()) return
  fs.writeFileSync(CMDS, '')
  for (const l of txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    try { send(l) } catch (e) { log('ERROR', `не отправил "${l}": ${e.message}`) }
  }
}, 1000)

// ===== Ответы Claude в игровом чате (только текст) =====
// "@claude <вопрос>" (префикс ! перехватывает карта) от игроков из списка owners. Claude запускается без инструментов
// (--tools ""), ничего не выполняет, бот лишь пересылает его текстовый ответ в чат.
const { spawn } = require('child_process')
const CL = Object.assign({
  enabled: true, trigger: '@claude', owners: [],
  model: 'haiku', context: 20, timeoutSec: 90, maxReplyChars: 570, claudePath: '',
  // команды из ответа Claude выполняются ТОЛЬКО после подтверждения владельцем (@ok)
  confirmWord: '@ok', cancelWord: '@no', confirmSec: 120, maxCmds: 10, maxFillVolume: 4096,
  allowCmds: ['tp', 'teleport', 'time', 'weather', 'give', 'effect', 'gamemode', 'say', 'title',
    'playsound', 'particle', 'summon', 'setblock', 'fill', 'clear', 'enchant', 'xp', 'spawnpoint']
}, cfg.claude || {})
if (!CL.owners.length) log('BOT', 'внимание: в config.json не указан claude.owners — звать Claude и подтверждать команды не сможет никто')
const exeGuess = path.join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe')
const CLAUDE = CL.claudePath || (fs.existsSync(exeGuess) ? exeGuess : 'claude')
const SANDBOX = path.join(DIR, 'claude_sandbox')
if (!fs.existsSync(SANDBOX)) fs.mkdirSync(SANDBOX)

const recent = []
let busy = false
// убираем цветовые коды и глифы шрифта карты (Private Use Area)
const strip = t => t.replace(/§./g, '').replace(/[\uE000-\uF8FF]/g, '')

// Чат карты: "HH:MM [ранг] | [ур] Ник  сообщение"; обычный чат: source_name + message
function parseChat (p, msg) {
  if (p.type === 'chat' && p.source_name) return { name: p.source_name, text: strip(msg) }
  const m = strip(msg).match(/^\s*\d{1,2}:\d{2}\s+(?:\[[^\]]*\]\s*\|?\s*)*(\S+)\s+([\s\S]*)$/)
  return m ? { name: m[1], text: m[2].trim() } : null
}

function onChatLine (p, msg) {
  const c = parseChat(p, msg)
  if (!c) return
  recent.push(`${c.name}: ${c.text}`)
  if (recent.length > CL.context) recent.shift()
  if (!CL.enabled || c.name === client.username) return
  const low = c.text.toLowerCase()
  if (pending && CL.owners.includes(c.name) && (low === CL.confirmWord || low === CL.cancelWord)) return resolvePending(low === CL.confirmWord)
  if (!low.startsWith(CL.trigger)) return
  if (!CL.owners.includes(c.name)) return send(`${c.name}, меня может звать только хост.`)
  const q = c.text.slice(CL.trigger.length).trim()
  if (!q) return send('Напиши вопрос после @claude')
  if (busy) return send('Секунду, ещё думаю над прошлым вопросом.')
  askClaude(c.name, q)
}

// ---- предложенные команды: ждут @ok от владельца ----
let pending = null // { cmds: [], until: ms }

function checkCmd (cmd) {
  if (!cmd.startsWith('/')) return 'не команда'
  if (/[\r\n]/.test(cmd)) return 'перенос строки'
  const name = cmd.slice(1).split(/\s+/)[0].toLowerCase()
  if (!CL.allowCmds.includes(name)) return `/${name} не в белом списке`
  if (name === 'fill') {
    const n = cmd.split(/\s+/).slice(1, 7).map(Number)
    if (n.length < 6 || n.some(isNaN)) return '/fill только с числовыми координатами'
    const v = (Math.abs(n[3] - n[0]) + 1) * (Math.abs(n[4] - n[1]) + 1) * (Math.abs(n[5] - n[2]) + 1)
    if (v > CL.maxFillVolume) return `/fill на ${v} блоков, лимит ${CL.maxFillVolume}`
  }
  return null
}

function proposeCmds (cmds) {
  const ok = []; const bad = []
  for (const c of cmds.slice(0, CL.maxCmds)) { const why = checkCmd(c); why ? bad.push(`${c} (${why})`) : ok.push(c) }
  bad.forEach(b => log('BLOCKED', b))
  if (!ok.length) { if (bad.length) sayText(`Команды отклонены: ${bad.length}, подробности в chat.log`); return }
  pending = { cmds: ok, until: Date.now() + CL.confirmSec * 1000 }
  log('PENDING', ok.join(' ; '))
  sayText(`Предлагаю выполнить (${ok.length}): ${ok.join(' ; ')}`)
  sayText(`Подтверди: ${CL.confirmWord} — выполнить, ${CL.cancelWord} — отмена (${CL.confirmSec} сек)${bad.length ? `. Отклонено: ${bad.length}` : ''}`)
}

function resolvePending (yes) {
  const p = pending; pending = null
  if (!p || Date.now() > p.until) return sayText('Время подтверждения вышло, попроси заново.')
  if (!yes) { log('PENDING', 'отменено'); return sayText('Отменил.') }
  log('PENDING', 'подтверждено владельцем')
  p.cmds.forEach((c, i) => setTimeout(() => send(c), i * 300))
}

function sayText (t) {
  // ответ уходит только как сообщение чата, без команд
  const clean = t.replace(/\s+/g, ' ').replace(/^[\/#]+/, '').trim().slice(0, CL.maxReplyChars)
  if (clean) send(clean)
}

const PERSONA = path.join(DIR, 'persona.md')
const PERSONA_LOCAL = path.join(DIR, 'persona.local.md') // личное: кто владелец, его ник и т.п. (не в репозитории)
const DIALOG = path.join(DIR, 'dialog.jsonl')
// память разговора: последние N пар «вопрос — ответ»
function lastDialog (n) {
  if (!fs.existsSync(DIALOG)) return []
  return fs.readFileSync(DIALOG, 'utf8').trim().split('\n').filter(Boolean).slice(-n)
    .map(l => { try { const d = JSON.parse(l); return `${d.who}: ${d.q}\nClaudeBot: ${d.a}` } catch { return '' } }).filter(Boolean)
}

function askClaude (who, q) {
  busy = true
  send('думаю...')
  const sys = 'Ты ClaudeBot в чате Minecraft. Следуй описанию личности из сообщения пользователя. Отвечай по-русски, 1-3 предложения, обычным текстом. ' +
    `Команды предлагай только если игрок прямо просит действие: отдельными строками "CMD: /команда", не больше ${CL.maxCmds}, только из списка: ${CL.allowCmds.join(', ')}. Их выполнят лишь после подтверждения владельцем.`
  const persona = [PERSONA, PERSONA_LOCAL].filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n\n')
  const mem = lastDialog(CL.memory || 12)
  const prompt = [
    persona && `<личность>\n${persona}\n</личность>`,
    mem.length && `<наш прошлый разговор>\n${mem.join('\n')}\n</наш прошлый разговор>`,
    `<последние сообщения чата>\n${recent.join('\n')}\n</последние сообщения чата>`,
    `Вопрос от ${who}: ${q}`
  ].filter(Boolean).join('\n\n')
  const args = ['-p', '--model', CL.model, '--tools', '', '--no-session-persistence',
    '--strict-mcp-config', '--output-format', 'text', '--system-prompt', sys]
  log('CLAUDE', `вопрос от ${who}: ${q}`)
  let out = ''; let err = ''; let child
  try {
    child = spawn(CLAUDE, args, { cwd: SANDBOX, windowsHide: true })
  } catch (e) { busy = false; log('ERROR', `claude не запустился: ${e.message}`); return sayText('Не смог запустить Claude, см. chat.log') }
  const timer = setTimeout(() => { child.kill(); err += ' timeout' }, CL.timeoutSec * 1000)
  child.stdout.on('data', d => { out += d })
  child.stderr.on('data', d => { err += d })
  child.on('error', e => { err += e.message })
  child.on('close', code => {
    clearTimeout(timer); busy = false
    if (code !== 0 || !out.trim()) {
      log('ERROR', `claude code=${code}: ${err.trim().slice(0, 500)}`)
      return sayText('Claude не ответил, подробности в chat.log')
    }
    log('CLAUDE', `ответ: ${out.trim()}`)
    fs.appendFileSync(DIALOG, JSON.stringify({ t: ts(), who, q, a: out.trim().replace(/\s+/g, ' ') }) + '\n')
    const text = []; const cmds = []
    for (const l of out.trim().split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      const m = l.match(/^CMD:\s*(\/.+)$/i)
      m ? cmds.push(m[1].trim()) : text.push(l)
    }
    if (text.length) sayText(text.join(' '))
    if (cmds.length) proposeCmds(cmds)
  })
  child.stdin.end(prompt)
}

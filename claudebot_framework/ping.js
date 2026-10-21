// Проверка: отвечает ли мир на пинг по разным адресам
const bedrock = require('bedrock-protocol')
const os = require('os')
const hosts = ['127.0.0.1']
for (const list of Object.values(os.networkInterfaces())) for (const a of list) if (a.family === 'IPv4' && !a.internal) hosts.push(a.address)
;(async () => {
  for (const host of hosts) {
    for (const backend of ['raknet-native']) {
      try {
        const r = await bedrock.ping({ host, port: 19132, raknetBackend: backend })
        console.log(`OK   ${host} -> ${r.motd} | ${r.levelName} | v${r.version} | protocol ${r.protocol}`)
      } catch (e) { console.log(`FAIL ${host}: ${e.message}`) }
    }
  }
  process.exit(0)
})()

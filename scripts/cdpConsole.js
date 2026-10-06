/** Capture renderer console for N seconds: node scripts/cdpConsole.js [seconds] [filter] */
const PORT = process.env.CDP_PORT || 9240
const SECONDS = Number(process.argv[2] || 10)
const FILTER = process.argv[3] || ''

async function main () {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const main = targets.filter(t => t.type === 'page').find(t => t.url.includes('index'))
    if (!main) throw new Error('no main window')
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    const lines = []
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data)
        if (m.id !== undefined && pend.has(m.id)) {
            pend.get(m.id)(m)
            pend.delete(m.id)
            return
        }
        if (m.method === 'Runtime.consoleAPICalled') {
            const text = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')
            lines.push(`[${m.params.type}] ${text}`)
        }
        if (m.method === 'Runtime.exceptionThrown') {
            lines.push(`[EXCEPTION] ${JSON.stringify(m.params.exceptionDetails).slice(0, 500)}`)
        }
    })
    const send = (method, params = {}) => new Promise(r => {
        const i = ++id
        pend.set(i, r)
        ws.send(JSON.stringify({ id: i, method, params }))
    })
    await send('Runtime.enable')
    console.log(`capturing console for ${SECONDS}s${FILTER ? ` (filter: ${FILTER})` : ''}...`)
    await new Promise(resolve => setTimeout(resolve, SECONDS * 1000))
    for (const line of lines) {
        if (!FILTER || line.toLowerCase().includes(FILTER.toLowerCase())) {
            console.log(line)
        }
    }
    ws.close()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

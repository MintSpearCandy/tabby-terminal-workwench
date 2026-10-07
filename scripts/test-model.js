const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

// Register .ts extension so require('./constants') inside transpiled code works.
require.extensions['.ts'] = function (mod, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
            esModuleInterop: true,
        },
        fileName: filename,
    }).outputText
    mod._compile(output, filename)
}

// Patch resolution: Node won't try .ts when transpiled code does require("./constants").
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
    try {
        return originalResolve.call(this, request, parent, isMain, options)
    } catch (e) {
        // Only intercept bare relative/absolute specifiers – never node_modules.
        if (!request.startsWith('.') && !request.startsWith('/')) {
            throw e
        }
        try {
            return originalResolve.call(this, request + '.ts', parent, isMain, options)
        } catch (_) {
            try {
                return originalResolve.call(this, request + '/index.ts', parent, isMain, options)
            } catch (__) {
                throw e
            }
        }
    }
}

const model = require('../src/model.ts')
const sequence = require('../src/commandSequence.ts')
const sortable = require('../src/sortableGeometry.ts')
const workbenchImport = require('../src/workbenchImport.ts')
const jsTemplate = require('../src/jsTemplate.ts')
const fileTemplate = require('../src/fileTemplate.ts')
const {
    MIN_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
    DEFAULT_SIDEBAR_WIDTH,
    MAX_SEQUENCE_DELAY_MS,
} = require('../src/constants.ts')

// ── model normalization (v2: snippets + bindings) ────────────────────────

const emptyResult = model.normalizeConfig({})
assert.equal(emptyResult.version, 2)
assert.equal(emptyResult.enabled, false)
assert.equal(emptyResult.openDefault, false)
assert.equal(emptyResult.paletteGrouped, false)
assert.equal(emptyResult.open, false)
assert.equal(emptyResult.categories, undefined)
assert.equal(emptyResult.scenes.length, 2)
assert.ok(emptyResult.scenes[0].buttons.length > 0)
// default scenes: every binding resolves to a snippet in the same scene
for (const scene of emptyResult.scenes) {
    assert.equal(scene.snippets.length, scene.buttons.length)
    for (const button of scene.buttons) {
        assert.equal(button.type, 'quick-button')
        assert.ok(scene.snippets.some(s => s.id === button.snippetId), `binding ${button.id} resolves`)
    }
}
assert.equal(emptyResult.importedFromWorkbench, false)

assert.equal(model.normalizeConfig(null).scenes.length, 2)
assert.equal(model.normalizeConfig(undefined).version, 2)

// session `open` initializes from the persisted startup default
const closedByDefault = model.normalizeConfig({ openDefault: false })
assert.equal(closedByDefault.openDefault, false)
assert.equal(closedByDefault.open, false)
// paletteGrouped opt-in flag round-trips through both branches
assert.equal(model.normalizeConfig({ paletteGrouped: true }).paletteGrouped, true)
assert.equal(model.normalizeConfig({ scenes: [{ id: 'a' }], paletteGrouped: true }).paletteGrouped, true)

const corrupted = model.normalizeConfig({ scenes: [{ id: 'broken', name: 'Test' }] })
assert.equal(corrupted.version, 2)
const brokenScene = corrupted.scenes[0]
assert.equal(brokenScene.id, 'broken')
assert.equal(brokenScene.name, 'Test')
assert.ok(Array.isArray(brokenScene.buttons))
assert.ok(Array.isArray(brokenScene.snippets))
assert.equal(typeof brokenScene.scratchpad, 'string')
// scene icon: trimmed string, empty default (folder fallback)
assert.equal(brokenScene.icon, '')
assert.equal(model.normalizeConfig({ scenes: [{ id: 's', icon: '  fas fa-server  ' }] }).scenes[0].icon, 'fas fa-server')
assert.equal(model.normalizeConfig({ scenes: [{ id: 's', icon: 42 }] }).scenes[0].icon, '')

assert.equal(model.normalizeConfig({ scenes: [] }).scenes.length, 2)

// ── v1 inline buttons → snippet + binding split ──────────────────────────

const v1 = model.normalizeConfig({
    scenes: [{
        id: 'custom-scene',
        name: 'Custom',
        color: '#123456',
        scratchpad: 'persisted scratchpad',
        buttons: [
            { id: 'saved-btn', name: '已保存按钮', text: 'persisted-command', color: '#abcdef', action: 'fill', appendCR: true },
            { id: 'copy-btn', name: '', text: 'x', action: 'copy' },
        ],
    }],
    activeSceneId: 'custom-scene',
})
assert.equal(v1.scenes.length, 1)
assert.equal(v1.scenes[0].scratchpad, 'persisted scratchpad')
assert.equal(v1.scenes[0].snippets.length, 2)
assert.equal(v1.scenes[0].snippets[0].id, 'snip-saved-btn')
assert.equal(v1.scenes[0].snippets[0].name, '已保存按钮')
assert.equal(v1.scenes[0].snippets[0].text, 'persisted-command')
assert.equal(v1.scenes[0].snippets[0].color, '#abcdef')
assert.equal(v1.scenes[0].buttons[0].id, 'saved-btn')
assert.equal(v1.scenes[0].buttons[0].type, 'quick-button')
assert.equal(v1.scenes[0].buttons[0].snippetId, 'snip-saved-btn')
assert.equal(v1.scenes[0].buttons[0].dangerAccepted, false)
assert.equal(v1.scenes[0].buttons[1].action, 'copy')
assert.equal(v1.scenes[0].buttons[1].snippetId, 'snip-copy-btn')
assert.equal(v1.activeSceneId, 'custom-scene')
// id-less inline buttons still get a resolvable pair
const v1NoId = model.normalizeConfig({ scenes: [{ id: 's', buttons: [{ name: 'n', text: 't' }] }] })
assert.equal(v1NoId.scenes[0].snippets.length, 1)
assert.equal(v1NoId.scenes[0].buttons[0].snippetId, v1NoId.scenes[0].snippets[0].id)

// ── v2 pass-through / dangling bindings / orphan snippets ────────────────

const v2 = model.normalizeConfig({
    version: 2,
    scenes: [{
        id: 's',
        snippets: [{ id: 'n1', name: '片段', text: 't', color: '#111111' }],
        buttons: [{ type: 'quick-button', id: 'b', snippetId: 'n1', action: 'copy' }],
    }],
})
assert.equal(v2.version, 2)
assert.equal(v2.scenes[0].snippets[0].name, '片段')
assert.equal(v2.scenes[0].buttons[0].snippetId, 'n1')

// dangling binding drops out; unreferenced snippet survives as library content
const dangling = model.normalizeConfig({
    version: 2,
    scenes: [{
        id: 's',
        snippets: [{ id: 'n1', name: 'a', text: 'a' }, { id: 'n2', name: 'orphan', text: 'o' }],
        buttons: [{ id: 'b1', snippetId: 'gone' }, { id: 'b2', snippetId: 'n1' }],
    }],
})
assert.deepEqual(dangling.scenes[0].buttons.map(b => b.id), ['b2'])
assert.equal(dangling.scenes[0].snippets.length, 2)

const resolvedList = model.resolveSceneButtons(dangling.scenes[0])
assert.equal(resolvedList.length, 1)
assert.equal(resolvedList[0].binding.id, 'b2')
assert.equal(resolvedList[0].snippet.id, 'n1')

// structural migration detection (the version key evaporates when equal to
// the declared default, so it cannot be trusted on disk)
assert.equal(model.needsV2Migration(undefined), true)
assert.equal(model.needsV2Migration({ openDefault: false }), true)
assert.equal(model.needsV2Migration({ scenes: [] }), false)
assert.equal(model.needsV2Migration({ scenes: [{ snippets: [], buttons: [] }] }), false)
assert.equal(model.needsV2Migration({ scenes: [{ snippets: [], buttons: [{ name: 'v1', text: 'x' }] }] }), true)
assert.equal(model.needsV2Migration({ scenes: [{ buttons: [] }] }), true)

// tempSnippets → scratchpad fallback (import source shape)
const snippetsFallback = model.normalizeConfig({
    scenes: [{
        id: 'migration-scene',
        tempSnippets: [
            { id: 'ts1', text: 'snippet-one' },
            { id: 'ts2', text: 'snippet-two' },
        ],
    }],
})
assert.equal(snippetsFallback.scenes[0].scratchpad, 'snippet-one\n\nsnippet-two')

// activeSceneId pointing at a missing scene falls back to the first one
const staleActive = model.normalizeConfig({ scenes: [{ id: 'a' }], activeSceneId: 'zzz' })
assert.equal(staleActive.activeSceneId, 'a')

// ── virtual 无组别 scene visibility ─────────────────────────────────────

// normalize drops an empty ungrouped scene (and redirects activeSceneId)
const ungroupedEmpty = model.normalizeConfig({
    scenes: [
        { id: 'ungrouped', name: '无组别', snippets: [], buttons: [] },
        { id: 'real', name: 'R', snippets: [{ id: 'n1', name: 'a', text: 't' }], buttons: [{ id: 'b1', snippetId: 'n1' }] },
    ],
    activeSceneId: 'ungrouped',
})
assert.equal(ungroupedEmpty.scenes.length, 1)
assert.equal(ungroupedEmpty.scenes[0].id, 'real')
assert.equal(ungroupedEmpty.activeSceneId, 'real')

// ungrouped with snippets survives and stays visible
const ungroupedFull = model.normalizeConfig({
    scenes: [
        { id: 'real', name: 'R', snippets: [], buttons: [] },
        { id: 'ungrouped', snippets: [{ id: 'u1', name: 'x', text: 'y' }], buttons: [{ id: 'ub', snippetId: 'u1' }] },
    ],
})
assert.equal(ungroupedFull.scenes.length, 2)
assert.equal(model.isSceneVisible(ungroupedFull.scenes.find(s => s.id === 'ungrouped')), true)
assert.equal(model.visibleScenes(ungroupedFull).length, 2)
assert.equal(model.isSceneVisible(ungroupedFull.scenes.find(s => s.id === 'real')), true)

// findActiveScene skips a hidden ungrouped scene lingering in memory
const cfgHidden = model.createDefaultConfig()
cfgHidden.scenes = [
    { id: 'ungrouped', name: '无组别', color: '#94a3b8', scratchpad: '', snippets: [], buttons: [] },
    ...cfgHidden.scenes,
]
cfgHidden.activeSceneId = 'ungrouped'
assert.equal(model.findActiveScene(cfgHidden).id, 'scene-serial')

console.log('model normalization tests passed')

// ── glass tunables clamp ────────────────────────────────────────────────

assert.equal(emptyResult.glassOpacity, 0.15)
assert.equal(emptyResult.glassBlurEnabled, false)
assert.equal(emptyResult.glassBlur, 8)
assert.equal(emptyResult.glassBrightness, 1)
const glass = model.normalizeConfig({
    scenes: [{ id: 'x' }],
    glassOpacity: 5, glassBlur: -3, glassBrightness: 'bad',
})
assert.equal(glass.glassOpacity, 1)
assert.equal(glass.glassBlur, 0)
assert.equal(glass.glassBrightness, 1)
const glassCustom = model.normalizeConfig({ scenes: [{ id: 'x' }], glassOpacity: 0.4, glassBlur: 20, glassBrightness: 1.5 })
assert.deepEqual(
    [glassCustom.glassOpacity, glassCustom.glassBlur, glassCustom.glassBrightness],
    [0.4, 20, 1.5],
)

// ── sidebar translucent-mask style ──────────────────────────────────────

assert.equal(emptyResult.sidebarTransparent, true)
assert.equal(emptyResult.sidebarOpacity, 0.03)
assert.equal(emptyResult.sidebarColor, '#808080')
const maskOn = model.normalizeConfig({
    scenes: [{ id: 'x' }],
    sidebarTransparent: true, sidebarOpacity: 9, sidebarColor: '#ABCDEF',
})
assert.deepEqual(
    [maskOn.sidebarTransparent, maskOn.sidebarOpacity, maskOn.sidebarColor],
    [true, 1, '#abcdef'],
)
const maskBad = model.normalizeConfig({ scenes: [{ id: 'x' }], sidebarOpacity: -1, sidebarColor: 'red' })
assert.equal(maskBad.sidebarOpacity, 0)
assert.equal(maskBad.sidebarColor, '#808080')
assert.equal(model.normalizeConfig({ paletteGrouped: true }).sidebarTransparent, true)

// ── sidebarWidth clamp ─────────────────────────────────────────────────

assert.equal(model.normalizeConfig({ scenes: [{ id: 'x' }], width: 200 }).width, MIN_SIDEBAR_WIDTH)
assert.equal(model.normalizeConfig({ scenes: [{ id: 'x' }], width: 900 }).width, MAX_SIDEBAR_WIDTH)
assert.equal(model.normalizeConfig({ scenes: [{ id: 'x' }], width: MIN_SIDEBAR_WIDTH }).width, MIN_SIDEBAR_WIDTH)
assert.equal(model.normalizeConfig({ scenes: [{ id: 'x' }], width: MAX_SIDEBAR_WIDTH }).width, MAX_SIDEBAR_WIDTH)
assert.equal(model.normalizeConfig({ scenes: [{ id: 'x' }], width: NaN }).width, DEFAULT_SIDEBAR_WIDTH)
assert.equal(model.normalizeConfig({ scenes: [{ id: 'x' }], width: 0 }).width, DEFAULT_SIDEBAR_WIDTH)
assert.equal(model.normalizeConfig({ scenes: [{ id: 'x' }] }).width, DEFAULT_SIDEBAR_WIDTH)

console.log('width clamp tests passed')

// ── workbench import decision matrix ───────────────────────────────────

const workbenchSource = {
    enabled: true,
    sidebarOpen: true,
    sidebarWidth: 420,
    activeCategoryId: 'cat-adb',
    categories: [
        {
            id: 'cat-serial',
            name: '串口专用',
            color: '#22c55e',
            scratchpad: 'serial draft',
            quickButtons: [{ id: 'b1', name: '帮助', text: 'help', color: '#2563eb' }],
            commonCommands: [{ id: 'c1', name: 'AT', text: 'AT' }],
        },
        {
            id: 'cat-adb',
            name: 'ADB',
            color: '#38bdf8',
            quickButtons: [
                { id: 'b2', name: '设备列表', text: 'adb devices', appendCR: true },
            ],
            tempSnippets: [{ text: 'temp note' }],
        },
    ],
}

// fresh install + workbench data present → import
let decision = workbenchImport.decideWorkbenchImport(undefined, workbenchSource)
assert.equal(decision.action, 'import')
assert.equal(decision.config.version, 2)
assert.equal(decision.config.importedFromWorkbench, true)
assert.equal(decision.config.scenes.length, 2)
assert.equal(decision.config.scenes[0].id, 'cat-serial')
assert.equal(decision.config.scenes[0].name, '串口专用')
assert.equal(decision.config.scenes[0].scratchpad, 'serial draft')
assert.equal(decision.config.scenes[0].buttons.length, 1)
assert.equal(decision.config.scenes[0].buttons[0].id, 'b1')
// imported inline buttons split into snippet + binding as well
assert.equal(decision.config.scenes[0].snippets.length, 1)
assert.equal(decision.config.scenes[0].snippets[0].id, 'snip-b1')
assert.equal(decision.config.scenes[0].snippets[0].text, 'help')
assert.equal(decision.config.scenes[0].buttons[0].snippetId, 'snip-b1')
assert.equal(decision.config.activeSceneId, 'cat-adb')
assert.equal(decision.config.width, 420)
// commonCommands must be gone entirely
assert.equal(JSON.stringify(decision.config).includes('commonCommands'), false)
// tempSnippets fallback applies when scratchpad is empty
assert.equal(decision.config.scenes[1].scratchpad, 'temp note')

// already imported → skip even if workbench still has data
decision = workbenchImport.decideWorkbenchImport(
    { importedFromWorkbench: true, scenes: [{ id: 'mine' }] },
    workbenchSource,
)
assert.equal(decision.action, 'skip')

// user has own data, not yet marked → mark only, never overwrite
decision = workbenchImport.decideWorkbenchImport(
    { scenes: [{ id: 'mine' }] },
    workbenchSource,
)
assert.equal(decision.action, 'mark-only')

// empty own structural placeholder ({}) must NOT count as own data
decision = workbenchImport.decideWorkbenchImport({}, workbenchSource)
assert.equal(decision.action, 'import')

// no workbench data, nothing marked → none, stays importable later
decision = workbenchImport.decideWorkbenchImport(undefined, undefined)
assert.equal(decision.action, 'none')
decision = workbenchImport.decideWorkbenchImport(undefined, { categories: [] })
assert.equal(decision.action, 'none')
decision = workbenchImport.decideWorkbenchImport({ scenes: [] }, workbenchSource)
assert.equal(decision.action, 'import')

// import with missing optional fields
decision = workbenchImport.decideWorkbenchImport(undefined, { categories: [{ id: 'only' }] })
assert.equal(decision.action, 'import')
assert.equal(decision.config.scenes.length, 1)
assert.equal(decision.config.scenes[0].buttons.length, 0)
assert.equal(decision.config.activeSceneId, 'only')
assert.equal(decision.config.width, DEFAULT_SIDEBAR_WIDTH)

console.log('workbench import tests passed')

// ── command sequence (ported from workbench) ───────────────────────────

const params = sequence.extractTemplateParameters('adb connect {{ip}}\nadb -s {{ip}} shell\nssh {{user}}@{{host}}')
assert.deepEqual(params, ['ip', 'user', 'host'])

const rendered = sequence.renderTemplate('adb connect {{ip}}\nadb -s {{ip}} shell', { ip: '192.168.1.10:5555' })
assert.equal(rendered, 'adb connect 192.168.1.10:5555\nadb -s 192.168.1.10:5555 shell')

const fillText = sequence.stripDelaySteps('adb connect {{ip}}\n{{delay:2000}}\nadb -s {{ip}} shell')
assert.equal(fillText, 'adb connect {{ip}}\nadb -s {{ip}} shell')
assert.equal(sequence.hasDelayStep('echo before\n{{delay:2s}}\necho after'), true)
assert.equal(sequence.hasDelayStep('echo "{{delay:2s}}"'), false)

const parsed = sequence.parseCommandSequence('adb reboot bootloader\n{{delay:5s}}\nfastboot devices')
assert.deepEqual(parsed.errors, [])
assert.deepEqual(parsed.steps, [
    { type: 'command', text: 'adb reboot bootloader' },
    { type: 'delay', ms: 5000 },
    { type: 'command', text: 'fastboot devices' },
])

const parsedMs = sequence.parseCommandSequence('echo before\n{{delay 250}}\necho after')
assert.deepEqual(parsedMs.errors, [])
assert.equal(parsedMs.steps[1].ms, 250)

const invalidDelay = sequence.parseCommandSequence('{{delay:bad}}')
assert.equal(invalidDelay.steps.length, 0)
assert.equal(invalidDelay.errors.length, 1)

const tooLongDelay = sequence.parseCommandSequence(`{{delay:${MAX_SEQUENCE_DELAY_MS + 1}}}`)
assert.equal(tooLongDelay.errors.length, 1)

assert.equal(sequence.hasDangerousCommand('adb reboot'), true)
assert.equal(sequence.hasDangerousCommand('fastboot flash boot boot.img'), true)
assert.equal(sequence.hasDangerousCommand('pm clear com.example.app'), true)
assert.equal(sequence.hasDangerousCommand('echo harmless'), false)

console.log('command template and sequence tests passed')

// ── {{js:}} template objects ────────────────────────────────────────────

const jsCtx = () => ({
    params: { ip: '10.0.0.8', port: '22' },
    clipboardText: 'a, b ,c',
    now: new Date('2026-10-05T12:00:00Z'),
    os: 'win32',
    session: { type: 'ssh', host: 'dev-box', lines: ['adb\tdevice', 'emulator-5554\tdevice'] },
    files: {},
})

// scanner: basic, multi-line, braces/quotes containing }}
assert.equal(jsTemplate.scanJsTags('x {{js: 1+1}} y').length, 1)
assert.equal(jsTemplate.scanJsTags('{{js: return "}" }} rest')[0].source, 'return "}"')
assert.equal(jsTemplate.scanJsTags('{{js: const o = {a:{b:1}}; return o.a.b}}').length, 1)
const multiline = jsTemplate.scanJsTags('pre {{js:\n  const n = 2\n  return n * 3\n}} post')
assert.equal(multiline.length, 1)
assert.equal(multiline[0].source.includes('return n * 3'), true)
// unterminated tag → ignored (stays plain text)
assert.equal(jsTemplate.scanJsTags('{{js: 1+1 (no end').length, 0)
// string braces never terminate
assert.equal(jsTemplate.scanJsTags("{{js: return '}}'}}")[0].source, "return '}}'")
assert.equal(jsTemplate.stripJsTemplates('a {{js: 1}} b {{js:\n2}} c'), 'a  b  c')
assert.equal(jsTemplate.hasJsTemplates('plain {{param}}'), false)

// resolver: expression vs body, context, serialization, errors
let jsr = jsTemplate.resolveJsTemplates('port*2={{js: Number(params.port) * 2}}', jsCtx())
assert.deepEqual(jsr.errors, [])
assert.equal(jsr.text, 'port*2=44')

jsr = jsTemplate.resolveJsTemplates('{{js: const parts = clipboardText.split(","); return parts.map(p => p.trim()).join("|")}}', jsCtx())
assert.equal(jsr.text, 'a|b|c')

jsr = jsTemplate.resolveJsTemplates('{{js: session.lines.find(l => /device$/.test(l)).split("\\t")[0]}}', jsCtx())
assert.equal(jsr.text, 'adb')

jsr = jsTemplate.resolveJsTemplates('{{js: now.toISOString().slice(0,10)}}', jsCtx())
assert.equal(jsr.text, '2026-10-05')

// objects JSON-serialized; undefined → empty
jsr = jsTemplate.resolveJsTemplates('{{js: {a:1}}}|{{js: undefined}}', jsCtx())
assert.equal(jsr.text, '{"a":1}|')

// failure collected, never leaks raw
jsr = jsTemplate.resolveJsTemplates('keep {{js: throw new Error("boom")}} keep', jsCtx())
assert.equal(jsr.errors.length, 1)
assert.equal(jsr.errors[0].includes('boom'), true)
assert.equal(jsr.text.includes('boom'), false)

// sync infinite loop killed by the vm timeout
const t0 = Date.now()
jsr = jsTemplate.resolveJsTemplates('{{js: while(true){}}}', jsCtx())
assert.equal(jsr.errors.length, 1)
assert.ok(Date.now() - t0 < 3000, 'timeout should fire quickly')

// no host globals leak into the sandbox
jsr = jsTemplate.resolveJsTemplates('{{js: typeof window }}', jsCtx())
assert.equal(jsr.text, 'undefined')
jsr = jsTemplate.resolveJsTemplates('{{js: typeof require }}', jsCtx())
assert.equal(jsr.text, 'undefined')

console.log('js template tests passed')

// ── {{file}} template objects ───────────────────────────────────────────

assert.deepEqual(fileTemplate.extractFileKeys('{{file}} plain'), [''])
assert.deepEqual(fileTemplate.extractFileKeys('{{file:fw}} {{file:fw}} {{file}}'), ['fw', ''])
assert.deepEqual(fileTemplate.extractFileKeys('{{file:boot}} {{js: files.boot}}'), ['boot'])
assert.equal(fileTemplate.stripFileTags('a {{file:fw}} b {{file}} c'), 'a  b  c')
assert.equal(fileTemplate.replaceFileTags('{{file:fw}} then {{file}}', { fw: 'D:/x/boot.img', '': 'D:/y.txt' }), 'D:/x/boot.img then D:/y.txt')

// FileRef from a real temp file: members + capped lazy text
const os = require('os')
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twx-test-'))
const tmpFile = path.join(tmpDir, 'Boot.IMG')
fs.writeFileSync(tmpFile, 'hello firmware')
const ref = fileTemplate.buildFileRef(tmpFile)
assert.equal(ref.name, 'Boot.IMG')
assert.equal(ref.stem, 'Boot')
assert.equal(ref.ext, 'img')
assert.equal(ref.path, tmpFile)
assert.equal(ref.dir, tmpDir)
assert.equal(ref.size, 14)
assert.equal(ref.mtime, new Date(fs.statSync(tmpFile).mtime.toISOString()).toISOString())
assert.equal(ref.text, 'hello firmware')
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('file template tests passed')

// ── sortable geometry (ported from workbench) ──────────────────────────

const rect = (left, top, width, height) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
})

const longAtLeft = rect(0, 0, 100, 36)
const shortFirst = rect(0, 0, 40, 36)
const leftProbe = sortable.getDirectionalSortProbe(longAtLeft, 'horizontal', -10, 0)
assert.equal(sortable.findSortAnchorIndex([shortFirst], 'horizontal', leftProbe), 0)

const longAtRight = rect(200, 0, 100, 36)
const shortLast = rect(260, 0, 40, 36)
const rightProbe = sortable.getDirectionalSortProbe(longAtRight, 'horizontal', 10, 0)
assert.equal(sortable.findSortAnchorIndex([shortLast], 'horizontal', rightProbe), -1)

const gridAtLeft = rect(0, 0, 80, 38)
const gridFirst = rect(0, 0, 80, 38)
assert.equal(
    sortable.findSortAnchorIndex(
        [gridFirst],
        'grid',
        sortable.getDirectionalSortProbe(gridAtLeft, 'grid', -8, 0),
    ),
    0,
)
const gridAtRight = rect(220, 0, 80, 38)
const gridLast = rect(220, 0, 80, 38)
assert.equal(
    sortable.findSortAnchorIndex(
        [gridLast],
        'grid',
        sortable.getDirectionalSortProbe(gridAtRight, 'grid', 8, 0),
    ),
    1,
)

const tallAtTop = rect(0, 0, 200, 80)
const shortTop = rect(0, 0, 200, 30)
assert.equal(
    sortable.findSortAnchorIndex(
        [shortTop],
        'vertical',
        sortable.getDirectionalSortProbe(tallAtTop, 'vertical', 0, -8),
    ),
    0,
)
const tallAtBottom = rect(0, 120, 200, 80)
const shortBottom = rect(0, 170, 200, 30)
assert.equal(
    sortable.findSortAnchorIndex(
        [shortBottom],
        'vertical',
        sortable.getDirectionalSortProbe(tallAtBottom, 'vertical', 0, 8),
    ),
    -1,
)

const target = rect(80, 0, 30, 36)
assert.equal(
    sortable.findSortAnchorIndex(
        [target],
        'horizontal',
        sortable.getDirectionalSortProbe(rect(14, 0, 80, 36), 'horizontal', 2, 0),
    ),
    0,
)
assert.equal(
    sortable.findSortAnchorIndex(
        [target],
        'horizontal',
        sortable.getDirectionalSortProbe(rect(22, 0, 80, 36), 'horizontal', 2, 0),
    ),
    -1,
)

for (const sourceWidth of [28, 40, 80, 140]) {
    for (const targetWidth of [20, 40, 100]) {
        const sourceAtStart = rect(0, 0, sourceWidth, 36)
        const targetAtStart = rect(0, 0, targetWidth, 36)
        assert.equal(
            sortable.findSortAnchorIndex(
                [targetAtStart],
                'horizontal',
                sortable.getDirectionalSortProbe(sourceAtStart, 'horizontal', -1, 0),
            ),
            0,
        )

        const sourceAtEnd = rect(300 - sourceWidth, 0, sourceWidth, 36)
        const targetAtEnd = rect(300 - targetWidth, 0, targetWidth, 36)
        assert.equal(
            sortable.findSortAnchorIndex(
                [targetAtEnd],
                'horizontal',
                sortable.getDirectionalSortProbe(sourceAtEnd, 'horizontal', 1, 0),
            ),
            -1,
        )
    }
}

const gridTop = rect(0, 0, 80, 38)
assert.equal(
    sortable.findSortAnchorIndex(
        [gridTop],
        'grid',
        sortable.getDirectionalSortProbe(gridTop, 'grid', 0, -8),
    ),
    0,
)
const gridBottom = rect(0, 82, 80, 38)
assert.equal(
    sortable.findSortAnchorIndex(
        [gridBottom],
        'grid',
        sortable.getDirectionalSortProbe(gridBottom, 'grid', 0, 8),
    ),
    1,
)

const fourColumnSevenItems = [
    rect(0, 0, 80, 38),
    rect(88, 0, 80, 38),
    rect(176, 0, 80, 38),
    rect(264, 0, 80, 38),
    rect(0, 44, 80, 38),
    rect(88, 44, 80, 38),
    rect(176, 44, 80, 38),
]
assert.deepEqual(
    sortable.clampGridDragPosition(
        fourColumnSevenItems,
        80,
        38,
        { left: 264, top: 44 },
        rect(0, 0, 344, 82),
    ),
    { left: 176, top: 44 },
)

const fourColumnFiveItems = fourColumnSevenItems.slice(0, 5)
assert.deepEqual(
    sortable.clampGridDragPosition(
        fourColumnFiveItems,
        80,
        38,
        { left: 264, top: 44 },
        rect(0, 0, 344, 82),
    ),
    { left: 0, top: 44 },
)

const fourColumnEightItems = [...fourColumnSevenItems, rect(264, 44, 80, 38)]
assert.deepEqual(
    sortable.clampGridDragPosition(
        fourColumnEightItems,
        80,
        38,
        { left: 264, top: 44 },
        rect(0, 0, 344, 82),
    ),
    { left: 264, top: 44 },
)

assert.equal(sortable.getEffectiveSortMovement('grid', 20, 0, 0, 0), null)
assert.equal(sortable.getEffectiveSortMovement('horizontal', 20, 0, 0, 0), null)

assert.deepEqual(
    sortable.getEffectiveSortMovement('grid', 1, 12, -88, 8),
    { deltaX: 0, deltaY: 8 },
)
assert.deepEqual(
    sortable.getEffectiveSortMovement('grid', 12, 1, 8, 44),
    { deltaX: 8, deltaY: 0 },
)

console.log('sortable geometry tests passed')
console.log('all tests passed')

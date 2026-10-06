import { Injectable } from '@angular/core'
import { PlatformService } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'
import { BehaviorSubject } from 'rxjs'
import {
    extractTemplateParameters,
    findDangerousCommands,
    parseCommandSequence,
    renderTemplate,
    SequenceStep,
    stripDelaySteps,
} from '../commandSequence'
import { buildSessionContext } from '../sessionContext'
import { extractFileKeys, replaceFileTags, stripFileTags } from '../fileTemplate'
import { JsContext, resolveJsTemplates, stripJsTemplates } from '../jsTemplate'
import { CollectResult, ParamsModalComponent } from '../components/paramsModal.component'
import { ResolvedButton } from '../types'
import { SEQUENCE_SEND_GAP_MS } from '../constants'
import { ConfirmModalComponent } from '../components/confirmModal.component'
import { SidebarHostService } from './sidebarHost.service'
import { StatusService } from './status.service'
import { TerminalBridgeService } from './terminalBridge.service'
import { WorkwenchStore } from './store.service'

interface FillOptions {
    dangerAccepted?: boolean
    dangerKey?: string
    onDangerAccepted?: () => void
}

/**
 * Command execution semantics: collect `{{param}}` values in a modal (with
 * history), pick `{{file}}` selections, evaluate `{{js:}}` blocks with the
 * full context (params / files / clipboard / session snapshot), then either
 * fill (multi-line content prefers a synthetic paste event), copy, or send
 * line by line with `{{delay}}` waits — gated by dangerous-command
 * confirmation.
 */
@Injectable({ providedIn: 'root' })
export class ExecutorService {
    readonly sequenceRunning$ = new BehaviorSubject<boolean>(false)
    private sequenceRunId = 0
    private parameterHistory: Record<string, string> = {}
    private sessionDangerAccepted = new Set<string>()

    constructor (
        private bridge: TerminalBridgeService,
        private status: StatusService,
        private host: SidebarHostService,
        private platform: PlatformService,
        private store: WorkwenchStore,
    ) { }

    /** Execute a resolved binding: the snippet carries the content, the
     *  binding the invocation semantics (action / appendCR / danger state). */
    async execute (sceneId: string, resolved: ResolvedButton): Promise<void> {
        if (resolved.binding.action === 'copy') {
            // Copy may still want the session snapshot (parse output, then
            // copy the derived text), so resolve the active terminal too.
            const rendered = await this.renderSnippetContent(
                resolved.snippet.text,
                this.bridge.findActiveTerminal(),
            )
            if (rendered !== null) {
                this.copyText(rendered)
            }
            return
        }
        await this.fillTerminal(resolved.snippet.text, resolved.binding.appendCR, {
            dangerAccepted: resolved.binding.dangerAccepted,
            dangerKey: resolved.binding.id,
            onDangerAccepted: () => this.store.markDangerAccepted(sceneId, resolved.binding.id),
        })
    }

    cancelSequence (): void {
        if (!this.sequenceRunning$.value) {
            return
        }
        this.sequenceRunId += 1
        this.sequenceRunning$.next(false)
        this.status.show('已停止命令序列')
    }

    // ── internals ───────────────────────────────────────────────────────

    /**
     * Full render pipeline: one collect modal ({{param}} rows + {{file}}
     * drop zones) → {{js:}} evaluation (params / files / clipboard / session
     * context) → plain substitution.  Returns null when the user cancelled
     * or a block failed (already surfaced via status) — callers abort quietly.
     */
    private async renderSnippetContent (
        text: string,
        terminal: BaseTerminalTabComponent<any> | null,
    ): Promise<string | null> {
        // Params are collected on the plain text: js/file tags stripped so
        // their bodies don't surface as phantom parameter names.
        const names = extractTemplateParameters(stripFileTags(stripJsTemplates(text)))
        const fileKeys = extractFileKeys(text)
        const collected = await this.collectInputs(names, fileKeys)
        if (!collected) {
            return null
        }
        const pathsByKey: Record<string, string> = {}
        for (const [key, ref] of Object.entries(collected.files)) {
            pathsByKey[key] = ref.path
        }
        const jsContext: JsContext = {
            params: collected.params,
            clipboardText: this.safeClipboardText(),
            now: new Date(),
            os: this.hostPlatform(),
            session: buildSessionContext(terminal) as unknown as Record<string, unknown>,
            files: collected.files,
        }
        const jsResult = resolveJsTemplates(text, jsContext)
        if (jsResult.errors.length) {
            this.status.show(jsResult.errors[0], true)
            return null
        }
        return renderTemplate(replaceFileTags(jsResult.text, pathsByKey), collected.params)
    }

    private safeClipboardText (): string {
        try {
            return this.platform.readClipboard()
        } catch {
            return ''
        }
    }

    private hostPlatform (): string {
        try {
            return process.platform
        } catch {
            return 'unknown'
        }
    }

    private async fillTerminal (text: string, appendCR: boolean, options: FillOptions): Promise<void> {
        if (!text) {
            this.status.show('命令内容为空', true)
            return
        }
        const terminal = this.bridge.findActiveTerminal()
        if (!terminal) {
            this.status.show('没有可用的活动终端', true)
            return
        }
        const rendered = await this.renderSnippetContent(text, terminal)
        if (rendered === null) {
            return
        }
        if (!appendCR) {
            const fillText = stripDelaySteps(rendered)
            if (this.isMultiline(fillText) && await this.bridge.pasteText(terminal, fillText)) {
                terminal.frontend?.focus()
                this.status.show('已通过粘贴填充多行内容')
                return
            }
            terminal.sendInput(fillText)
            terminal.frontend?.focus()
            this.status.show(this.isMultiline(fillText) ? '已填充多行内容' : '已填充到当前终端')
            return
        }

        if (!(await this.confirmDangerousSend(rendered, options))) {
            return
        }

        const parsed = parseCommandSequence(rendered)
        if (parsed.errors.length) {
            this.status.show(parsed.errors[0], true)
            return
        }
        if (!parsed.steps.length) {
            this.status.show('没有可发送的命令', true)
            return
        }
        await this.runSequence(terminal, parsed.steps)
    }

    private copyText (text: string): void {
        if (!text) {
            this.status.show('复制内容为空', true)
            return
        }
        this.platform.setClipboard({ text })
        this.status.show('已复制到剪贴板')
    }

    /** One dialog collects params and file picks together (null = cancelled). */
    private collectInputs (names: string[], fileKeys: string[]): Promise<CollectResult | null> {
        if (!names.length && !fileKeys.length) {
            return Promise.resolve({ params: {}, files: {} })
        }
        return new Promise(resolve => {
            const ref = this.host.openModal(ParamsModalComponent, {
                names,
                fileKeys,
                history: { ...this.parameterHistory },
            })
            let settled = false
            const finish = (result: CollectResult | null): void => {
                if (settled) {
                    return
                }
                settled = true
                subscription.unsubscribe()
                this.host.closeModal(ref)
                if (result) {
                    for (const [name, value] of Object.entries(result.params)) {
                        this.parameterHistory[name] = value
                    }
                }
                resolve(result)
            }
            const subscription = ref.instance.done.subscribe(result => finish(result))
        })
    }

    private async confirmDangerousSend (text: string, options: FillOptions): Promise<boolean> {
        const matches = findDangerousCommands(text)
        if (!matches.length) {
            return true
        }
        const key = options.dangerKey || text
        if (options.dangerAccepted || this.sessionDangerAccepted.has(key)) {
            return true
        }
        const labels = matches.map(match => match.label).join('、')
        const confirmed = await this.openConfirm(
            '高风险命令确认',
            `此操作会直接发送并回车，命中高风险命令：${labels}。\n确认继续？`,
            '确认发送',
            true,
        )
        if (!confirmed) {
            return false
        }
        this.sessionDangerAccepted.add(key)
        options.onDangerAccepted?.()
        return true
    }

    private openConfirm (title: string, message: string, confirmLabel: string, danger: boolean): Promise<boolean> {
        return new Promise(resolve => {
            const ref = this.host.openModal(ConfirmModalComponent, { title, message, confirmLabel, danger })
            let settled = false
            const finish = (value: boolean): void => {
                if (settled) {
                    return
                }
                settled = true
                subscription.unsubscribe()
                this.host.closeModal(ref)
                resolve(value)
            }
            const subscription = ref.instance.done.subscribe(value => finish(value))
        })
    }

    private async runSequence (terminal: BaseTerminalTabComponent<any>, steps: SequenceStep[]): Promise<void> {
        if (this.sequenceRunning$.value) {
            this.status.show('已有命令序列正在执行', true)
            return
        }
        const runId = ++this.sequenceRunId
        this.sequenceRunning$.next(true)
        let sent = 0
        try {
            for (const step of steps) {
                if (runId !== this.sequenceRunId) {
                    return
                }
                if (step.type === 'delay') {
                    this.status.show(`等待 ${step.ms}ms`)
                    await this.sleep(step.ms)
                    continue
                }
                terminal.sendInput(`${step.text}\r`)
                sent += 1
                await this.sleep(SEQUENCE_SEND_GAP_MS)
            }
            terminal.frontend?.focus()
            this.status.show(sent > 1 ? `已发送 ${sent} 条命令` : '已发送并回车')
        } finally {
            if (runId === this.sequenceRunId) {
                this.sequenceRunning$.next(false)
            }
        }
    }

    private isMultiline (text: string): boolean {
        return /\r|\n/.test(text)
    }

    private sleep (ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

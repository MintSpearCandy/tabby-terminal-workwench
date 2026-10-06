import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core'
import { findActiveScene } from '../model'
import { TerminalBridgeService } from '../services/terminalBridge.service'
import { WorkwenchStore } from '../services/store.service'

/**
 * Per-scene persistent scratchpad.  Native clipboard shortcuts must survive,
 * so editing shortcuts are stopped before terminal-level handlers see them;
 * Esc hands focus back to the terminal.
 */
@Component({
    selector: 'twx-scratchpad',
    template: `
        <section class="twx-section--scratch">
            <div class="twx-section-header">
                <div class="twx-section-title">
                    <strong>草稿区</strong>
                    <small>按场景保存 · Esc 返回终端</small>
                </div>
            </div>
            <div class="twx-scratchpad">
                <textarea #pad
                          [value]="text"
                          (input)="onInput(pad.value)"
                          placeholder="把多条命令或临时文本粘贴到这里，可自由编辑并手动复制任意部分。"
                          spellcheck="false"></textarea>
            </div>
        </section>
    `,
})
export class ScratchpadComponent implements AfterViewInit, OnDestroy {
    text = ''
    private sceneId = ''
    private readonly subscription = this.store.config$.subscribe(config => {
        const scene = findActiveScene(config)
        this.sceneId = scene.id
        this.text = scene.scratchpad
    })

    @ViewChild('pad') textarea: ElementRef<HTMLTextAreaElement> | null = null
    private readonly nativeListeners: Array<[string, EventListener]> = []

    constructor (
        private store: WorkwenchStore,
        private bridge: TerminalBridgeService,
    ) { }

    ngAfterViewInit (): void {
        const element = this.textarea?.nativeElement
        if (!element) {
            return
        }
        const stopTerminalShortcut = (event: Event): void => {
            const key = (event as KeyboardEvent).key.toLowerCase()
            const isEditingShortcut = ((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey)
                && ['a', 'c', 'v', 'x', 'y', 'z', 'insert'].includes(key)
            const isShiftInsert = (event as KeyboardEvent).shiftKey && key === 'insert'
            if (isEditingShortcut || isShiftInsert) {
                event.stopPropagation()
                event.stopImmediatePropagation()
            }
        }
        const onKeydown = (event: Event): void => {
            if ((event as KeyboardEvent).key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                this.bridge.focusActiveTerminal()
                return
            }
            stopTerminalShortcut(event)
        }
        for (const type of ['keydown', 'keyup']) {
            for (const capture of [true, false]) {
                const listener: EventListener = onKeydown
                element.addEventListener(type, listener, capture)
                this.nativeListeners.push([type, listener])
            }
        }
    }

    onInput (value: string): void {
        this.store.setScratchpad(this.sceneId, value)
    }

    ngOnDestroy (): void {
        this.subscription.unsubscribe()
        const element = this.textarea?.nativeElement
        if (element) {
            for (const [type, listener] of this.nativeListeners) {
                element.removeEventListener(type, listener)
                element.removeEventListener(type, listener, true)
            }
        }
    }
}

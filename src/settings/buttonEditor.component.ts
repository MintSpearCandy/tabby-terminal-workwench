import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild } from '@angular/core'
import { PlatformService } from 'tabby-core'
import { hasDangerousCommand, hasDelayStep } from '../commandSequence'
import { UNGROUPED_SCENE_ID, UNGROUPED_SCENE_NAME } from '../constants'
import { visibleScenes } from '../model'
import { QuickButton, QuickButtonAction, Scene, Snippet } from '../types'
import { ColorSwatchesComponent } from '../components/colorSwatches.component'
import { WorkwenchStore } from '../services/store.service'

/** Combined editable shape: snippet content plus binding invocation. */
interface ButtonDraft {
    name: string
    text: string
    color: string
    action: QuickButtonAction
    appendCR: boolean
}

/**
 * Expanding edit form for one quick button — the snippet (name / colour /
 * content) and its quick-button binding (action / appendCR) edited together.
 * Edits a deep copy; Save runs the same danger-gating as
 * tabby-command-workbench: content containing `{{delay}}` is forced into
 * direct-execute mode, and a dangerous send that changed (or was never
 * accepted) requires an explicit confirmation before `dangerAccepted` is
 * persisted.
 */
@Component({
    selector: 'twx-button-editor',
    template: `
        <div class="twx-btn-editor">
            <div class="twx-field">
                组别
                <select [(ngModel)]="targetSceneId">
                    <option *ngFor="let scene of sceneOptions" [ngValue]="scene.id">{{ scene.name }}</option>
                    <option *ngIf="!ungroupedListed" [ngValue]="ungroupedId">{{ ungroupedName }}</option>
                </select>
            </div>
            <div class="twx-field">
                名称
                <input type="text" [(ngModel)]="draft.name" placeholder="按钮名称" />
            </div>
            <div class="twx-field">
                颜色
                <twx-color-swatches [(color)]="draft.color"></twx-color-swatches>
            </div>
            <div class="twx-field">
                内容（支持多行）
                <textarea #contentInput
                          [(ngModel)]="draft.text"
                          (ngModelChange)="syncDelayState()"
                          placeholder="命令内容；{{ '{{name}}' }} 会在执行前弹窗填写"></textarea>
            </div>
            <div class="twx-field">
                点击行为
                <select [(ngModel)]="draft.action" [disabled]="containsDelay">
                    <option value="fill">填充到当前终端</option>
                    <option value="copy">复制到剪贴板</option>
                </select>
            </div>
            <div class="twx-template-tools">
                <button type="button" class="twx-row-btn" (click)="insertTemplate(contentInput, '{{param}}')">
                    插入参数 {{ '{{param}}' }}
                </button>
                <button type="button" class="twx-row-btn" (click)="insertDelay(contentInput)">
                    插入延时 {{ '{{delay:2000}}' }}
                </button>
                <button type="button" class="twx-row-btn" (click)="insertTemplate(contentInput, '{{file:file}}')">
                    插入文件 {{ '{{file:...}}' }}
                </button>
                <button type="button" class="twx-row-btn" (click)="insertTemplate(contentInput, '{{js: }}')">
                    插入 JS {{ '{{js:...}}' }}
                </button>
                <span class="twx-template-hint">
                    参数会在执行前弹窗填写；延时只在直接执行时生效；文件块执行时弹出系统选择框（命名块可在 JS 中经 files.<名称> 引用 name/path 等属性）；JS 块在执行瞬间求值，可用 params / files / clipboardText / session（目标会话与输出快照）/ now / os。
                </span>
            </div>
            <label class="twx-checkbox">
                <input type="checkbox" [(ngModel)]="draft.appendCR" [disabled]="containsDelay" />
                填充后自动回车（直接执行）
            </label>
            <div class="twx-editor-actions">
                <button type="button" class="twx-btn" (click)="cancel()">取消</button>
                <button type="button" class="twx-btn is-primary" (click)="save()">保存</button>
            </div>
        </div>
    `,
})
export class ButtonEditorComponent implements OnChanges {
    @Input() sceneId = ''
    @Input() snippet!: Snippet
    @Input() button!: QuickButton
    /** True while creating: nothing is persisted until Save, and saving does
     *  not remove anything from a source scene. */
    @Input() isNew = false
    /** Emitted after a successful save or a cancel, to collapse the editor. */
    @Output() closed = new EventEmitter<void>()

    /** Group the button will land in; changing it on save moves the pair. */
    targetSceneId = ''
    readonly ungroupedId = UNGROUPED_SCENE_ID
    readonly ungroupedName = UNGROUPED_SCENE_NAME

    draft: ButtonDraft = {
        name: '',
        text: '',
        color: '#22c55e',
        action: 'fill',
        appendCR: false,
    }
    containsDelay = false

    constructor (
        private store: WorkwenchStore,
        private platform: PlatformService,
        private host: ElementRef<HTMLElement>,
    ) { }

    get sceneOptions (): Scene[] {
        return visibleScenes(this.store.snapshot)
    }

    get ungroupedListed (): boolean {
        return this.sceneOptions.some(scene => scene.id === UNGROUPED_SCENE_ID)
    }

    ngOnChanges (): void {
        this.targetSceneId = this.sceneId
        this.draft = {
            name: this.snippet.name,
            text: this.snippet.text,
            color: this.snippet.color,
            action: this.button.action,
            appendCR: this.button.appendCR,
        }
        this.syncDelayState()
    }

    insertDelay (textarea: HTMLTextAreaElement): void {
        this.insertTemplate(textarea, '{{delay:2000}}')
        this.draft.action = 'fill'
        this.draft.appendCR = true
        this.syncDelayState()
    }

    insertTemplate (textarea: HTMLTextAreaElement, template: string): void {
        const start = textarea.selectionStart ?? textarea.value.length
        const end = textarea.selectionEnd ?? start
        let insert = template
        if (template.startsWith('{{delay:')) {
            const before = textarea.value.slice(0, start)
            const after = textarea.value.slice(end)
            insert = `${before && !before.endsWith('\n') ? '\n' : ''}${template}${after && !after.startsWith('\n') ? '\n' : ''}`
        }
        textarea.setRangeText(insert, start, end, 'end')
        this.draft.text = textarea.value
        textarea.focus()
    }

    cancel (): void {
        this.closed.emit()
    }

    async save (): Promise<void> {
        const text = this.draft.text
        const hasDelay = hasDelayStep(text)
        const action: QuickButtonAction = hasDelay ? 'fill' : (this.draft.action === 'copy' ? 'copy' : 'fill')
        const appendCR = hasDelay || this.draft.appendCR
        let dangerAccepted = this.button.dangerAccepted

        if (action === 'fill' && appendCR && hasDangerousCommand(text)) {
            const sendChanged = text !== this.snippet.text
                || action !== this.button.action
                || appendCR !== this.button.appendCR
            if (!this.button.dangerAccepted || sendChanged) {
                const result = await this.platform.showMessageBox({
                    type: 'warning',
                    buttons: ['保存', '取消'],
                    defaultId: 1,
                    cancelId: 1,
                    message: '此快捷按钮会直接发送并回车，且命中高风险命令。保存后点击按钮将不再重复确认，是否继续保存？',
                })
                if (result.response !== 0) {
                    return
                }
                dangerAccepted = true
            }
        } else {
            dangerAccepted = false
        }

        this.store.saveButton(
            this.isNew ? null : this.sceneId,
            this.targetSceneId || this.sceneId,
            {
                id: this.snippet.id,
                name: this.draft.name.trim() || '未命名按钮',
                text,
                color: this.draft.color,
            },
            {
                type: 'quick-button',
                id: this.button.id,
                snippetId: this.snippet.id,
                action,
                appendCR,
                dangerAccepted,
            },
        )
        this.closed.emit()
    }

    private syncDelayState (): void {
        this.containsDelay = hasDelayStep(this.draft.text)
        if (this.containsDelay) {
            this.draft.action = 'fill'
            this.draft.appendCR = true
        }
    }
}

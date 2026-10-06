import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output } from '@angular/core'
import { FileRef, fileRefFromDataTransfer, pickFile } from '../fileTemplate'

/** Collected invocation inputs, resolved when the user confirms. */
export interface CollectResult {
    params: Record<string, string>
    files: Record<string, FileRef>
}

/**
 * Invocation input dialog: one text row per `{{param}}` and one drop zone
 * per `{{file}}` / `{{file:key}}` — click a zone to open the system picker,
 * or drop a file (or a dragged path) onto it.  Confirm is enabled once every
 * file is picked.  Mounted on document.body by the SidebarHostService;
 * resolves via `done` and is destroyed by the caller (ExecutorService).
 */
@Component({
    selector: 'twx-params-modal',
    template: `
        <div class="twx-modal-backdrop" (pointerdown)="backdrop($event)">
            <div class="twx-modal" role="dialog" aria-modal="true">
                <header class="twx-modal-header">
                    <strong>{{ title }}</strong>
                    <button type="button" class="twx-btn twx-icon-btn" title="取消" (click)="cancel()">×</button>
                </header>
                <div class="twx-modal-body">
                    <label class="twx-field" *ngFor="let field of fields">
                        {{ field.name }}
                        <input type="text"
                               [(ngModel)]="field.value"
                               (keydown.enter)="submit()"
                               (keydown.escape)="cancel()"
                               autocomplete="off"
                               spellcheck="false" />
                    </label>
                    <div *ngFor="let key of fileKeys" class="twx-file-drop"
                         [class.is-filled]="!!fileValues[key]"
                         [class.is-hover]="hoverKey === key"
                         (click)="pick(key)"
                         (dragover)="onDragOver($event, key)"
                         (dragleave)="hoverKey = null"
                         (drop)="onDrop($event, key)">
                        <ng-container *ngIf="fileValues[key]; else emptyFile">
                            <i class="fas fa-file"></i>
                            <span class="twx-file-name">{{ fileValues[key]!.name }}</span>
                            <span class="twx-file-path" [title]="fileValues[key]!.path">{{ fileValues[key]!.path }}</span>
                            <button type="button" class="twx-btn twx-icon-btn" title="清除"
                                    (click)="clearFile(key); $event.stopPropagation()">×</button>
                        </ng-container>
                        <ng-template #emptyFile>
                            <i class="fas fa-folder-open"></i>
                            <span>{{ key ? key + '：' : '' }}点击选择文件，或将文件拖到此处</span>
                        </ng-template>
                    </div>
                    <div class="twx-actions">
                        <button type="button" class="twx-btn" (click)="cancel()">取消</button>
                        <button type="button" class="twx-btn is-primary"
                                [disabled]="!allFilesPicked" (click)="submit()">执行</button>
                    </div>
                </div>
            </div>
        </div>
    `,
})
export class ParamsModalComponent implements OnInit, AfterViewInit {
    @Input() names: string[] = []
    @Input() history: Record<string, string> = {}
    @Input() fileKeys: string[] = []
    @Output() done = new EventEmitter<CollectResult | null>()

    fields: Array<{ name: string, value: string }> = []
    fileValues: Record<string, FileRef | null> = {}
    hoverKey: string | null = null

    constructor (
        private host: ElementRef<HTMLElement>,
    ) { }

    get title (): string {
        if (this.names.length && this.fileKeys.length) {
            return '填写参数与选择文件'
        }
        return this.fileKeys.length ? '选择文件' : '填写命令参数'
    }

    get allFilesPicked (): boolean {
        return this.fileKeys.every(key => !!this.fileValues[key])
    }

    ngOnInit (): void {
        this.fields = this.names.map(name => ({ name, value: this.history[name] || '' }))
        for (const key of this.fileKeys) {
            this.fileValues[key] = null
        }
    }

    ngAfterViewInit (): void {
        this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus()
    }

    async pick (key: string): Promise<void> {
        const ref = await pickFile(key ? `选择文件：${key}` : '选择文件')
        if (ref) {
            this.fileValues[key] = ref
        }
    }

    clearFile (key: string): void {
        this.fileValues[key] = null
    }

    onDragOver (event: DragEvent, key: string): void {
        event.preventDefault()
        event.stopPropagation()
        this.hoverKey = key
    }

    onDrop (event: DragEvent, key: string): void {
        event.preventDefault()
        event.stopPropagation()
        this.hoverKey = null
        const ref = fileRefFromDataTransfer(event.dataTransfer)
        if (ref) {
            this.fileValues[key] = ref
        }
    }

    submit (): void {
        if (!this.allFilesPicked) {
            return
        }
        const params: Record<string, string> = {}
        for (const field of this.fields) {
            params[field.name] = field.value
        }
        const files: Record<string, FileRef> = {}
        for (const key of this.fileKeys) {
            const ref = this.fileValues[key]
            if (ref) {
                files[key] = ref
            }
        }
        this.done.emit({ params, files })
    }

    cancel (): void {
        this.done.emit(null)
    }

    backdrop (event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.cancel()
        }
    }
}

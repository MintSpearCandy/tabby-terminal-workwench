import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output } from '@angular/core'
import { WorkwenchStore } from '../services/store.service'

/** Quick-pick FA icons for scenes; empty string restores the folder default. */
const ICON_PRESETS: readonly string[] = [
    '',
    'fas fa-terminal',
    'fas fa-server',
    'fas fa-network-wired',
    'fas fa-cloud',
    'fas fa-bug',
    'fas fa-cog',
    'fas fa-microchip',
    'fas fa-book',
    'fas fa-wrench',
    'fas fa-paper-plane',
    'fas fa-shield-alt',
]

/** Fallback shown whenever no icon is configured (folder default). */
export const SCENE_ICON_FALLBACK = 'far fa-folder'

export function sceneIconClass (icon: string | undefined, expanded?: boolean): string {
    const custom = (icon || '').trim()
    if (custom) {
        return `fa fa-fw ${custom}`
    }
    return `fa fa-fw far ${expanded === false ? 'fa-folder' : 'fa-folder-open'}`
}

/**
 * Scene name / colour / icon editor, opened from the settings-page tree (the
 * same pattern as Tabby's editProfileGroupModal on the profiles page).
 * Hosted on document.body by the SidebarHostService; the caller destroys it
 * on `done`.
 */
@Component({
    selector: 'twx-scene-edit-modal',
    template: `
        <div class="twx-modal-backdrop" (pointerdown)="backdrop($event)">
            <div class="twx-modal twx-modal--confirm" role="dialog" aria-modal="true" (keydown.escape)="close()">
                <header class="twx-modal-header">
                    <strong>{{ isNew ? '新增场景' : '编辑场景' }}</strong>
                    <button type="button" class="twx-btn twx-icon-btn" title="取消" (click)="close()">×</button>
                </header>
                <div class="twx-modal-body">
                    <label class="twx-field">
                        名称
                        <input type="text"
                               [(ngModel)]="name"
                               (keydown.enter)="save()"
                               placeholder="场景名称" />
                    </label>
                    <label class="twx-field">
                        颜色
                        <twx-color-swatches [(color)]="color"></twx-color-swatches>
                    </label>
                    <label class="twx-field">
                        图标
                        <div class="twx-icon-input">
                            <i class="fa fa-fw" [ngClass]="icon || ['far', 'fa-folder']"
                               [style.color]="color" title="预览"></i>
                            <input type="text"
                                   [(ngModel)]="icon"
                                   placeholder="Font Awesome 类名，如 fas fa-server；留空使用默认文件夹" />
                        </div>
                    </label>
                    <div class="twx-icon-presets">
                        <button *ngFor="let preset of presets" type="button"
                                class="twx-icon-preset" [class.is-selected]="icon === preset"
                                [title]="preset || '默认（文件夹）'" (click)="icon = preset">
                            <i *ngIf="preset; else folderIcon" class="fa fa-fw" [ngClass]="preset"></i>
                            <ng-template #folderIcon><i class="fa fa-fw far fa-folder"></i></ng-template>
                        </button>
                    </div>
                    <div class="twx-actions">
                        <button type="button" class="twx-btn" (click)="close()">取消</button>
                        <button type="button" class="twx-btn is-primary" (click)="save()">保存</button>
                    </div>
                </div>
            </div>
        </div>
    `,
})
export class SceneEditModalComponent implements AfterViewInit {
    @Input() sceneId = ''
    @Input() name = ''
    @Input() color = '#22c55e'
    @Input() icon = ''
    @Input() isNew = false
    @Output() done = new EventEmitter<void>()

    readonly presets = ICON_PRESETS

    constructor (
        private store: WorkwenchStore,
        private host: ElementRef<HTMLElement>,
    ) { }

    ngAfterViewInit (): void {
        this.host.nativeElement.querySelector<HTMLInputElement>('input[type=text]')?.focus()
    }

    close (): void {
        this.done.emit()
    }

    save (): void {
        this.store.updateSceneMeta(this.sceneId, {
            name: this.name,
            color: this.color,
            icon: this.icon,
        })
        this.done.emit()
    }

    backdrop (event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.close()
        }
    }
}

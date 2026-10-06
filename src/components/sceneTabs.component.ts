import { Component, OnDestroy } from '@angular/core'
import { findActiveScene, visibleScenes } from '../model'
import { Scene } from '../types'
import { WorkwenchStore } from '../services/store.service'

/** Icon shown when a scene has no icon configured. */
const FOLDER = 'far fa-folder'

/**
 * Scene switcher strip (Chrome-style tabs).  Each tab shows its scene icon
 * (folder fallback) painted in the scene colour, left of the title.
 * Management lives in settings; the virtual 无组别 group appears here only
 * while it holds snippets.
 */
@Component({
    selector: 'twx-scene-tabs',
    template: `
        <div class="twx-scene-strip" title="点击切换场景；场景与按钮管理请到 设置 → Terminal Workwench">
            <div class="twx-scene-tabs">
                <button *ngFor="let scene of scenes; trackBy: trackById"
                        type="button"
                        class="twx-scene-tab"
                        [class.is-active]="scene.id === activeSceneId"
                        (click)="select(scene.id)">
                    <i class="fa fa-fw twx-scene-tab-icon" [ngClass]="scene.icon || FOLDER"
                       [style.color]="scene.color" [title]="scene.name"></i>{{ scene.name }}
                </button>
            </div>
        </div>
    `,
})
export class SceneTabsComponent implements OnDestroy {
    scenes: Scene[] = []
    activeSceneId = ''
    readonly FOLDER = FOLDER
    private readonly subscription = this.store.config$.subscribe(config => {
        this.scenes = visibleScenes(config)
        this.activeSceneId = findActiveScene(config).id
    })

    constructor (
        private store: WorkwenchStore,
    ) { }

    select (sceneId: string): void {
        this.store.setActiveScene(sceneId)
    }

    trackById (_index: number, scene: Scene): string {
        return scene.id
    }

    ngOnDestroy (): void {
        this.subscription.unsubscribe()
    }
}

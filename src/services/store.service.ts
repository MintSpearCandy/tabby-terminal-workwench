import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'
import * as yaml from 'js-yaml'
import { BehaviorSubject, Observable } from 'rxjs'
import { CONFIG_KEY, WORKBENCH_SOURCE_KEY } from '../configKeys'
import { clampWidth, createDefaultConfig, createId, isSceneVisible, needsV2Migration, normalizeConfig, normalizeGlass, normalizeSidebarStyle } from '../model'
import { decideWorkbenchImport } from '../workbenchImport'
import { QuickButton, Scene, Snippet, WorkwenchConfig } from '../types'
import {
    RESIZE_SAVE_DELAY_MS,
    SCRATCH_SAVE_DELAY_MS,
    SELF_SAVE_SUPPRESS_MS,
    UNGROUPED_SCENE_COLOR,
    UNGROUPED_SCENE_ID,
    UNGROUPED_SCENE_NAME,
} from '../constants'

/**
 * Single source of truth for the plugin model.
 *
 * - holds a normalized in-memory model, exposes it via `config$`
 * - every mutation goes through a store method, producing a new model
 *   immutably, writing the changed fields back into the Tabby config proxy
 *   and saving (immediately or debounced)
 * - `config.changed$` is only honoured for external changes: echoes of our
 *   own saves are suppressed by a time window
 *
 * ConfigProxy pitfalls handled here (see workbench experience):
 * structural defaults create phantom non-empty objects, so "has the user any
 * data" decisions use `readRaw()` YAML; leaf values equal to defaults are
 * dropped from YAML, which makes `importedFromWorkbench` a self-erasing
 * false and a persisted true; arrays only persist via whole-array assignment.
 */
@Injectable({ providedIn: 'root' })
export class WorkwenchStore {
    private model: WorkwenchConfig = createDefaultConfig()
    private readonly subject = new BehaviorSubject<WorkwenchConfig>(this.model)
    readonly config$: Observable<WorkwenchConfig> = this.subject.asObservable()
    private readonly readySubject = new BehaviorSubject<boolean>(false)
    readonly ready$ = this.readySubject.asObservable()

    private initialized = false
    private lastSelfSaveAt = 0
    private saveTimers: Record<string, any> = {}

    constructor (
        private config: ConfigService,
    ) {
        this.config.ready$.subscribe(() => this.initialize())
        this.config.changed$.subscribe(() => this.onExternalChange())
        window.addEventListener('beforeunload', () => this.flushPendingSaves())
        window.addEventListener('blur', () => this.flushPendingSaves())
    }

    get snapshot (): WorkwenchConfig {
        return this.model
    }

    get ready (): boolean {
        return this.readySubject.value
    }

    // ── toggles / view state ────────────────────────────────────────────

    setEnabled (enabled: boolean): void {
        this.commit({ ...this.model, enabled })
    }

    /**
     * Session-only visibility toggle (toolbar button / sidebar close).
     * Deliberately not persisted: the startup state is `openDefault`.
     */
    setOpen (open: boolean): void {
        if (this.model.open === open) {
            return
        }
        this.model = { ...this.model, open }
        this.subject.next({ ...this.model })
    }

    /** Persisted startup default — set from the settings page only. */
    setOpenDefault (openDefault: boolean): void {
        this.commit({ ...this.model, openDefault })
    }

    /** Palette display mode: grouped by scene vs flat list. */
    setPaletteGrouped (paletteGrouped: boolean): void {
        this.commit({ ...this.model, paletteGrouped })
    }

    /** Quick-card glass tunables (clamped); partial update in one commit. */
    setGlass (patch: Partial<Pick<WorkwenchConfig, 'glassBlurEnabled' | 'glassOpacity' | 'glassBlur' | 'glassBrightness'>>): void {
        const merged = { ...this.model, ...patch }
        const glass = normalizeGlass({
            opacity: merged.glassOpacity,
            blur: merged.glassBlur,
            brightness: merged.glassBrightness,
        })
        this.commit({
            ...this.model,
            glassBlurEnabled: merged.glassBlurEnabled === true,
            glassOpacity: glass.opacity,
            glassBlur: glass.blur,
            glassBrightness: glass.brightness,
        })
    }

    /** Sidebar translucent-mask style; partial update in one commit. */
    setSidebarStyle (patch: Partial<Pick<WorkwenchConfig, 'sidebarTransparent' | 'sidebarOpacity' | 'sidebarColor'>>): void {
        const merged = { ...this.model, ...patch }
        const style = normalizeSidebarStyle({
            transparent: merged.sidebarTransparent,
            opacity: merged.sidebarOpacity,
            color: merged.sidebarColor,
        })
        this.commit({
            ...this.model,
            sidebarTransparent: style.transparent,
            sidebarOpacity: style.opacity,
            sidebarColor: style.color,
        })
    }

    setActiveScene (sceneId: string): void {
        if (!this.model.scenes.some(scene => scene.id === sceneId) || sceneId === this.model.activeSceneId) {
            return
        }
        this.commit({ ...this.model, activeSceneId: sceneId })
    }

    setScratchpad (sceneId: string, text: string): void {
        this.updateScene(sceneId, scene => ({ ...scene, scratchpad: text }), 'scratch', SCRATCH_SAVE_DELAY_MS)
    }

    /** Width during a live drag: persist debounced, apply visually elsewhere. */
    setDraggingWidth (width: number): void {
        this.commit({ ...this.model, width: clampWidth(width) }, 'resize', RESIZE_SAVE_DELAY_MS)
    }

    // ── scene management (settings page) ────────────────────────────────

    addScene (): string {
        const id = createId('scene')
        const scene: Scene = { id, name: '新场景', color: '#a855f7', icon: '', scratchpad: '', snippets: [], buttons: [] }
        this.commit({ ...this.model, scenes: [...this.model.scenes, scene] })
        return id
    }

    /** One-commit scene meta edit (name / colour / icon) from the edit modal. */
    updateSceneMeta (sceneId: string, patch: { name: string, color: string, icon: string }): void {
        this.updateScene(sceneId, scene => ({
            ...scene,
            name: patch.name.trim() || '未命名场景',
            color: patch.color,
            icon: patch.icon.trim(),
        }))
    }

    /** Returns false when refused (a visible scene must remain). */
    removeScene (sceneId: string): boolean {
        const remaining = this.model.scenes.filter(scene => scene.id !== sceneId)
        if (!remaining.some(isSceneVisible)) {
            return false
        }
        const activeSceneId = remaining.some(scene => scene.id === this.model.activeSceneId)
            ? this.model.activeSceneId
            : remaining[0].id
        this.commit({ ...this.model, scenes: remaining, activeSceneId })
        return true
    }

    moveScene (sceneId: string, delta: number): void {
        const index = this.model.scenes.findIndex(scene => scene.id === sceneId)
        const target = index + delta
        if (index < 0 || target < 0 || target >= this.model.scenes.length) {
            return
        }
        const scenes = [...this.model.scenes]
        const [moved] = scenes.splice(index, 1)
        scenes.splice(target, 0, moved)
        this.commit({ ...this.model, scenes })
    }

    // ── snippet + quick-button management ───────────────────────────────

    /**
     * Create / move / update one quick button in a single commit.  A null
     * `fromSceneId` means creation; a differing one moves the snippet and
     * binding across scenes.  The virtual 无组别 scene is created on demand
     * and pruned again once it holds nothing.
     */
    saveButton (
        fromSceneId: string | null,
        toSceneId: string,
        snippet: Snippet,
        button: QuickButton,
    ): void {
        let scenes = [...this.model.scenes]
        if (fromSceneId && fromSceneId !== toSceneId) {
            scenes = scenes.map(scene => {
                if (scene.id !== fromSceneId) {
                    return scene
                }
                // The snippet moves with the binding; sibling bindings in the
                // source that still referenced it become dangling (filtered).
                return {
                    ...scene,
                    buttons: scene.buttons.filter(candidate => candidate.id !== button.id),
                    snippets: scene.snippets.filter(candidate => candidate.id !== snippet.id),
                }
            })
        }
        if (scenes.some(scene => scene.id === toSceneId)) {
            scenes = scenes.map(scene => {
                if (scene.id !== toSceneId) {
                    return scene
                }
                const snippetKnown = scene.snippets.some(candidate => candidate.id === snippet.id)
                const snippets = snippetKnown
                    ? scene.snippets.map(candidate => candidate.id === snippet.id ? snippet : candidate)
                    : [snippet, ...scene.snippets]
                const bindingKnown = scene.buttons.some(candidate => candidate.id === button.id)
                const buttons = bindingKnown
                    ? scene.buttons.map(candidate => candidate.id === button.id ? button : candidate)
                    : [button, ...scene.buttons]
                return { ...scene, snippets, buttons }
            })
        } else if (toSceneId === UNGROUPED_SCENE_ID) {
            scenes = [...scenes, {
                id: UNGROUPED_SCENE_ID,
                name: UNGROUPED_SCENE_NAME,
                color: UNGROUPED_SCENE_COLOR,
                icon: '',
                scratchpad: '',
                snippets: [snippet],
                buttons: [button],
            }]
        } else {
            return
        }
        this.commit(this.pruneUngrouped({ ...this.model, scenes }))
    }

    /**
     * Remove a quick-button binding.  Its snippet is dropped too when no
     * other binding still references it — until other invokers exist, an
     * unreferenced snippet can never come back through the UI.
     */
    removeButton (sceneId: string, buttonId: string): void {
        const target = this.model.scenes
            .find(scene => scene.id === sceneId)
            ?.buttons.find(button => button.id === buttonId)
        if (!target) {
            return
        }
        const scenes = this.model.scenes.map(scene => {
            if (scene.id !== sceneId) {
                return scene
            }
            const buttons = scene.buttons.filter(button => button.id !== buttonId)
            const snippets = !buttons.some(button => button.snippetId === target.snippetId)
                ? scene.snippets.filter(snippet => snippet.id !== target.snippetId)
                : scene.snippets
            return { ...scene, buttons, snippets }
        })
        this.commit(this.pruneUngrouped({ ...this.model, scenes }))
    }

    /** Drop the virtual ungrouped scene once it is completely empty (and is
     *  not the only scene left); keep activeSceneId pointing at a live one. */
    private pruneUngrouped (model: WorkwenchConfig): WorkwenchConfig {
        const ungrouped = model.scenes.find(scene => scene.id === UNGROUPED_SCENE_ID)
        const empty = !ungrouped
            || (!ungrouped.snippets.length && !ungrouped.buttons.length && !ungrouped.scratchpad)
        if (!ungrouped || !empty || model.scenes.length <= 1) {
            return model
        }
        const scenes = model.scenes.filter(scene => scene.id !== UNGROUPED_SCENE_ID)
        const activeSceneId = scenes.some(scene => scene.id === model.activeSceneId)
            ? model.activeSceneId
            : scenes[0].id
        return { ...model, scenes, activeSceneId }
    }

    moveButton (sceneId: string, buttonId: string, delta: number): void {
        this.updateScene(sceneId, scene => {
            const index = scene.buttons.findIndex(button => button.id === buttonId)
            const target = index + delta
            if (index < 0 || target < 0 || target >= scene.buttons.length) {
                return scene
            }
            const buttons = [...scene.buttons]
            const [moved] = buttons.splice(index, 1)
            buttons.splice(target, 0, moved)
            return { ...scene, buttons }
        })
    }

    /** Persist order after an in-sidebar drag committed DOM-order ids. */
    reorderButtons (sceneId: string, orderedIds: string[]): void {
        this.updateScene(sceneId, scene => {
            if (scene.buttons.length !== orderedIds.length) {
                return scene
            }
            const lookup = new Map(scene.buttons.map(button => [button.id, button]))
            const buttons = orderedIds.map(id => lookup.get(id))
            if (buttons.some(button => !button)) {
                return scene
            }
            return { ...scene, buttons: buttons as QuickButton[] }
        })
    }

    markDangerAccepted (sceneId: string, buttonId: string): void {
        this.updateScene(sceneId, scene => ({
            ...scene,
            buttons: scene.buttons.map(button => button.id === buttonId
                ? { ...button, dangerAccepted: true }
                : button),
        }))
    }

    // ── lifecycle ───────────────────────────────────────────────────────

    private initialize (): void {
        if (this.initialized || !this.config.store) {
            return
        }
        this.initialized = true

        let raw: any = null
        try {
            raw = yaml.load(this.config.readRaw()) as any
        } catch {
            raw = null
        }

        const decision = decideWorkbenchImport(raw?.[CONFIG_KEY], raw?.[WORKBENCH_SOURCE_KEY])
        let needsSave = false
        if (decision.action === 'import') {
            this.model = decision.config
            needsSave = true
        } else {
            this.model = normalizeConfig(raw?.[CONFIG_KEY] ?? (this.config.store as any)[CONFIG_KEY])
            if (decision.action === 'mark-only') {
                // The user already has own data; just close the import door.
                this.model.importedFromWorkbench = true
                needsSave = true
            }
            // Persist the v1 → v2 snippet/binding split on first load.
            if (needsV2Migration(raw?.[CONFIG_KEY])) {
                needsSave = true
            }
        }
        this.writeModel(this.model)
        if (needsSave) {
            void this.saveNow()
        }
        this.subject.next({ ...this.model })
        this.readySubject.next(true)
    }

    private onExternalChange (): void {
        if (!this.initialized) {
            return
        }
        if (Date.now() - this.lastSelfSaveAt < SELF_SAVE_SUPPRESS_MS) {
            return
        }
        let raw: any = null
        try {
            raw = yaml.load(this.config.readRaw()) as any
        } catch {
            return
        }
        const next = normalizeConfig(raw?.[CONFIG_KEY])
        // `open` is session state: external config changes must not clobber it.
        next.open = this.model.open
        if (JSON.stringify(next) === JSON.stringify(this.model)) {
            return
        }
        this.model = next
        this.subject.next({ ...this.model })
    }

    private updateScene (
        sceneId: string,
        mutate: (scene: Scene) => Scene,
        debounceKey?: string,
        debounceMs?: number,
    ): void {
        const scenes = this.model.scenes.map(scene => scene.id === sceneId ? mutate(scene) : scene)
        const next = { ...this.model, scenes }
        if (debounceKey && debounceMs !== undefined) {
            this.commit(next, debounceKey, debounceMs)
        } else {
            this.commit(next)
        }
    }

    private commit (next: WorkwenchConfig, debounceKey?: string, debounceMs?: number): void {
        this.model = next
        this.writeModel(this.model)
        if (debounceKey && debounceMs !== undefined) {
            this.saveDebounced(debounceKey, debounceMs)
        } else {
            void this.saveNow()
        }
        this.subject.next({ ...this.model })
    }

    private writeModel (model: WorkwenchConfig): void {
        const target = (this.config.store as any)[CONFIG_KEY]
        target.version = model.version
        target.enabled = model.enabled
        target.openDefault = model.openDefault
        target.paletteGrouped = model.paletteGrouped
        target.glassOpacity = model.glassOpacity
        target.glassBlurEnabled = model.glassBlurEnabled
        target.glassBlur = model.glassBlur
        target.glassBrightness = model.glassBrightness
        target.sidebarTransparent = model.sidebarTransparent
        target.sidebarOpacity = model.sidebarOpacity
        target.sidebarColor = model.sidebarColor
        target.width = model.width
        target.activeSceneId = model.activeSceneId
        target.importedFromWorkbench = model.importedFromWorkbench
        target.scenes = model.scenes
        // Drop the pre-split `open` key if an older build persisted it.
        this.removeConfigValue(target, 'open')
    }

    private removeConfigValue (target: any, key: string): void {
        if (typeof target.__setValue === 'function') {
            target.__setValue(key, undefined)
        } else {
            delete target[key]
        }
    }

    private async saveNow (): Promise<void> {
        this.lastSelfSaveAt = Date.now()
        await this.config.save()
        this.lastSelfSaveAt = Date.now()
    }

    private saveDebounced (key: string, ms: number): void {
        clearTimeout(this.saveTimers[key])
        this.saveTimers[key] = setTimeout(() => {
            delete this.saveTimers[key]
            void this.saveNow()
        }, ms)
    }

    flushPendingSaves (): void {
        const pending = Object.keys(this.saveTimers)
        if (!pending.length) {
            return
        }
        for (const key of pending) {
            clearTimeout(this.saveTimers[key])
            delete this.saveTimers[key]
        }
        void this.saveNow()
    }
}

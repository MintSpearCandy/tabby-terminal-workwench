import { WorkwenchConfig, WorkbenchSourceConfig } from './types'
import { clampWidth, createDefaultConfig, normalizeScene } from './model'

export type ImportDecision =
    | { action: 'skip' }
    | { action: 'mark-only' }
    | { action: 'import', config: WorkwenchConfig }
    | { action: 'none' }

function hasOwnPersistedData (ownRaw: any): boolean {
    return Array.isArray(ownRaw?.scenes) && ownRaw.scenes.length > 0
}

function hasWorkbenchSourceData (workbenchRaw: any): boolean {
    return Array.isArray(workbenchRaw?.categories) && workbenchRaw.categories.length > 0
}

/**
 * Convert a tabby-command-workbench config (v2 structure) into our model.
 * `categories` become scenes, `quickButtons` become buttons; `commonCommands`
 * are dropped — the new product has no such entity.
 */
export function convertWorkbenchConfig (source: WorkbenchSourceConfig): WorkwenchConfig {
    const config = createDefaultConfig()
    const scenes = (source.categories || []).map(category => normalizeScene({
        ...category,
        buttons: category.quickButtons ?? [],
    }))
    if (!scenes.length) {
        return config
    }
    const openDefault = source.sidebarOpen !== false
    return {
        ...config,
        enabled: source.enabled !== false,
        openDefault,
        open: openDefault,
        width: clampWidth(source.sidebarWidth),
        activeSceneId: scenes.some(scene => scene.id === source.activeCategoryId)
            ? source.activeCategoryId!
            : scenes[0].id,
        importedFromWorkbench: true,
        scenes,
    }
}

/**
 * Decide what to do on startup about a potential one-time import from
 * tabby-command-workbench.  Both arguments come from `config.readRaw()` YAML
 * parsing, never from the proxied store (structural defaults would create
 * phantom data there).
 *
 * - already imported or own data exists → never import again
 * - no own data and workbench data exists → import once, then mark
 * - nothing to import → stay unmarked so a later workbench install can still
 *   be picked up
 */
export function decideWorkbenchImport (ownRaw: any, workbenchRaw: any): ImportDecision {
    if (ownRaw?.importedFromWorkbench === true) {
        return { action: 'skip' }
    }
    if (hasOwnPersistedData(ownRaw)) {
        return { action: 'mark-only' }
    }
    if (hasWorkbenchSourceData(workbenchRaw)) {
        return { action: 'import', config: convertWorkbenchConfig(workbenchRaw) }
    }
    return { action: 'none' }
}

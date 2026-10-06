import { QuickButton, ResolvedButton, Scene, Snippet, WorkwenchConfig } from './types'
import {
    DEFAULT_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    UNGROUPED_SCENE_ID,
} from './constants'

const now = (): number => Date.now()

export function createId (prefix: string): string {
    return `${prefix}-${now()}-${Math.random().toString(16).slice(2)}`
}

export function normalizeSnippet (item: Partial<Snippet>, index = 0): Snippet {
    return {
        id: item.id || createId(`snip-${index}`),
        name: item.name || '未命名片段',
        text: item.text || '',
        color: item.color || '#22c55e',
    }
}

/** v1 buttons carried the content inline (name/text/color); migrate one into
 *  a snippet plus a quick-button binding referencing it. */
function migrateInlineButton (item: any, index: number): { snippet: Snippet, button: QuickButton } {
    const bindingId = item.id || createId(`btn-${index}`)
    const snippet = normalizeSnippet({
        // Deterministic id keeps the split idempotent within one pass.
        id: item.id ? `snip-${item.id}` : undefined,
        name: item.name,
        text: item.text,
        color: item.color,
    }, index)
    const button: QuickButton = {
        type: 'quick-button',
        id: bindingId,
        snippetId: snippet.id,
        action: item.action === 'copy' ? 'copy' : 'fill',
        appendCR: !!item.appendCR,
        dangerAccepted: !!item.dangerAccepted,
    }
    return { snippet, button }
}

function normalizeBinding (item: any, index: number): QuickButton {
    return {
        type: 'quick-button',
        id: item.id || createId(`btn-${index}`),
        snippetId: item.snippetId || '',
        action: item.action === 'copy' ? 'copy' : 'fill',
        appendCR: !!item.appendCR,
        dangerAccepted: !!item.dangerAccepted,
    }
}

function snippet (id: string, name: string, text: string, color: string): Snippet {
    return { id, name, text, color }
}

function binding (id: string, snippetId: string, action: QuickButton['action'] = 'fill', appendCR = false): QuickButton {
    return { type: 'quick-button', id, snippetId, action, appendCR, dangerAccepted: false }
}

export function createDefaultScenes (): Scene[] {
    return [
        {
            id: 'scene-serial',
            name: '串口调试',
            color: '#22c55e',
            icon: '',
            scratchpad: '',
            snippets: [
                snippet('snip-serial-help', '帮助', 'help', '#2563eb'),
                snippet('snip-serial-version', '查询版本', 'version', '#0ea5e9'),
                snippet('snip-serial-reboot', '重启设备', 'reboot', '#dc2626'),
            ],
            buttons: [
                binding('serial-help', 'snip-serial-help'),
                binding('serial-version', 'snip-serial-version', 'fill', true),
                binding('serial-reboot', 'snip-serial-reboot'),
            ],
        },
        {
            id: 'scene-adb',
            name: 'ADB',
            color: '#38bdf8',
            icon: '',
            scratchpad: '',
            snippets: [
                snippet('snip-adb-devices', '设备列表', 'adb devices', '#38bdf8'),
                snippet('snip-adb-shell', '进入 Shell', 'adb shell', '#22c55e'),
                snippet('snip-adb-reboot', '重启设备', 'adb reboot', '#dc2626'),
            ],
            buttons: [
                binding('adb-devices', 'snip-adb-devices', 'fill', true),
                binding('adb-shell', 'snip-adb-shell', 'fill', true),
                binding('adb-reboot', 'snip-adb-reboot'),
            ],
        },
    ]
}

export function createDefaultConfig (): WorkwenchConfig {
    const scenes = createDefaultScenes()
    return {
        version: 2,
        enabled: true,
        openDefault: true,
        paletteGrouped: false,
        glassOpacity: 0.15,
        glassBlur: 8,
        glassBrightness: 1,
        open: true,
        width: DEFAULT_SIDEBAR_WIDTH,
        activeSceneId: scenes[0].id,
        importedFromWorkbench: false,
        scenes,
    }
}

/** Scene-shaped input.  `buttons` accepts both v2 bindings (with snippetId)
 *  and legacy v1 inline buttons; `tempSnippets` is the workbench-source
 *  scratchpad fallback. */
export interface SceneInput extends Omit<Partial<Scene>, 'buttons' | 'snippets'> {
    buttons?: Array<Record<string, any>>
    snippets?: Array<Partial<Snippet>>
    tempSnippets?: Array<{ text?: string }>
}

export function normalizeScene (item: SceneInput, index = 0): Scene {
    const snippets: Snippet[] = (item.snippets || []).map(normalizeSnippet)
    const buttons: QuickButton[] = []
    for (const [i, raw] of (item.buttons || []).entries()) {
        if (raw?.snippetId) {
            buttons.push(normalizeBinding(raw, i))
        } else {
            // Legacy v1 inline button → split into snippet + binding.
            const migrated = migrateInlineButton(raw, i)
            buttons.push(migrated.button)
            snippets.push(migrated.snippet)
        }
    }
    // Drop bindings whose snippet is gone; unreferenced snippets are kept as
    // library content for future invokers.
    const live = buttons.filter(button => snippets.some(candidate => candidate.id === button.snippetId))
    return {
        id: item.id || createId(`scene-${index}`),
        name: item.name || '未命名场景',
        color: item.color || '#22c55e',
        icon: typeof item.icon === 'string' ? item.icon.trim() : '',
        scratchpad: item.scratchpad
            || (item.tempSnippets || []).map(snip => snip.text || '').filter(Boolean).join('\n\n'),
        snippets,
        buttons: live.length ? live : [],
    }
}

/** Join a scene's bindings with their snippets; dangling bindings drop out. */
export function resolveSceneButtons (scene: Scene): ResolvedButton[] {
    const lookup = new Map(scene.snippets.map(snip => [snip.id, snip]))
    return scene.buttons
        .map(binding => {
            const snippet = lookup.get(binding.snippetId)
            return snippet ? { binding, snippet } : null
        })
        .filter((resolved): resolved is ResolvedButton => resolved !== null)
}

export function clampWidth (width: number): number {
    const value = Number(width)
    if (!Number.isFinite(value) || value <= 0) {
        return DEFAULT_SIDEBAR_WIDTH
    }
    return Math.round(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value)))
}

/** Glass tunables, clamped to sane ranges with defaults on invalid input. */
export interface GlassSettings {
    opacity: number
    blur: number
    brightness: number
}

export function normalizeGlass (raw: any): GlassSettings {
    const num = (value: any, min: number, max: number, fallback: number): number => {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
    }
    return {
        opacity: num(raw?.opacity, 0, 1, 0.15),
        blur: num(raw?.blur, 0, 40, 8),
        brightness: num(raw?.brightness, 0.2, 2, 1),
    }
}

export function normalizeConfig (raw: any): WorkwenchConfig {
    if (Array.isArray(raw?.scenes)) {
        // The virtual ungrouped scene only exists while it holds content.
        let scenes = raw.scenes
            .map(normalizeScene)
            .filter(scene => isSceneVisible(scene))
        if (!scenes.length) {
            scenes = [...scenes, ...createDefaultScenes()]
        }
        const openDefault = raw.openDefault !== false
        const glass = normalizeGlass({
            opacity: raw.glassOpacity,
            blur: raw.glassBlur,
            brightness: raw.glassBrightness,
        })
        return {
            version: 2,
            enabled: raw.enabled !== false,
            openDefault,
            paletteGrouped: raw.paletteGrouped === true,
            glassOpacity: glass.opacity,
            glassBlur: glass.blur,
            glassBrightness: glass.brightness,
            // Session state starts from the persisted startup default.
            open: openDefault,
            width: clampWidth(raw.width),
            activeSceneId: scenes.some(scene => scene.id === raw.activeSceneId)
                ? raw.activeSceneId
                : scenes[0].id,
            importedFromWorkbench: !!raw.importedFromWorkbench,
            scenes,
        }
    }

    // No usable scene data (e.g. the user only flipped a toggle, so ConfigProxy
    // omitted scenes as default-equal): keep defaults but honor scalar flags.
    const glassFallback = normalizeGlass({
        opacity: raw?.glassOpacity,
        blur: raw?.glassBlur,
        brightness: raw?.glassBrightness,
    })
    return {
        ...createDefaultConfig(),
        enabled: raw?.enabled !== false,
        openDefault: raw?.openDefault !== false,
        paletteGrouped: raw?.paletteGrouped === true,
        glassOpacity: glassFallback.opacity,
        glassBlur: glassFallback.blur,
        glassBrightness: glassFallback.brightness,
        open: raw?.openDefault !== false,
    }
}

/** The virtual "无组别" scene hides everywhere while it has no snippets. */
export function isSceneVisible (scene: Scene): boolean {
    return scene.id !== UNGROUPED_SCENE_ID || scene.snippets.length > 0
}

export function visibleScenes (config: Pick<WorkwenchConfig, 'scenes'>): Scene[] {
    return config.scenes.filter(isSceneVisible)
}

/**
 * True when the persisted shape still needs the v1 → v2 write-back.  Purely
 * structural: ConfigProxy drops a `version` leaf equal to the declared
 * default, so the key cannot be trusted on disk — data counts as migrated
 * when every scene carries a snippets array and no inline (v1) buttons.
 */
export function needsV2Migration (raw: any): boolean {
    if (!Array.isArray(raw?.scenes)) {
        return true
    }
    return raw.scenes.some((scene: any) =>
        !Array.isArray(scene?.snippets)
        || (scene.buttons || []).some((button: any) => !button?.snippetId))
}

export function findActiveScene (config: WorkwenchConfig): Scene {
    const visible = visibleScenes(config)
    return visible.find(scene => scene.id === config.activeSceneId)
        || visible[0]
        || config.scenes[0]
}

import * as fsSync from 'fs'
import * as path from 'path'
import { FILE_TEXT_MAX_BYTES } from './constants'

/**
 * {{file}} / {{file:key}} template objects: pick a local file at execution
 * time through the native OS dialog (DOM input[type=file] — in Electron it
 * opens the platform picker and hands back a File whose absolute path comes
 * from webUtils).  The tag renders to the absolute path; named picks also
 * expose a FileRef with name/path/size members to {{js:}} via `files.<key>`.
 */

export interface FileRef {
    readonly name: string
    readonly stem: string
    readonly ext: string
    readonly path: string
    readonly dir: string
    readonly size: number
    readonly sizeMB: number
    readonly mtime: string
    /** Lazy: file content read on first access, capped. */
    readonly text: string
}

const FILE_TAG_PATTERN = /\{\{\s*file(?:\s*:\s*([\w-]+))?\s*\}\}/g

/** Unique file-tag keys in order of appearance ('' for bare {{file}}). */
export function extractFileKeys (text: string): string[] {
    const keys: string[] = []
    const seen = new Set<string>()
    const pattern = new RegExp(FILE_TAG_PATTERN)
    let match = pattern.exec(text)
    while (match) {
        const key = match[1] || ''
        if (!seen.has(key)) {
            seen.add(key)
            keys.push(key)
        }
        match = pattern.exec(text)
    }
    return keys
}

/** Remove file tags (for param scanning on plain text). */
export function stripFileTags (text: string): string {
    return text.replace(new RegExp(FILE_TAG_PATTERN), '')
}

/** Substitute each file tag with its picked absolute path. */
export function replaceFileTags (text: string, pathsByKey: Record<string, string>): string {
    return text.replace(new RegExp(FILE_TAG_PATTERN), (_, key: string | undefined) => pathsByKey[key || ''] ?? '')
}

/** Build the JS-exposed file handle; `text` is read lazily and capped. */
export function buildFileRef (filePath: string): FileRef {
    const stat = fsSync.statSync(filePath)
    const base = path.basename(filePath)
    const ext = path.extname(base).slice(1).toLowerCase()
    const ref: Omit<FileRef, 'text'> = {
        name: base,
        stem: ext ? base.slice(0, base.length - ext.length - 1) : base,
        ext,
        path: filePath,
        dir: path.dirname(filePath),
        size: stat.size,
        sizeMB: Math.round(stat.size / 1024 / 1024 * 100) / 100,
        mtime: stat.mtime.toISOString(),
    }
    return Object.defineProperty(ref, 'text', {
        enumerable: true,
        get (): string {
            try {
                const fd = fsSync.openSync(filePath, 'r')
                try {
                    const buffer = Buffer.alloc(FILE_TEXT_MAX_BYTES)
                    const read = fsSync.readSync(fd, buffer, 0, buffer.length, 0)
                    return buffer.toString('utf8', 0, read)
                } finally {
                    fsSync.closeSync(fd)
                }
            } catch {
                return ''
            }
        },
    }) as FileRef
}

/**
 * Open the native file picker.  Resolves with a FileRef, or null when the
 * user cancels (the input `cancel` event — supported in Chromium 113+).
 */
export function pickFile (title: string): Promise<FileRef | null> {
    return new Promise(resolve => {
        const input = document.createElement('input')
        let settled = false
        const finish = (value: FileRef | null): void => {
            if (settled) {
                return
            }
            settled = true
            input.remove()
            resolve(value)
        }
        input.type = 'file'
        input.title = title
        input.style.position = 'fixed'
        input.style.left = '-9999px'
        input.addEventListener('change', () => {
            const file = input.files?.[0]
            if (!file) {
                finish(null)
                return
            }
            const filePath = absolutePathOf(file)
            finish(filePath ? buildFileRef(filePath) : null)
        })
        input.addEventListener('cancel', () => finish(null))
        document.body.appendChild(input)
        input.click()
    })
}

/** Electron File → absolute path (webUtils, with the legacy File.path fallback). */
function absolutePathOf (file: File): string | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron') as { webUtils?: { getPathForFile?: (f: File) => string } }
        const viaWebUtils = electron?.webUtils?.getPathForFile?.(file)
        if (viaWebUtils) {
            return viaWebUtils
        }
    } catch {
        // fall through to the legacy property
    }
    return (file as File & { path?: string }).path || null
}

/**
 * Build a FileRef from a drop payload: a real file first (webUtils path),
 * then a plain-text / file:// path dragged from outside.  Null when nothing
 * usable was dropped.
 */
export function fileRefFromDataTransfer (dt: DataTransfer | null): FileRef | null {
    if (!dt) {
        return null
    }
    const file = dt.files?.[0]
    if (file) {
        const filePath = absolutePathOf(file)
        if (filePath) {
            try {
                return buildFileRef(filePath)
            } catch {
                // unreadable pick — fall through to the text branch
            }
        }
    }
    const text = (() => {
        try {
            return dt.getData?.('text/plain')?.trim() || ''
        } catch {
            return ''
        }
    })()
    if (text) {
        let candidate = text
        if (/^file:\/\//i.test(candidate)) {
            try {
                candidate = decodeURI(candidate.replace(/^file:\/\//i, ''))
            } catch {
                candidate = candidate.replace(/^file:\/\//i, '')
            }
        }
        try {
            return buildFileRef(candidate)
        } catch {
            return null
        }
    }
    return null
}

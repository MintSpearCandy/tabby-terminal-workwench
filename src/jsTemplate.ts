import * as vm from 'vm'
import { JS_EXECUTION_TIMEOUT_MS } from './constants'

/**
 * {{js: ...}} template objects: user-authored JavaScript evaluated at render
 * time, whose result is embedded as text.  Runs in a fresh vm context with
 * only the injected context values — not a security boundary (snippets are
 * the user's own local config, same trust level as the commands), but it
 * keeps accidents away from the host globals and the timeout kills sync
 * infinite loops.
 */
export interface JsContext {
    /** Collected {{param}} values. */
    params: Record<string, string>
    /** Clipboard content read just before evaluation. */
    clipboardText: string
    /** Evaluation moment. */
    now: Date
    /** Host platform: 'win32' | 'darwin' | 'linux'. */
    os: string
    /** Target terminal session snapshot (metadata + output). */
    session: Record<string, unknown>
    /** Picked files by {{file:key}} key. */
    files: Record<string, unknown>
}

export interface JsResolveResult {
    text: string
    errors: string[]
}

interface JsTag {
    start: number
    end: number
    source: string
}

const JS_TAG_OPEN = '{{js:'

/**
 * Scan closed {{js: ...}} tags.  The terminator is the first `}}` at brace
 * depth 0 outside quotes, so object literals, regex quantifiers and `}}`
 * inside strings all work; tags may span lines.
 */
export function scanJsTags (text: string): JsTag[] {
    const tags: JsTag[] = []
    let searchFrom = 0
    while (true) {
        const at = text.indexOf(JS_TAG_OPEN, searchFrom)
        if (at < 0) {
            break
        }
        let j = at + JS_TAG_OPEN.length
        let depth = 0
        let quote: string | null = null
        let terminated = -1
        while (j < text.length) {
            const ch = text[j]
            if (quote) {
                if (ch === '\\') {
                    j += 2
                    continue
                }
                if (ch === quote) {
                    quote = null
                }
                j++
                continue
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                quote = ch
                j++
                continue
            }
            if (ch === '{') {
                depth++
                j++
                continue
            }
            if (ch === '}') {
                if (depth > 0) {
                    depth--
                    j++
                    continue
                }
                if (text[j + 1] === '}') {
                    terminated = j
                }
                break
            }
            j++
        }
        if (terminated < 0) {
            // Unterminated tag: treat the rest as plain text (params flow
            // reports it via stripJsTemplates leaving it intact is wrong —
            // instead stop scanning here; the raw tag stays visible).
            break
        }
        tags.push({ start: at, end: terminated + 2, source: text.slice(at + JS_TAG_OPEN.length, terminated).trim() })
        searchFrom = terminated + 2
    }
    return tags
}

export function hasJsTemplates (text: string): boolean {
    return scanJsTags(text).length > 0
}

/** Remove js tags (for param scanning / delay detection on plain text). */
export function stripJsTemplates (text: string): string {
    const tags = scanJsTags(text)
    let out = ''
    let last = 0
    for (const tag of tags) {
        out += text.slice(last, tag.start)
        last = tag.end
    }
    return out + text.slice(last)
}

/** Statement keywords force function-body mode; anything else is an expression. */
const JS_BODY_PATTERN = /\b(?:return|throw|let|const|var|if|for|while|switch|try)\b/

/**
 * Evaluate every js tag and substitute its result.  A source containing
 * statement keywords runs as a function body (explicit `return` needed);
 * otherwise it is wrapped as an expression.  Failures are collected — the
 * caller aborts execution so no unresolved tag ever reaches the terminal.
 */
export function resolveJsTemplates (text: string, context: JsContext): JsResolveResult {
    const tags = scanJsTags(text)
    if (!tags.length) {
        return { text, errors: [] }
    }
    const errors: string[] = []
    let out = ''
    let last = 0
    for (const tag of tags) {
        out += text.slice(last, tag.start)
        try {
            const wrapped = JS_BODY_PATTERN.test(tag.source)
                ? `(function(){ ${tag.source}\n })()`
                : `(function(){ return (${tag.source}\n) })()`
            const script = new vm.Script(wrapped)
            const sandbox = vm.createContext({
                params: context.params,
                clipboardText: context.clipboardText,
                now: context.now,
                os: context.os,
                session: context.session,
                files: context.files,
                // Silent console: snippets may log while computing.
                console: {
                    log: () => undefined, info: () => undefined,
                    warn: () => undefined, error: () => undefined,
                },
            })
            out += stringifyResult(script.runInContext(sandbox, { timeout: JS_EXECUTION_TIMEOUT_MS }))
        } catch (error) {
            errors.push(`JS 片段执行失败：${(error as Error).message}`)
        }
        last = tag.end
    }
    out += text.slice(last)
    return { text: out, errors }
}

function stringifyResult (value: unknown): string {
    if (value === undefined || value === null) {
        return ''
    }
    if (typeof value === 'string') {
        return value
    }
    try {
        return JSON.stringify(value) ?? ''
    } catch {
        return String(value)
    }
}

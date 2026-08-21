/**
 * CCI → QBT fill assist (own browser).
 * Load on a timesheet page while already logged in, or on qbt-mock-timesheet.html.
 * Does NOT log in, does NOT click Save/Submit/Approve.
 */
(function (global) {
  const START = '=== CCI_QBT_FILL_V1 ==='
  const END = '=== END_CCI_QBT_FILL ==='

  function parseClipboard(text) {
    const a = text.indexOf(START)
    const b = text.indexOf(END)
    if (a < 0 || b < 0 || b <= a) return null
    try {
      const data = JSON.parse(text.slice(a + START.length, b).trim())
      if (!data || data.v !== 1 || !Array.isArray(data.jobs)) return null
      return data
    } catch {
      return null
    }
  }

  function toast(msg) {
    const t = document.createElement('div')
    t.textContent = msg
    Object.assign(t.style, {
      position: 'fixed',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 2147483647,
      background: '#102a36',
      color: '#fff',
      padding: '10px 14px',
      borderRadius: '8px',
      font: '14px/1.3 system-ui,sans-serif',
      maxWidth: '90vw',
    })
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 2400)
  }

  function setFieldValue(el, value) {
    if (!el || value == null) return false
    const v = String(value)
    el.focus()
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    if (desc && desc.set) desc.set.call(el, v)
    else el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
    return true
  }

  function labelTextFor(el) {
    if (el.id) {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (byFor) return (byFor.textContent || '').trim()
    }
    const wrap = el.closest('label')
    if (wrap) return (wrap.textContent || '').trim()
    const prev = el.previousElementSibling
    if (prev && /^LABEL|SPAN|DIV|P|TD|TH$/.test(prev.tagName)) {
      return (prev.textContent || '').trim()
    }
    const row = el.closest('tr, .form-group, .field, [class*="Field"], [class*="row"]')
    if (row) {
      const lab = row.querySelector('label, .label, [class*="label"]')
      if (lab) return (lab.textContent || '').trim()
    }
    return (el.getAttribute('aria-label') || el.name || el.placeholder || '').trim()
  }

  function editableFields(root) {
    return Array.from(
      root.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable="true"]'),
    ).filter((el) => !el.disabled && !el.readOnly)
  }

  function scoreField(el, kinds) {
    const blob = `${labelTextFor(el)} ${el.name || ''} ${el.id || ''} ${el.placeholder || ''}`.toLowerCase()
    let score = 0
    for (const k of kinds) {
      if (blob.includes(k)) score += 2
    }
    if (kinds.includes('start') && (el.type === 'time' || /start|in\b|clock.?in/.test(blob))) score += 1
    if (kinds.includes('end') && (el.type === 'time' || /end|out\b|stop|clock.?out/.test(blob))) score += 1
    if (kinds.includes('notes') && el.tagName === 'TEXTAREA') score += 2
    return score
  }

  function pickField(root, kinds) {
    let best = null
    let bestScore = 0
    for (const el of editableFields(root)) {
      const s = scoreField(el, kinds)
      if (s > bestScore) {
        bestScore = s
        best = el
      }
    }
    return bestScore > 0 ? best : null
  }

  /**
   * Auto-fill visible Add Time / timesheet fields for one job.
   * Never clicks Save / Submit / Approve.
   */
  function autoFillJob(job, root = document) {
    const filled = []
    const notes = pickField(root, ['notes', 'note', 'comment', 'description'])
    if (notes && job.notes && setFieldValue(notes, job.notes)) filled.push('notes')

    const punch = (job.punches && job.punches[0]) || null
    if (punch) {
      const start = pickField(root, ['start', 'clock in', 'time in', 'in time'])
      const end = pickField(root, ['end', 'stop', 'clock out', 'time out', 'out time'])
      const startVal = punch.startHhmm || punch.startDisplay
      const endVal = punch.stopHhmm || (punch.running ? '' : punch.stopDisplay)
      if (start && startVal && setFieldValue(start, startVal)) filled.push('start')
      if (end && endVal && setFieldValue(end, endVal)) filled.push('end')
    }

    const jobField = pickField(root, ['job', 'customer', 'jobcode', 'job code', 'project'])
    if (jobField && job.jobOrSr && setFieldValue(jobField, job.jobOrSr)) filled.push('job')

    return filled
  }

  async function copyText(value) {
    const v = String(value ?? '')
    try {
      await navigator.clipboard.writeText(v)
    } catch {
      /* ignore */
    }
    const el = document.activeElement
    if (
      el &&
      (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
      !el.disabled &&
      !el.readOnly
    ) {
      setFieldValue(el, v)
      toast('Pasted into focused field')
      return
    }
    toast('Copied — tap a QBT field, then paste')
  }

  function showPanel(payload) {
    const old = document.getElementById('cci-qbt-fill-panel')
    if (old) old.remove()

    const panel = document.createElement('div')
    panel.id = 'cci-qbt-fill-panel'
    Object.assign(panel.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      zIndex: 2147483646,
      width: 'min(380px, 92vw)',
      maxHeight: '85vh',
      overflow: 'auto',
      background: '#f7f4ef',
      color: '#102a36',
      border: '1px solid #c5b8a4',
      borderRadius: '12px',
      boxShadow: '0 8px 28px rgba(16,42,54,.25)',
      font: '13px/1.35 system-ui,sans-serif',
      padding: '12px',
    })

    const head = document.createElement('div')
    head.innerHTML =
      '<strong>CCI → QBT fill</strong><div style="opacity:.75;margin-top:4px">Auto-fills matching fields. Never submits.</div>'
    panel.appendChild(head)

    const meta = document.createElement('p')
    meta.textContent = `${payload.dayLabel} · ${payload.jobs.length} job(s)`
    meta.style.margin = '8px 0'
    panel.appendChild(meta)

    payload.jobs.forEach((job, ji) => {
      const box = document.createElement('div')
      box.style.cssText =
        'margin:10px 0;padding:8px;border:1px solid #d6cbb8;border-radius:8px;background:#fff;'
      const title = document.createElement('div')
      title.style.fontWeight = '600'
      title.textContent = `${job.kindLabel || ''} ${job.title || job.jobOrSr || 'Job ' + (ji + 1)}`
      box.appendChild(title)

      const auto = document.createElement('button')
      auto.type = 'button'
      auto.textContent = 'Auto-fill this job on page'
      Object.assign(auto.style, {
        display: 'block',
        width: '100%',
        marginTop: '8px',
        padding: '10px',
        borderRadius: '8px',
        border: 'none',
        background: '#0b3d2e',
        color: '#fff',
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: '600',
      })
      auto.addEventListener('click', () => {
        const filled = autoFillJob(job)
        if (filled.length === 0) {
          toast('No matching fields found — use tap-to-copy below')
        } else {
          toast('Filled: ' + filled.join(', ') + ' — you submit')
        }
      })
      box.appendChild(auto)

      function addBtn(label, value) {
        if (value == null || String(value).trim() === '') return
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = label
        b.title = String(value)
        Object.assign(b.style, {
          display: 'block',
          width: '100%',
          textAlign: 'left',
          marginTop: '6px',
          padding: '8px 10px',
          borderRadius: '6px',
          border: '1px solid #b7c4cc',
          background: '#eef3f6',
          color: '#102a36',
          cursor: 'pointer',
          font: 'inherit',
        })
        b.addEventListener('click', () => copyText(value))
        box.appendChild(b)
      }

      addBtn(job.kind === 'project' ? 'Job# · ' + job.jobOrSr : 'SR# · ' + job.jobOrSr, job.jobOrSr)
      addBtn('Site · ' + job.site, job.site)
      addBtn('Contact · ' + job.contact, job.contact)
      addBtn('PO · ' + job.po, job.po)
      ;(job.punches || []).forEach((p, pi) => {
        const n = job.punches.length > 1 ? ' ' + (pi + 1) : ''
        addBtn('Start' + n + ' · ' + (p.startDisplay || p.startHhmm), p.startHhmm || p.startDisplay)
        addBtn('Stop' + n + ' · ' + (p.stopDisplay || p.stopHhmm), p.stopHhmm || p.stopDisplay)
      })
      addBtn('Travel · ' + job.travel, job.travel)
      addBtn('Mileage · ' + job.mileage, job.mileage)
      addBtn('Notes (full)', job.notes)
      panel.appendChild(box)
    })

    if (payload.jobs.length === 1) {
      const once = document.createElement('button')
      once.type = 'button'
      once.textContent = 'Auto-fill now'
      Object.assign(once.style, {
        marginTop: '4px',
        width: '100%',
        padding: '12px',
        borderRadius: '8px',
        border: 'none',
        background: '#102a36',
        color: '#fff',
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: '600',
      })
      once.addEventListener('click', () => {
        const filled = autoFillJob(payload.jobs[0])
        toast(filled.length ? 'Filled: ' + filled.join(', ') : 'No matching fields — use buttons')
      })
      panel.insertBefore(once, panel.children[2] || null)
      // Auto-run once for single-job packets (servant mode)
      setTimeout(() => {
        const filled = autoFillJob(payload.jobs[0])
        if (filled.length) toast('Auto-filled: ' + filled.join(', ') + ' — you submit')
      }, 50)
    }

    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = 'Close'
    Object.assign(close.style, {
      marginTop: '8px',
      width: '100%',
      padding: '10px',
      borderRadius: '8px',
      border: 'none',
      background: '#5a6a72',
      color: '#fff',
      cursor: 'pointer',
      font: 'inherit',
    })
    close.addEventListener('click', () => panel.remove())
    panel.appendChild(close)

    document.body.appendChild(panel)
  }

  async function runFromClipboard(textOverride) {
    let text = textOverride || ''
    if (!text) {
      try {
        text = await navigator.clipboard.readText()
      } catch {
        text =
          window.prompt(
            'Paste the CCI_QBT_FILL clipboard text here (Copy for timesheet fill in Work Reporter):',
            '',
          ) || ''
      }
    }
    const payload = parseClipboard(text)
    if (!payload) {
      alert(
        'No CCI_QBT_FILL_V1 block found. In Work Reporter tap “Copy for timesheet fill”, then run this again.',
      )
      return null
    }
    showPanel(payload)
    return payload
  }

  const api = {
    parseClipboard,
    autoFillJob,
    showPanel,
    runFromClipboard,
    START,
    END,
  }
  global.cciQbtFillAssist = api
})(typeof window !== 'undefined' ? window : globalThis)

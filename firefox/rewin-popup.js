/*-*- js-indent-level: 2 -*-*/
// Copyright 2025 by zrajm. Licenses: CC BY-SA (text), GPLv2 (code).

// Load data.
const storage = await browser.storage.local.get()
const tabs = Object.entries(storage)
  .filter(([rewinTabId]) => rewinTabId[0] === 't')

// Save/load data from storage.local.
function saveRec(rewinId, data) {
  return browser.storage.local.set({ [rewinId]: data })
}
function loadRec(rewinId) {
  return browser.storage.local.get(rewinId).then(({ [rewinId]: data }) => data)
}

function search(str, func) {
  const regex = RegExp(RegExp.escape(escapeHtml(str)).replace(/[ ]+/g, '.*?'), 'ig')
  return tabs.flatMap(([rewinTabId, [tabMeta, ...rewinHistEntries]]) => {
    return rewinHistEntries
      .map(([url, title, rewinFavId, epoch]) =>
        [url, escapeHtml(title), storage[rewinFavId], epoch])
      .filter(([url, title]) => regex.test(title))
      .map(([url, title, favicon, epoch]) =>
        func(regex, rewinTabId, url, title, favicon, epoch))
  })
}

// Given a rewinTabId find the corresponding browser tabId.
// (Returns undefined if tab isn't open in the browser.)
function getBrowserTabId(targetRewinTabId) {
  return browser.tabs.query({}).then(tabs =>
    // Return 1st resolved promise from array (there will be only one).
    Promise.any(tabs.map(({ id: tabId, windowId }) =>
      browser.sessions.getTabValue(tabId, 'rewinId').then(rewinTabId => {
        // Throw for each value that we don't care about.
        if (rewinTabId !== targetRewinTabId) { throw '' }
        return [tabId, windowId]
      }))
    ).catch(console.error))
}

function escapeHtml(text) {
  return text.replace(/["&<>]/g, a => (
    { '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[a]
  ))
}

/*****************************************************************************/

const q   = document.querySelector('#q')
const out = document.querySelector('#out')

// Restore search query when opening popup.
loadRec('q').then(query => {
  q.value = query ?? ''
  q.dispatchEvent(new Event('input'))
  q.focus({ preventScroll: true })
})
// Perform a search whenever input changes.
q.oninput = () => {
  const query = q.value; saveRec('q', query)
  out.innerHTML = !query ? ''
    : search(query, (regex, rewinTabId, url, title, favicon, epoch) => {
      return `<a title="${url}" href="rewinTabId:${rewinTabId}">`
        + `<img src="data:image/png;base64,${favicon}">`
        + `${title.replace(regex, '<mark>$&</mark>').replace(/ /g, ' ')}`
        +`</a>`
    }).join('\n')
}
// Go to browser tab when clicking search result.
document.body.onclick = evt => {
  const { target } = evt
  const [type, rewinTabId] = target.getAttribute('href').split(':')
  if (target.tagName !== 'A' || type !== 'rewinTabId') { return }
  evt.preventDefault()
  getBrowserTabId(rewinTabId).then(([tabId, windowId]) => {
    return Promise.all([
      browser.tabs   .update(+tabId,    { active: true }).catch(console.error),
      browser.windows.update(+windowId, { focused: true, state: 'normal' })
        .catch(() => {}),
    ])
  }).then(() => close())  // close Rewin popup
}

//[eof]

/*-*- js-indent-level: 2 -*-*/
// Copyright 2025 by zrajm. Licenses: CC BY-SA (text), GPLv2 (code).

// Load data.
const storage = await browser.storage.local.get()
const tabs = Object.entries(storage)
  .filter(([rewinTabId]) => rewinTabId[0] === 't')

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

function escapeHtml(text) {
  'use strict'
  return text.replace(/["&<>]/g, a => (
    { '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[a]
  ))
}

/*****************************************************************************/

const q   = document.querySelector('#q')
const out = document.querySelector('#out')

q.oninput = () => {
  out.innerHTML = search(q.value, (regex, rewinTabId, url, title, favicon, epoch) => {
    return `<a title="${url}" href="?tabId=${rewinTabId}">`
      + `<img src="data:image/png;base64,${favicon}">`
      + `${title.replace(regex, '<mark>$&</mark>').replace(/ /g, ' ')}`
      +`</a>`
  }).join('\n')
}
q.focus({ preventScroll: true })

//[eof]

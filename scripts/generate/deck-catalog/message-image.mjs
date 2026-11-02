const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** One flow-based copy group: absent fields produce neither boxes nor gaps. */
export function messageImageCopy(message, details = {}) {
  const field = (key, className) => typeof details[key] === 'string' && details[key].trim()
    ? `<p class="${className}" data-dd-element-id="cover-${key}">${escape(details[key].trim())}</p>` : '';
  const identity = ['organization', 'affiliation', 'name'].map(key => field(key, `dd-cover-${key}`)).join('');
  return `<div class="dd-message-image-copy"><div class="dd-cover-main">${field('section', 'dd-cover-section')}<h1 class="dd-message-image-title" data-dd-element-id="message">${escape(message).replace('、', '、<br>')}</h1>${field('subcopy', 'dd-cover-subcopy')}</div>${identity ? `<div class="dd-cover-identity">${identity}</div>` : ''}</div>`;
}

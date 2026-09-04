import React from 'react';

export function renderMentionedText(text) {
  return String(text || '').split(/(@[A-Za-z][A-Za-z0-9_-]*)/g).map((part, index) => (
    part.startsWith('@') ? <span className="feed-mention" key={`${part}-${index}`}>{part}</span> : part
  ));
}

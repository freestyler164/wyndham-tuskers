import React from 'react';
import { assetUrl } from '../api.js';

export function FeedMedia({ media, onClick }) {
  const image = media?.[0];
  if (!image?.url) return null;
  // The feed is a scroll surface with pull-to-refresh, so the slot has to hold
  // its height before the image loads or everything below it jumps.
  const ratio = image.width && image.height ? `${image.width} / ${image.height}` : '4 / 3';
  return (
    <button
      className="feed-media"
      type="button"
      onClick={onClick}
      style={{ aspectRatio: ratio, background: image.dominantColor || 'var(--line)' }}
    >
      <img src={assetUrl(image.url)} alt="" loading="lazy" />
    </button>
  );
}

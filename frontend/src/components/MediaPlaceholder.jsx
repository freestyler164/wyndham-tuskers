function MediaPlaceholder({ className = '', label, src, type = 'image' }) {
  const hasMedia = Boolean(src);

  return (
    <div className={`photo-placeholder ${className} ${hasMedia ? 'has-photo' : ''}`}>
      {hasMedia && type === 'video' ? (
        <video src={src} autoPlay muted loop playsInline />
      ) : hasMedia ? (
        <img src={src} alt="" />
      ) : null}
      <span>{label}</span>
    </div>
  );
}

export default MediaPlaceholder;

import SiteNav from '../components/SiteNav.jsx';

const galleryModules = import.meta.glob('../public/static/photos/gallery/*.{jpg,jpeg,png,webp,avif,gif,JPG,JPEG,PNG,WEBP,AVIF,GIF}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const galleryPhotos = Object.entries(galleryModules)
  .sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
  .map(([path, src]) => ({
    src,
    name: path.split('/').pop()?.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') || 'Gallery photo',
  }));

function Gallery() {
  return (
    <main className="page-shell gallery-page">
      <SiteNav />

      {galleryPhotos.length > 0 ? (
        <section className="gallery-photo-grid" aria-label="Gallery photos">
          {galleryPhotos.map((photo) => (
            <figure key={photo.src} className="gallery-photo">
              <img src={photo.src} alt={photo.name} loading="lazy" />
            </figure>
          ))}
        </section>
      ) : (
        <section className="empty-state gallery-empty">
          <p className="eyebrow">Gallery</p>
          <h1>No gallery photos yet</h1>
          <p>Add photos to frontend/src/public/static/photos/gallery and rebuild the frontend.</p>
        </section>
      )}
    </main>
  );
}

export default Gallery;

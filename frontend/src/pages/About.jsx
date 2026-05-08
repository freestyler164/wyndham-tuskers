import SiteNav from '../components/SiteNav.jsx';
import MediaPlaceholder from '../components/MediaPlaceholder.jsx';

const sports = [
  'Social Volleyball',
  'Badminton',
  'Table Tennis',
  'Basketball',
  'Carroms',
  'Cards Tournaments',
];

const sections = [
  {
    eyebrow: 'Community',
    title: 'A Club Built Around Community',
    body: [
      'What makes Wyndham Tuskers special is the incredible involvement of our members and their families in every activity we organize. Whether it is a sports tournament, cultural celebration, or a casual weekend gathering, everyone plays a part in creating memories and strengthening bonds.',
      'We believe that clubs are not only about competition. They are about creating lifelong friendships, meaningful relationships, and a sense of belonging.',
    ],
    photo: 'Community photo',
    src: '/static/photos/about/community-photo.jpg',
  },
  {
    eyebrow: 'TPL',
    title: 'TPL - Our Signature Cricket Carnival',
    body: [
      'One of the highlights of the Wyndham Tuskers calendar is the annual TPL (Tuskers Premier League), a social cricket tournament that brings excitement, energy, and entertainment to the entire community.',
      'From thrilling cricket matches and player auctions to music, celebrations, and social get-togethers, TPL is more than a tournament. It is a festival where families and friends come together to enjoy unforgettable moments.',
    ],
    photo: 'TPL photo',
    src: '/static/photos/home/tpl-carnival.mp4',
    type: 'video',
  },
  {
    eyebrow: 'Social',
    title: 'Keeping the Social Spark Alive',
    body: [
      'Beyond tournaments and events, we regularly organize fortnightly get-togethers featuring cards and carroms sessions, giving members a relaxed space to unwind, connect, and enjoy quality time together.',
      'These gatherings continue to strengthen the friendships and family bonds that make Wyndham Tuskers feel like home.',
    ],
    photo: 'Gathering photo',
    src: '/static/photos/about/community-photo-2.jpg',
  },
  {
    eyebrow: 'Culture',
    title: 'Celebrating Culture Together',
    body: [
      'Every year, Wyndham Tuskers proudly hosts our Onam celebrations, a truly special occasion that reflects the warmth and togetherness of our community.',
      'Unlike large-scale commercial events, our Onam function is celebrated as an extended family gathering, where members of all ages come together to showcase their talents, soft skills, performances, and creativity while enjoying wonderful moments with family and friends.',
      'It is these shared experiences that create lasting memories and make our community stronger every year.',
    ],
    photo: 'Onam photo',
    src: '/static/photos/home/onam-celebrations.MOV',
    type: 'video',
  },
];

function About() {
  return (
    <main className="page-shell about-page">
      <SiteNav />

      <section className="about-hero">
        <div>
          <span className="eyebrow">About us</span>
          <h1>Welcome to Wyndham Tuskers</h1>
          <p>
            At Wyndham Tuskers, we are more than just a sports club &mdash; we are a growing community built on friendship,
            togetherness, and family spirit. Based around the vibrant Wyndham region, our club continues to grow steadily
            each year, bringing together people from diverse backgrounds through sports, culture, and social connections.
          </p>
        </div>
        <MediaPlaceholder className="about-hero-photo" label="Club photo" src="/static/photos/about/club-photo.jpg" />
      </section>

      <section className="about-detail-grid">
        {sections.map((section, index) => (
          <article key={section.title} className={`about-detail ${index % 2 ? 'is-reversed' : ''}`}>
            <div className="about-detail-copy">
              <span className="eyebrow">{section.eyebrow}</span>
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <MediaPlaceholder label={section.photo} src={section.src} type={section.type} />
          </article>
        ))}
      </section>

      <section className="sports-detail">
        <div>
          <span className="eyebrow">Sports for everyone</span>
          <h2>Active, social and open to everyone.</h2>
          <p>
            Wyndham Tuskers proudly promotes active participation across multiple sports and recreational activities for
            both men and women members. Our yearly tournaments encourage healthy competition while maintaining the fun
            and social spirit that defines our club culture.
          </p>
        </div>
        <div className="sports-photo-stack">
          <MediaPlaceholder label="Sports day" src="/static/photos/about/sports-day-3.jpg" />
          <div className="activity-cloud">
            {sports.map((sport) => <span key={sport}>{sport}</span>)}
          </div>
        </div>
      </section>

      <section className="about-closing">
        <span className="eyebrow">More than a club</span>
        <h2>Friendships grow here.</h2>
        <p>
          Wyndham Tuskers is a place where friendships grow, families connect, and memories are created. We are proud of
          the culture we have built, one that welcomes everyone with warmth, respect, and togetherness.
        </p>
        <strong>Once a Tusker, Always a Family.</strong>
      </section>
    </main>
  );
}

export default About;

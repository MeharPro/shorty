import { Link } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';

const galleryImages = [
  'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/v1693330487/samples/landscapes/beach-boat.jpg',
  'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/v1693330488/samples/bike.jpg',
  'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/v1693330489/samples/food/spices.jpg',
  'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/v1693330489/samples/two-ladies.jpg',
  'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/v1693330490/samples/landscapes/girl-urban-view.jpg',
  'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/v1693330491/samples/animals/reindeer.jpg',
];

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link className="landing-brand" to="/">
          <span className="landing-brand__mark">
            <img alt="Shorty" src={boltLogo} />
          </span>
          <span className="landing-brand__copy">
            <strong>Shorty</strong>
            <span>Viral short-form engine</span>
          </span>
        </Link>

        <div className="landing-nav__actions">
          <Link className="btn btn--ghost" to="/login">
            Log in
          </Link>
          <Link className="btn btn--primary" to="/signup">
            Sign up
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <span className="landing-kicker">Turn long videos into high-performing content</span>
            <h1>Create scroll-stopping reels from one source video.</h1>
            <p>
              Shorty helps teams and creators turn long-form footage into ranked short-form
              videos, review past work, and move fast from upload to download.
            </p>

            <div className="landing-hero__actions">
              <Link className="btn btn--primary" to="/signup">
                Start free
              </Link>
              <Link className="btn btn--ghost" to="/app">
                View app
              </Link>
            </div>

            <div className="landing-metrics">
              <div>
                <strong>30–60s</strong>
                <span>ideal clip length</span>
              </div>
              <div>
                <strong>10x faster</strong>
                <span>from source to batch</span>
              </div>
              <div>
                <strong>Ranked</strong>
                <span>by virality score</span>
              </div>
            </div>
          </div>

          <div className="landing-hero__visual">
            <div className="landing-showcase landing-showcase--tall">
              <img alt="Short-form creative preview" src={galleryImages[0]} />
            </div>
            <div className="landing-showcase landing-showcase--card landing-showcase--floating">
              <img alt="Viral editing inspiration" src={galleryImages[1]} />
              <div className="landing-showcase__badge">Feature 1 live</div>
            </div>
            <div className="landing-showcase landing-showcase--card landing-showcase--small">
              <img alt="Content gallery" src={galleryImages[2]} />
            </div>
          </div>
        </section>

        <section className="landing-logo-strip">
          <span>Built for modern creator workflows</span>
          <div>
            <span>Upload</span>
            <span>Rank</span>
            <span>Download</span>
            <span>Repeat</span>
          </div>
        </section>

        <section className="landing-gallery">
          <div className="landing-section-heading">
            <span className="landing-kicker">Image-first, product-first</span>
            <h2>A premium front door, separate from the workspace.</h2>
            <p>
              The landing page sells the product. The app handles creation. They now live as two
              separate experiences.
            </p>
          </div>

          <div className="landing-gallery__grid">
            {galleryImages.map((image, index) => (
              <article className={`landing-gallery__card landing-gallery__card--${index + 1}`} key={image}>
                <img alt={`Shorty gallery ${index + 1}`} src={image} />
              </article>
            ))}
          </div>
        </section>

        <section className="landing-features">
          <article className="landing-feature-card">
            <span className="landing-kicker">Feature 1</span>
            <h3>Existing videos to reels</h3>
            <p>
              Upload footage or paste a Drive link, generate as many strong cuts as make sense,
              and rank each output by virality score.
            </p>
          </article>

          <article className="landing-feature-card landing-feature-card--accent">
            <span className="landing-kicker">Feature 2</span>
            <h3>Brain rot AI reels</h3>
            <p>
              Minecraft gameplay, AI voices, and trend topics combine into bulk brain rot video
              generation with ranking built in.
            </p>
          </article>

          <article className="landing-feature-card">
            <span className="landing-kicker">Base requirements</span>
            <h3>Login, past work, upload, download</h3>
            <p>
              Every workflow is built around authentication, saved work, content uploads, and
              clean output downloads.
            </p>
          </article>
        </section>

        <section className="landing-cta">
          <div>
            <span className="landing-kicker">Ready to ship clips faster?</span>
            <h2>Open the app and start generating short-form batches.</h2>
          </div>
          <div className="landing-nav__actions">
            <Link className="btn btn--ghost" to="/login">
              Log in
            </Link>
            <Link className="btn btn--primary" to="/signup">
              Create account
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
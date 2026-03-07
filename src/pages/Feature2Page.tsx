import { Link, Navigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import type { ShortySession } from '../lib/session';

interface Feature2PageProps {
    session: ShortySession | null;
}

export function Feature2Page({ session }: Feature2PageProps) {
    if (!session) {
        return <Navigate replace to="/login" />;
    }

    return (
        <div className="feature-page">
            {/* Nav */}
            <nav className="feature-page__nav">
                <Link className="feature-page__back" to="/">
                    ← Dashboard
                </Link>
                <Link className="dashboard__brand" to="/">
                    <span className="dashboard__brand-mark">
                        <img alt="Shorty" src={boltLogo} />
                    </span>
                    <span className="dashboard__brand-name">Shorty</span>
                </Link>
            </nav>

            {/* Header */}
            <div className="feature-page__header">
                <div className="feature-page__kicker">Feature 2</div>
                <h1 className="feature-page__title">Brain Rot AI Reels</h1>
                <p className="feature-page__desc">
                    Minecraft gameplay, ElevenLabs voice cloning, and trending topics —
                    pump out 10–50 brain rot videos ranked by engagement.
                </p>
            </div>

            {/* Coming Soon */}
            <div className="coming-soon">
                <div className="coming-soon__icon">🧠</div>
                <div className="coming-soon__badge">Coming Soon</div>
                <h2>This feature is under construction</h2>
                <p>
                    We're building the brain rot pipeline — choose your topic, pick an AI voice,
                    and let us generate bulk viral content over Minecraft gameplay.
                </p>

                <div className="coming-soon__specs">
                    <div className="coming-soon__spec">
                        <span>Length</span>
                        <strong>30–60 seconds</strong>
                    </div>
                    <div className="coming-soon__spec">
                        <span>Inputs</span>
                        <strong>Topic + Voice</strong>
                    </div>
                    <div className="coming-soon__spec">
                        <span>Volume</span>
                        <strong>10–50 videos</strong>
                    </div>
                    <div className="coming-soon__spec">
                        <span>Ranking</span>
                        <strong>Brain Rot Score</strong>
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import { ReelGeneratorPanel } from '../components/ReelGeneratorPanel';
import {
    UploadWidget,
    type CloudinaryUploadResult,
} from '../cloudinary/UploadWidget';
import { SAMPLE_PRIMARY_ASSET } from '../data/presets';
import { buildPlayableSourceUrl, createMediaAssetFromUpload } from '../lib/rendering';
import type { ShortySession } from '../lib/session';
import type { MediaAsset } from '../types';

interface Feature1PageProps {
    session: ShortySession | null;
}

export function Feature1Page({ session }: Feature1PageProps) {
    const [sourceAsset, setSourceAsset] = useState<MediaAsset>(SAMPLE_PRIMARY_ASSET);
    const [statusMessage, setStatusMessage] = useState('');

    if (!session) {
        return <Navigate replace to="/login" />;
    }

    const sourcePreviewUrl = buildPlayableSourceUrl(sourceAsset);

    const handleSourceUploadSuccess = (result: CloudinaryUploadResult) => {
        setSourceAsset(createMediaAssetFromUpload(result, 'Uploaded Source Video'));
        setStatusMessage('Source video uploaded successfully.');
    };

    const handleSourceUploadError = (error: Error) => {
        setStatusMessage(error.message || 'Upload failed.');
    };

    const handleUseSample = () => {
        setSourceAsset(SAMPLE_PRIMARY_ASSET);
        setStatusMessage('Using the built-in sample video.');
    };

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
                <div className="feature-page__kicker">Feature 1</div>
                <h1 className="feature-page__title">Turn Videos into Reels</h1>
                <p className="feature-page__desc">
                    Upload a long-form video, get AI-generated 30–60 second clips ranked by virality.
                    Download the winners and ship them.
                </p>
            </div>

            {/* Source Video Section */}
            <section className="source-section">
                <div className="source-section__card">
                    <div className="source-section__label">Source Video</div>

                    <div className="source-section__video-wrap">
                        <video
                            autoPlay
                            controls
                            loop
                            muted
                            playsInline
                            src={sourcePreviewUrl}
                        />
                    </div>

                    <div className="source-section__meta">
                        <span>{sourceAsset.label}</span>
                        <span>·</span>
                        <span>{sourceAsset.source}</span>
                    </div>

                    <div className="source-section__actions">
                        <UploadWidget
                            buttonText="Upload video"
                            clientAllowedFormats={['mp4', 'mov', 'm4v', 'webm']}
                            onUploadError={handleSourceUploadError}
                            onUploadSuccess={handleSourceUploadSuccess}
                            resourceType="video"
                        />
                        <button className="btn btn--ghost" type="button" onClick={handleUseSample}>
                            Use sample
                        </button>
                    </div>
                </div>
            </section>

            {statusMessage ? <div className="inline-banner">{statusMessage}</div> : null}

            {/* Reel Generator */}
            <ReelGeneratorPanel
                remoteUserId={session.userId}
                sourceAsset={sourceAsset}
                userKey={session.email}
            />
        </div>
    );
}

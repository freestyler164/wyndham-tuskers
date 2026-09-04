import React, { useState } from 'react';
import Cropper from 'react-easy-crop';
import { ActionModal } from '../shared/ui.jsx';

const PRESETS = [
  { id: 'square', label: '1:1', value: 1 },
  { id: 'portrait', label: '4:5', value: 4 / 5 },
  { id: 'wide', label: '16:9', value: 16 / 9 },
  { id: 'free', label: 'Free', value: null },
];

export function PhotoCropper({ dataUrl, busy, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [preset, setPreset] = useState(PRESETS[0]);
  const [area, setArea] = useState(null);

  return (
    <ActionModal title="Crop photo" onClose={onCancel}>
      {/* ActionModal adds no padding of its own and treats `title` as an
          aria-label, so the body supplies both. */}
      <div className="expense-form photo-cropper">
        <div className="section-heading"><h2>Crop photo</h2></div>
        <div className="photo-cropper-stage">
          <Cropper
            image={dataUrl}
            crop={crop}
            zoom={zoom}
            aspect={preset.value ?? undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
            restrictPosition={Boolean(preset.value)}
          />
        </div>
        <div className="photo-cropper-presets">
          {PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === preset.id ? 'is-active' : ''}
              onClick={() => setPreset(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="photo-cropper-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <div className="button-pair">
          <button className="primary-button" type="button" disabled={!area || busy} onClick={() => onConfirm(area)}>
            {busy ? 'Uploading...' : 'Use photo'}
          </button>
          <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </ActionModal>
  );
}

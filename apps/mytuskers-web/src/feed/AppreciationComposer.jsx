import React, { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api, assetUrl } from '../api.js';
import { UserAvatar } from '../shared/ui.jsx';
import { cropImageToBlob, prepareImageUpload, readFileAsDataUrl } from '../shared/image.js';
import { PhotoCropper } from './PhotoCropper.jsx';

const SOURCE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function AppreciationCreateForm({
  activeTeamId,
  members,
  currentUserId,
  initialValues = {},
  submitLabel = 'Post',
  onCancel,
  onCreated,
}) {
  const recipients = members.filter((member) => member.status === 'ACTIVE' && member.userId !== currentUserId);
  const fallbackRecipients = recipients.length ? recipients : members.filter((member) => member.status === 'ACTIVE');
  const [recipientUserId, setRecipientUserId] = useState(initialValues.recipientUserId || '');
  const [shortDescription, setShortDescription] = useState(initialValues.shortDescription || '');
  const [longDescription, setLongDescription] = useState(initialValues.longDescription || '');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sourceDataUrl, setSourceDataUrl] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [media, setMedia] = useState(null);
  const fileInputRef = useRef(null);

  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (!SOURCE_TYPES.includes(file.type)) {
      setError('Photo must be JPEG, PNG, or WebP.');
      return;
    }
    try {
      setSourceType(file.type);
      setSourceDataUrl(await readFileAsDataUrl(file));
    } catch (err) {
      setError(err.message);
    }
  };

  // Upload on crop confirm rather than on Post, so the post request stays small
  // and submitting feels instant even when the photo is still large.
  const confirmCrop = async (area) => {
    setUploading(true);
    setError('');
    try {
      const cropped = await cropImageToBlob(sourceDataUrl, area, sourceType);
      const prepared = await prepareImageUpload(cropped, {
        maxDimension: 1440,
        maxOutputBytes: 1.5 * 1024 * 1024,
        label: 'Photo',
      });
      const response = await api(`/v1/teams/${activeTeamId}/appreciation/media`, {
        method: 'POST',
        body: JSON.stringify(prepared),
      });
      setMedia(response.media);
      setSourceDataUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const updateLongDescription = (value) => {
    setLongDescription(value);
    const match = value.match(/(^|\s)@([a-zA-Z]*)$/);
    setMentionQuery(match?.[2]?.toLowerCase() || '');
    setMentionOpen(Boolean(match));
  };

  const mentionMatches = fallbackRecipients
    .filter((member) => {
      const name = member.user?.preferredName || member.user?.displayName || member.userId;
      return name.toLowerCase().includes(mentionQuery);
    })
    .slice(0, 5);

  const insertMention = (member) => {
    const name = member.user?.preferredName || member.user?.displayName || member.userId;
    setLongDescription((current) => current.replace(/(^|\s)@([a-zA-Z]*)$/, `$1@${name} `));
    setRecipientUserId(member.userId);
    setMentionOpen(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!shortDescription.trim()) {
      setError('Add a short description.');
      return;
    }
    setSaving(true);
    try {
      await api(`/v1/teams/${activeTeamId}/appreciation`, {
        method: 'POST',
        body: JSON.stringify({
          recipientUserId,
          shortDescription,
          longDescription,
          media: media ? [media] : [],
        }),
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expense-form appreciation-composer" onSubmit={submit}>
      <label htmlFor="appreciation-short">
        <span>Short description</span>
        <input id="appreciation-short" value={shortDescription} onChange={(event) => setShortDescription(event.target.value)} maxLength={90} placeholder="e.g. Brilliant energy in the field" />
      </label>
      <div className="mention-field">
        <label htmlFor="appreciation-long">
          <span>Long description optional</span>
          <textarea
            id="appreciation-long"
            value={longDescription}
            onChange={(event) => updateLongDescription(event.target.value)}
            maxLength={1200}
            placeholder="Type @ to mention a teammate."
          />
        </label>
        {mentionOpen && mentionMatches.length > 0 && (
          <div className="mention-menu">
            {mentionMatches.map((member) => (
              <button key={member.userId} type="button" onClick={() => insertMention(member)}>
                <UserAvatar className="small" initials={member.user?.initials || 'MT'} photoUrl={member.user?.photoUrl || ''} />
                <strong>{member.user?.preferredName || member.user?.displayName || member.userId}</strong>
              </button>
            ))}
          </div>
        )}
      </div>
      {media ? (
        <div className="composer-media">
          <img src={assetUrl(media.url)} alt="Selected" />
          <button type="button" onClick={() => setMedia(null)} aria-label="Remove photo">
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      ) : (
        <button className="composer-add-photo" type="button" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus aria-hidden="true" size={18} />
          <span>Add photo</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose a photo"
        onChange={pickFile}
      />
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary-button" type="submit" disabled={saving || uploading}>{saving ? 'Posting...' : submitLabel}</button>
        <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
      {sourceDataUrl && (
        <PhotoCropper
          dataUrl={sourceDataUrl}
          busy={uploading}
          onCancel={() => setSourceDataUrl('')}
          onConfirm={confirmCrop}
        />
      )}
    </form>
  );
}

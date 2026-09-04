import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Award, Bell, CalendarDays, CalendarPlus, CheckCircle2, CircleHelp, ClipboardCheck, Copy, Edit3, Eye, EyeOff, Heart, Home as HomeIcon, LogOut, MessageCircle, MoreHorizontal, PlusCircle, ReceiptText, Settings, Share2, ShieldCheck, Smartphone, UserRound, WalletCards, XCircle } from 'lucide-react';
import { api, assetUrl, formatDate, matchResultLabel, matchResultOptions, matchResultTone, money, statusLabel } from './api.js';
import { SessionProvider, useSession } from './shared/session.jsx';
import { canvasToBlob, prepareImageUpload } from './shared/image.js';
import {
  ActionModal,
  ActionRow,
  BackHeader,
  LoadingBlock,
  MetricCard,
  ScreenShell,
  SectionHeading,
  SkeletonCards,
  ToolPanel,
  UserAvatar,
} from './shared/ui.jsx';
import { FeedScreen } from './feed/FeedScreen.jsx';
import { FeedComposeScreen } from './feed/FeedComposeScreen.jsx';
import { FeedPostDetail } from './feed/FeedPostDetail.jsx';
import { CaptainAvailabilityList } from './matches/CaptainAvailabilityList.jsx';
import './styles.css';

const localId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const isTeamOperatorRole = (role) => ['CAPTAIN', 'TEAM_ADMIN', 'GLOBAL_ADMIN'].includes(role);

const joinUrl = (token) => {
  if (typeof window === 'undefined') return `/join/${token}`;
  return `${window.location.origin}/join/${token}`;
};

const matchUrl = (teamId, matchId) => {
  const path = `/matches/${matchId}?teamId=${encodeURIComponent(teamId)}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
};

const matchFixtureLabel = (match) => (
  match.opponent.startsWith('Training') ? match.opponent : `vs ${match.opponent}`
);

/** Prefills the feed composer after a captain saves a result or MOTM. */
const buildMatchFeedDraft = (match, award) => {
  const fixture = matchFixtureLabel(match);
  const resultText = match.result ? (matchResultLabel[match.result] || match.result) : '';
  let shortDescription = resultText ? `${resultText} ${fixture}` : fixture;
  if (shortDescription.length > 90) shortDescription = `${shortDescription.slice(0, 87).trim()}...`;

  const parts = [];
  if (match.resultSummary) parts.push(match.resultSummary);
  if (award?.recipientDisplayName) {
    const mention = award.recipientUserId ? `@${award.recipientDisplayName}` : award.recipientDisplayName;
    parts.push(award.reason
      ? `Captain's Man of the Match: ${mention} — ${award.reason}`
      : `Captain's Man of the Match: ${mention}`);
  }
  return {
    shortDescription,
    longDescription: parts.join('\n\n').slice(0, 1200),
    recipientUserId: award?.recipientUserId || '',
  };
};

const icsDate = (dateText) => new Date(dateText).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const calendarSummary = (match, teamName) => (
  match.opponent.startsWith('Training') ? match.opponent : `${teamName} vs ${match.opponent}`
);

const calendarEndAt = (match) => (
  match.endAt || new Date(new Date(match.startAt).getTime() + 3 * 60 * 60 * 1000).toISOString()
);

const safeIcsText = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

const downloadCalendarFile = (match, teamName, returnUrl) => {
  const endAt = calendarEndAt(match);
  const summary = calendarSummary(match, teamName);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyTuskers//EN',
    'BEGIN:VEVENT',
    `UID:${match.matchId}@mytuskers`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(match.startAt)}`,
    `DTEND:${icsDate(endAt)}`,
    `SUMMARY:${safeIcsText(summary)}`,
    `LOCATION:${safeIcsText(match.venueName || '')}`,
    `DESCRIPTION:${safeIcsText(match.notes || 'MyTuskers match')}`,
    returnUrl ? `URL:${safeIcsText(returnUrl)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mytuskers-match'}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const isAndroidDevice = () => (
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
);

const googleCalendarUrl = (match, teamName, returnUrl) => {
  const endAt = calendarEndAt(match);
  const summary = calendarSummary(match, teamName);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: `${icsDate(match.startAt)}/${icsDate(endAt)}`,
    details: [match.notes || 'MyTuskers match', returnUrl ? `MyTuskers: ${returnUrl}` : ''].filter(Boolean).join('\n\n'),
    location: match.venueName || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const openExternalCalendarUrl = (url) => {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
};

const addMatchToCalendar = (match, teamName, returnUrl) => {
  if (isAndroidDevice()) {
    openExternalCalendarUrl(googleCalendarUrl(match, teamName, returnUrl));
    return;
  }
  downloadCalendarFile(match, teamName, returnUrl);
};

const wrapCanvasText = (context, text, x, y, maxWidth, lineHeight, maxLines = 3) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width <= maxWidth || !line) {
      line = testLine;
    } else {
      lines.push(line);
      line = word;
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((lineText, index) => context.fillText(lineText, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
};

const drawRoundedRect = (context, x, y, width, height, radius) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
};

const createModernLineupShareBlob = async (detail, teamName) => {
  const players = detail.lineup?.startingPlayers || [];
  const width = 1080;
  const rowHeight = 92;
  const rows = Math.max(1, Math.ceil(players.length / 2));
  const height = Math.max(1180, 700 + rows * rowHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot create the lineup image.');

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#15110e');
  background.addColorStop(0.55, '#100d0b');
  background.addColorStop(1, '#0b0908');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const warmGlow = context.createRadialGradient(width * 0.15, 70, 0, width * 0.15, 70, 520);
  warmGlow.addColorStop(0, 'rgba(242, 140, 15, 0.16)');
  warmGlow.addColorStop(1, 'rgba(242, 140, 15, 0)');
  context.fillStyle = warmGlow;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(242, 140, 15, 0.62)';
  context.lineWidth = 3;
  drawRoundedRect(context, 8, 8, width - 16, height - 16, 30);
  context.stroke();

  context.save();
  context.globalAlpha = 0.2;
  context.strokeStyle = '#f28c0f';
  context.lineWidth = 34;
  context.beginPath();
  context.arc(width - 148, 142, 150, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  try {
    const logo = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = '/wt_logo.png';
    });
    context.fillStyle = '#070605';
    drawRoundedRect(context, 64, 64, 134, 134, 4);
    context.fill();
    context.drawImage(logo, 82, 82, 98, 98);
  } catch {
    context.fillStyle = '#070605';
    drawRoundedRect(context, 64, 64, 134, 134, 4);
    context.fill();
  }

  context.fillStyle = '#f28c0f';
  context.font = '900 24px system-ui, -apple-system, Segoe UI, sans-serif';
  context.fillText('MATCH DAY LINEUP', 220, 144);

  context.fillStyle = '#ffffff';
  context.font = '900 62px system-ui, -apple-system, Segoe UI, sans-serif';
  const titleBottom = wrapCanvasText(context, teamName, 64, 270, width - 128, 68, 2);

  context.fillStyle = '#d6b58d';
  context.font = '800 28px system-ui, -apple-system, Segoe UI, sans-serif';
  const opponent = detail.match.opponent.startsWith('Training') ? 'Training session' : `vs ${detail.match.opponent}`;
  context.fillText(opponent, 64, titleBottom + 30);

  // Second line under title: venue
  const venueY = titleBottom + 78;
  context.fillStyle = '#f0e6d8';
  context.font = '700 28px system-ui, -apple-system, Segoe UI, sans-serif';
  context.fillText(detail.match.venueName || '', 64, venueY);

  // Third line: published status (smaller)
  const publishedY = venueY + 42;
  context.fillStyle = '#52d273';
  context.beginPath();
  context.arc(72, publishedY - 7, 7, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#52d273';
  context.font = '800 20px system-ui, -apple-system, Segoe UI, sans-serif';
  const publishedLabel = 'Published';
  context.fillText(publishedLabel, 88, publishedY);
  const publishedWidth = context.measureText(publishedLabel).width;
  context.fillStyle = '#d8c7b2';
  context.font = '700 20px system-ui, -apple-system, Segoe UI, sans-serif';
  context.fillText(`· ${formatDate(detail.match.startAt, { time: true })}`, 88 + publishedWidth + 10, publishedY);

  const listTop = publishedY + 88;
  context.fillStyle = '#f28c0f';
  context.font = '900 23px system-ui, -apple-system, Segoe UI, sans-serif';
  context.fillText('TEAM FOR THE DAY', 64, listTop);

  const gridTop = listTop + 36;
  const colGap = 18;
  const rowLeft = 64;
  const colWidth = (width - 128 - colGap) / 2;
  const numberSize = 44;
  const fitNameFont = (text, maxWidth) => {
    let size = 26;
    while (size > 18) {
      context.font = `900 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
      if (context.measureText(text).width <= maxWidth) break;
      size -= 2;
    }
  };

  players.forEach((player, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = rowLeft + col * (colWidth + colGap);
    const y = gridTop + row * rowHeight;
    const name = player.displayName || player.guestName || 'Player';
    const isCaptain = Boolean(detail.team?.captainUserId && player.userId === detail.team.captainUserId);

    context.fillStyle = '#211d18';
    drawRoundedRect(context, x, y, colWidth, 78, 16);
    context.fill();

    context.fillStyle = '#f28c0f';
    drawRoundedRect(context, x + 22, y + 17, numberSize, numberSize, 12);
    context.fill();
    context.fillStyle = '#11100f';
    context.font = '900 20px system-ui, -apple-system, Segoe UI, sans-serif';
    context.textAlign = 'center';
    context.fillText(String(index + 1), x + 22 + numberSize / 2, y + 46);
    context.textAlign = 'left';

    context.fillStyle = '#ffffff';
    fitNameFont(name, colWidth - 108 - (isCaptain ? 44 : 0));
    context.fillText(name, x + 86, y + 48);
    if (isCaptain) {
      const nameWidth = context.measureText(name).width;
      context.fillStyle = '#f7d4a2';
      drawRoundedRect(context, x + 96 + nameWidth, y + 28, 28, 22, 6);
      context.fill();
      context.fillStyle = '#7a4200';
      context.font = '900 13px system-ui, -apple-system, Segoe UI, sans-serif';
      context.fillText('C', x + 105 + nameWidth, y + 44);
    }
  });

  const gridBottom = gridTop + rows * rowHeight;
  const footerY = Math.max(gridBottom + 34, height - 104);
  context.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(64, footerY);
  context.lineTo(width - 64, footerY);
  context.stroke();

  context.fillStyle = '#9f8b72';
  context.font = '600 18px system-ui, -apple-system, Segoe UI, sans-serif';
  context.fillText('Shared from MyTuskers', 64, footerY + 48);
  context.fillStyle = '#f28c0f';
  context.font = '900 18px system-ui, -apple-system, Segoe UI, sans-serif';
  const countText = `${players.length} players named`;
  context.fillText(countText, width - 64 - context.measureText(countText).width, footerY + 48);

  return canvasToBlob(canvas, 'image/jpeg', 0.92);
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const prepareLineupShare = async (detail, teamName) => {
  if (!detail?.lineup || detail.lineup.status !== 'PUBLISHED') {
    throw new Error('Lineup must be published before it can be shared.');
  }
  const blob = await createModernLineupShareBlob(detail, teamName);
  const summary = calendarSummary(detail.match, teamName);
  const filename = `${summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mytuskers-lineup'}.jpg`;
  const file = new File([blob], filename, { type: 'image/jpeg' });
  const shareUrl = matchUrl(detail.match.teamId, detail.match.matchId);
  return { file, blob, filename, summary, shareUrl };
};

const sharePreparedLineup = async (prepared) => {
  if (navigator.share) {
    const filePayload = {
      title: prepared.summary,
      text: 'Team for the day',
      files: [prepared.file],
    };
    const linkPayload = {
      title: prepared.summary,
      text: `Team for the day: ${prepared.summary}`,
      url: prepared.shareUrl,
    };

    if (!navigator.canShare || navigator.canShare(filePayload)) {
      try {
        await navigator.share(filePayload);
        return 'Lineup image ready to share.';
      } catch (err) {
        if (err?.name === 'AbortError') return 'Share cancelled.';
      }
    }

    await navigator.share(linkPayload);
    return 'Share sheet opened. This browser could not attach the generated image.';
  }

  downloadBlob(prepared.blob, prepared.filename);
  return 'This browser cannot open the share sheet, so the lineup image was downloaded.';
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const enablePushNotifications = async () => {
  if (!('Notification' in window)) {
    return { permission: 'unsupported', message: 'This browser does not support web notifications.' };
  }
  if (!window.isSecureContext) {
    return { permission: Notification.permission, message: 'Notifications need HTTPS or localhost before the browser will allow setup.' };
  }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return { permission };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { permission, message: 'This browser does not support web push subscriptions.' };
  }
  const config = await api('/v1/push/config');
  if (!config.publicKey) {
    return { permission, message: 'Notification permission is on. Push delivery still needs VAPID keys configured on the API.' };
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.publicKey),
  });
  await api('/v1/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
  });
  return { permission, message: 'Notifications are enabled on this device.' };
};

const dateInputValue = (dateText) => {
  if (!dateText) return '';
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const timeInputValue = (dateText) => {
  if (!dateText) return '';
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const isoFromDateAndTime = (dateText, timeText) => {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  const [hour, minute] = String(timeText || '').split(':').map(Number);
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  return new Date(year, month - 1, day, hour, minute).toISOString();
};

const pendingInviteKey = 'mytuskers.pendingInviteToken';

const joinPathFromToken = (token) => token ? `/join/${token}` : '';

const rememberPendingInvite = (path) => {
  const match = String(path || '').match(/^\/join\/([^/?#]+)/);
  if (match) localStorage.setItem(pendingInviteKey, match[1]);
};

const pendingInvitePath = () => joinPathFromToken(localStorage.getItem(pendingInviteKey));

const copyText = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback for local HTTP/LAN testing.
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textArea);
    return copied;
  } catch {
    return false;
  }
};

if (typeof window !== 'undefined' && !window.__mytuskersInstallPromptBound) {
  window.__mytuskersInstallPromptBound = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__mytuskersInstallPrompt = event;
    window.dispatchEvent(new Event('mytuskers:install-ready'));
  });
  window.addEventListener('appinstalled', () => {
    window.__mytuskersInstalled = true;
    window.__mytuskersInstallPrompt = null;
    window.dispatchEvent(new Event('mytuskers:installed'));
  });
}

function Protected({ children }) {
  const session = useSession();
  const location = useLocation();
  if (session.loading) return <ScreenShell><LoadingBlock title="Loading MyTuskers" /></ScreenShell>;
  if (!session.user) return <Login redirectTo={`${location.pathname}${location.search}`} />;
  if (session.user.needsProfile && location.pathname !== '/profile') return <ProfileSetup />;
  return children;
}

function Login({ redirectTo }) {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const next = redirectTo || new URLSearchParams(location.search).get('next') || '/';
  const showLocalAuthHelpers = import.meta.env.DEV;
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState(showLocalAuthHelpers ? '+61400000123' : '');
  const [password, setPassword] = useState(showLocalAuthHelpers ? 'Password123!' : '');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [resetLogin, setResetLogin] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session.loading && session.user) {
      if (next.startsWith('/join/')) rememberPendingInvite(next);
      navigate(session.user.needsProfile ? '/profile' : next, { replace: true });
    }
  }, [session.loading, session.user, navigate, next]);

  const signin = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const data = await api('/v1/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      session.setSession({ ...data, loading: false });
      if (data.teams[0]) session.setActiveTeamId(data.teams[0].teamId);
      if (next.startsWith('/join') || data.user.needsProfile) {
        localStorage.setItem('mytuskers.showFirstRunOnboarding', 'true');
      }
      if (next.startsWith('/join/')) rememberPendingInvite(next);
      navigate(data.user.needsProfile ? '/profile' : next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const signup = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const data = await api('/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name: signupName, email: signupEmail, phone: signupPhone, password: signupPassword }),
      });
      session.setSession({ ...data, loading: false });
      session.setActiveTeamId('');
      localStorage.removeItem('mytuskers.activeTeamId');
      localStorage.setItem('mytuskers.showFirstRunOnboarding', 'true');
      if (next.startsWith('/join/')) rememberPendingInvite(next);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const requestPasswordReset = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const data = await api('/v1/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ username: resetLogin }),
      });
      setMessage(data.resetUrl ? `${data.message} Local reset link: ${data.resetUrl}` : data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage('');
    setError('');
  };

  return (
    <ScreenShell>
      <section className="login-screen">
        <div className="login-brand">
          <img className="brand-logo" src="/wt_logo.png" alt="MyTuskers" />
        </div>
        <div>
          <h1>{mode === 'signup' ? 'Create your MyTuskers account' : mode === 'reset' ? 'Reset your password' : 'Welcome to MyTuskers'}</h1>
          <p>
            {mode === 'signup'
              ? 'Create an account. A captain or admin can assign you to a team.'
              : mode === 'reset'
                ? 'Enter your email or mobile number and we will send a reset link.'
                : 'Use your mobile number or email to login.'}
          </p>
        </div>
        {mode !== 'reset' && (
          <div className={`auth-toggle ${mode === 'signup' ? 'is-signup' : ''}`} aria-label="Authentication mode">
            <button className={mode === 'signin' ? 'is-active' : ''} type="button" aria-label="Show sign in form" onClick={() => switchMode('signin')}>Sign in</button>
            <button className={mode === 'signup' ? 'is-active' : ''} type="button" aria-label="Show sign up form" onClick={() => switchMode('signup')}>Sign up</button>
          </div>
        )}
        {mode === 'signin' ? (
          <>
            {showLocalAuthHelpers && (
              <div className="sample-row" aria-label="Local test users">
                <button onClick={() => setUsername('+61400000123')}>Ravi</button>
                <button onClick={() => setUsername('+61400000111')}>Captain</button>
                <button onClick={() => setUsername('+61473623614')}>Admin</button>
                <button onClick={() => setUsername('+61400000444')}>Guest</button>
              </div>
            )}
            <form className="form-stack" onSubmit={signin}>
              <label>
                <span>Mobile number or email</span>
                <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="+61 or name@example.com" />
              </label>
              <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
              {message && <p className="notice">{message}</p>}
              {error && <p className="error">{error}</p>}
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? 'Signing in' : 'Sign in'}
              </button>
            </form>
            <button className="text-button auth-link" type="button" onClick={() => switchMode('reset')}>Forgot password?</button>
            {showLocalAuthHelpers && <p className="terms">Local seeded password is Password123!.</p>}
          </>
        ) : mode === 'signup' ? (
          <form className="form-stack" onSubmit={signup}>
            <label><span>Name</span><input value={signupName} onChange={(event) => setSignupName(event.target.value)} autoComplete="name" /></label>
            <label><span>Email</span><input value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} inputMode="email" autoComplete="email" /></label>
            <label><span>Mobile number</span><input value={signupPhone} onChange={(event) => setSignupPhone(event.target.value)} inputMode="tel" autoComplete="tel" /></label>
            <PasswordField label="Password" value={signupPassword} onChange={setSignupPassword} autoComplete="new-password" />
            {error && <p className="error">{error}</p>}
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating account' : 'Create account'}</button>
          </form>
        ) : (
          <form className="form-stack" onSubmit={requestPasswordReset}>
            <label>
              <span>Email or mobile number</span>
              <input value={resetLogin} onChange={(event) => setResetLogin(event.target.value)} autoComplete="username" placeholder="+61 or name@example.com" />
            </label>
            {message && <p className="notice">{message}</p>}
            {error && <p className="error">{error}</p>}
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Sending reset link' : 'Send reset link'}</button>
            <button className="text-button auth-link" type="button" onClick={() => switchMode('signin')}>Back to sign in</button>
          </form>
        )}
      </section>
    </ScreenShell>
  );
}

function PasswordField({ label, value, onChange, autoComplete }) {
  const inputId = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="field-group">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-control">
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState({ loading: true, message: '', error: '' });
  const token = new URLSearchParams(location.search).get('token') || '';

  useEffect(() => {
    if (!token) {
      setStatus({ loading: false, message: '', error: 'This verification link is missing its token.' });
      return;
    }
    api('/v1/auth/verify-email/confirm', { method: 'POST', body: JSON.stringify({ token }) })
      .then((data) => setStatus({ loading: false, message: data.message || 'Email verified.', error: '' }))
      .catch((err) => setStatus({ loading: false, message: '', error: err.message }));
  }, [token]);

  return (
    <ScreenShell>
      <section className="login-screen">
        <img className="brand-logo" src="/wt_logo.png" alt="MyTuskers" />
        <h1>Email verification</h1>
        {status.loading && <p>Checking your link...</p>}
        {status.message && <p className="notice">{status.message}</p>}
        {status.error && <p className="error">{status.error}</p>}
        <button className="primary-button" type="button" onClick={() => navigate('/')}>Continue</button>
      </section>
    </ScreenShell>
  );
}

function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const data = await api('/v1/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setMessage(data.message || 'Password has been reset.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell>
      <section className="login-screen">
        <img className="brand-logo" src="/wt_logo.png" alt="MyTuskers" />
        <h1>Set a new password</h1>
        <p>Use at least 12 characters with uppercase, lowercase, and a number.</p>
        <form className="form-stack" onSubmit={submit}>
          <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
          {message && <p className="notice">{message}</p>}
          {error && <p className="error">{error}</p>}
          <button className="primary-button" type="submit" disabled={submitting || !token}>{submitting ? 'Saving password' : 'Save password'}</button>
          <button className="text-button auth-link" type="button" onClick={() => navigate('/login')}>Back to sign in</button>
        </form>
      </section>
    </ScreenShell>
  );
}

function ProfileSetup() {
  const session = useSession();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [displayName, setDisplayName] = useState(session.user?.displayName || '');
  const [preferredName, setPreferredName] = useState(session.user?.preferredName || '');
  const [photoUrl, setPhotoUrl] = useState(session.user?.photoUrl || '');
  const [playingRole, setPlayingRole] = useState('BATTER');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');

  const initialsPreview = (preferredName || displayName || 'MT').slice(0, 2).toUpperCase();

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setUploadingPhoto(true);
    try {
      const upload = await prepareImageUpload(file, {
        label: 'Profile photo',
        maxDimension: 1400,
        maxOutputBytes: 3.5 * 1024 * 1024,
      });
      const data = await api('/v1/me/photo', {
        method: 'POST',
        body: JSON.stringify(upload),
      });
      session.setSession({ ...data, loading: false });
      setPhotoUrl(data.user.photoUrl || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      const data = await api('/v1/me', { method: 'PATCH', body: JSON.stringify({ displayName, preferredName, playingRole }) });
      session.setSession({ ...data, loading: false });
      localStorage.setItem('mytuskers.showFirstRunOnboarding', 'true');
      navigate(pendingInvitePath() || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <ScreenShell>
      <section className="setup-screen">
        <p className="eyebrow">Step 1 of 1</p>
        <h1>Tell your team who you are</h1>
        <p>This is how you'll appear on lineups and expenses.</p>
        <form className="form-stack" onSubmit={save}>
          <div className="photo-row">
            <div className={`avatar muted ${photoUrl ? 'has-photo' : ''}`}>
              {photoUrl ? <img src={assetUrl(photoUrl)} alt="" /> : initialsPreview}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="visually-hidden"
              onChange={uploadPhoto}
            />
            <button className="text-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
              {uploadingPhoto ? 'Uploading...' : photoUrl ? 'Change photo' : 'Add photo'}
            </button>
            <span className="field-help">JPEG, PNG, or WebP up to 15 MB.</span>
          </div>
          <label><span>Full name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label><span>Preferred name on lineups</span><input placeholder="e.g. Rav" value={preferredName} onChange={(event) => setPreferredName(event.target.value)} /></label>
          <span className="field-label">I usually play as</span>
          <div className="segmented">
            {['BATTER', 'BOWLER', 'ALL_ROUNDER', 'KEEPER'].map((role) => (
              <button className={playingRole === role ? 'is-active' : ''} type="button" key={role} onClick={() => setPlayingRole(role)}>
                {role.replace('_', '-').toLowerCase()}
              </button>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <button className="primary-button bottom-action" type="submit">Save and continue</button>
        </form>
      </section>
    </ScreenShell>
  );
}

function AppLayout({ children }) {
  const session = useSession();
  const canManageTeam = isTeamOperatorRole(session.activeTeam?.membership?.role);
  const isAdmin = session.user?.globalRole === 'GLOBAL_ADMIN';
  const initials = session.user?.initials || (session.user?.displayName || 'WT').slice(0, 2).toUpperCase();
  const items = [
    { to: '/', end: true, icon: '◆', label: 'Home' },
    { to: '/schedule', icon: '□', label: 'Schedule' },
    ...(canManageTeam ? [{ to: '/captain', icon: 'C', label: 'Captain' }] : []),
    ...(isAdmin ? [{ to: '/admin', icon: 'A', label: 'Admin' }] : []),
    { to: '/more', icon: '•••', label: 'More' },
  ];
  const navItems = [
    { to: '/', end: true, Icon: HomeIcon, label: 'Home' },
    { to: '/schedule', Icon: CalendarDays, label: 'Schedule' },
    ...(session.activeTeamId ? [{ to: '/feed', Icon: MessageCircle, label: 'Feed' }] : []),
    ...(canManageTeam ? [{ to: '/captain', Icon: ShieldCheck, label: 'Captain' }] : []),
    ...(isAdmin ? [{ to: '/admin', Icon: Settings, label: 'Admin' }] : []),
    { to: '/more', initials, label: 'More' },
  ];
  return (
    <ScreenShell nav>
      {children}
      <nav className="bottom-nav" style={{ '--nav-count': navItems.length }}>
        {navItems.map((item) => (
          <NavLink
            to={item.to}
            end={item.end}
            key={item.to}
            className={({ isActive }) => `${isActive ? 'active' : ''} ${item.label === 'More' ? 'profile-nav' : ''}`.trim()}
          >
            <span>{item.Icon ? <item.Icon aria-hidden="true" size={20} strokeWidth={2.4} /> : item.initials}</span>{item.label}
          </NavLink>
        ))}
      </nav>
    </ScreenShell>
  );
}

function Header({ title }) {
  const { activeTeam, user } = useSession();
  return (
    <>
      <header className="app-header">
        <div>
          <h1>{title || `G'day, ${user.preferredName || user.displayName || 'Tuskers'}`}</h1>
          {activeTeam && <strong className="active-team-name">{activeTeam.name}</strong>}
        </div>
      </header>
    </>
  );
}

function Home() {
  const session = useSession();
  const { activeTeamId } = session;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!session.loading && session.user?.globalRole === 'GLOBAL_ADMIN') {
      navigate('/admin', { replace: true });
    }
  }, [session.loading, session.user?.globalRole, navigate]);

  const load = () => {
    if (!activeTeamId) return;
    setData(null);
    api(`/v1/teams/${activeTeamId}/home`).then(setData).catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, [activeTeamId]);

  useEffect(() => {
    if (session.loading || !session.user || activeTeamId) return undefined;
    const intervalId = window.setInterval(() => {
      session.refresh();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [session.loading, session.user?.userId, activeTeamId, session.refresh]);

  const closeExpense = () => setExpenseOpen(false);
  const closeTopup = () => setTopupOpen(false);

  const checkTeamAssignment = async () => {
    await session.refresh();
    setNotice('Checked for team assignment.');
  };

  const expenseSubmitted = async () => {
    await api(`/v1/teams/${activeTeamId}/home`).then(setData);
    closeExpense();
    setNotice('Expense submitted for captain approval.');
  };

  const topupSubmitted = async () => {
    await api(`/v1/teams/${activeTeamId}/home`).then(setData);
    closeTopup();
    setNotice('Topup request submitted for captain approval.');
  };

  return (
    <Protected>
      <AppLayout>
        <Header />
        {!activeTeamId && (
          <section className="stack">
            {notice && <p className="notice">{notice}</p>}
            <EmailVerificationNotice />
            <div className="soft-card">
              <p className="eyebrow">No active team yet</p>
              <h2>You're signed in</h2>
              <p>Your captain can approve your join request or add you to a team. Once active, your Home screen will show My Wallet first.</p>
              <button className="outline-button" type="button" onClick={checkTeamAssignment}>Check team assignment</button>
            </div>
            <FirstRunOnboarding />
          </section>
        )}
        {activeTeamId && !data && !error && <SkeletonCards />}
        {error && <p className="error">{error}</p>}
        {data && (
          <section className="stack">
            {notice && <p className="notice">{notice}</p>}
            <EmailVerificationNotice />
            <WalletCard
              wallet={{ ...data.wallet, topups: data.topups || [] }}
              team={data.team}
              onSubmitExpense={() => { setNotice(''); setExpenseOpen(true); }}
              onTopup={() => { setNotice(''); setTopupOpen(true); }}
              secondaryAction={(
                <Link to="/wallet" aria-label="Wallet" title="Wallet">
                  <WalletCards aria-hidden="true" />
                  <span>Wallet</span>
                </Link>
              )}
            />
            <HomeMatches selectedMatch={data.selectedMatch} nextMatch={data.nextMatch} />
            <AvailabilityRequests
              matches={(data.availabilityRequests || []).filter((match) => (
                match.matchId !== data.selectedMatch?.matchId && match.matchId !== data.nextMatch?.matchId
              ))}
            />
            <ExpenseNudge expenses={data.expenses} userId={session.user.userId} />
            <CollectionNudge shares={data.collectionShares || []} />
          </section>
        )}
        {data && expenseOpen && (
          <ActionModal title="Submit expense" onClose={closeExpense}>
            <ExpenseForm activeTeamId={activeTeamId} wallet={{ ...data.wallet, topups: data.topups || [] }} members={data.members || []} currentUserId={session.user.userId} onCancel={closeExpense} onSubmitted={expenseSubmitted} />
          </ActionModal>
        )}
        {data && topupOpen && (
          <ActionModal title="Submit topup request" onClose={closeTopup}>
            <TopupForm activeTeamId={activeTeamId} onCancel={closeTopup} onSubmitted={topupSubmitted} />
          </ActionModal>
        )}
        {data && <FirstRunOnboarding />}
      </AppLayout>
    </Protected>
  );
}

function EmailVerificationNotice() {
  const session = useSession();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  if (!session.user?.email || session.user.emailVerifiedAt) return null;

  const resend = async () => {
    setMessage('');
    setError('');
    setSending(true);
    try {
      const data = await api('/v1/auth/verify-email/request', { method: 'POST', body: JSON.stringify({}) });
      setMessage(data.verificationUrl ? `${data.message} Local verification link: ${data.verificationUrl}` : data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="soft-card compact">
      <p className="eyebrow">Email verification</p>
      <p>Check your email to verify your account. Verification is needed for password reset.</p>
      {message && <p className="notice">{message}</p>}
      {error && <p className="error">{error}</p>}
      <button className="outline-button" type="button" onClick={resend} disabled={sending}>
        {sending ? 'Sending...' : 'Resend verification email'}
      </button>
    </div>
  );
}

function FirstRunOnboarding() {
  const session = useSession();
  const { user } = session;
  const [visible, setVisible] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(window.__mytuskersInstallPrompt || null);
  const [installed, setInstalled] = useState(Boolean(window.__mytuskersInstalled));
  const [installing, setInstalling] = useState(false);
  const [installAttempted, setInstallAttempted] = useState(false);
  const [installOutcome, setInstallOutcome] = useState('');
  const [notificationState, setNotificationState] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [notificationMessage, setNotificationMessage] = useState('');
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isAndroid = /android/i.test(window.navigator.userAgent);
  const isSecure = window.isSecureContext;

  useEffect(() => {
    const shouldShow = localStorage.getItem('mytuskers.showFirstRunOnboarding') === 'true';
    setVisible(!user.needsProfile && (!user.onboardingCompletedAt || shouldShow));
  }, [user.userId, user.needsProfile, user.onboardingCompletedAt]);

  useEffect(() => {
    const onInstallReady = () => setInstallPrompt(window.__mytuskersInstallPrompt || null);
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('mytuskers:install-ready', onInstallReady);
    window.addEventListener('mytuskers:installed', onInstalled);
    return () => {
      window.removeEventListener('mytuskers:install-ready', onInstallReady);
      window.removeEventListener('mytuskers:installed', onInstalled);
    };
  }, []);

  const close = async () => {
    setVisible(false);
    localStorage.removeItem('mytuskers.showFirstRunOnboarding');
    try {
      const data = await api('/v1/me/onboarding', { method: 'POST' });
      session.setSession({ ...data, loading: false });
    } catch {
      localStorage.setItem(`mytuskers.firstRunDismissed.${user.userId}`, 'true');
    }
  };

  const install = async () => {
    if (!installPrompt) return;
    setInstalling(true);
    setInstallAttempted(true);
    try {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      window.__mytuskersInstallPrompt = null;
      setInstallOutcome(choice?.outcome || 'dismissed');
      if (choice?.outcome === 'accepted') setInstalled(true);
    } finally {
      setInstalling(false);
    }
  };

  const enableNotifications = async () => {
    try {
      const result = await enablePushNotifications();
      setNotificationState(result.permission);
      setNotificationMessage(result.message || '');
    } catch (err) {
      setNotificationMessage(err.message);
    }
  };

  if (!visible) return null;

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
      <div className="onboarding-sheet">
        <div className="onboarding-hero">
          <img src="/wt_logo.png" alt="" />
          <div>
            <p className="eyebrow">One-time setup</p>
            <h2 id="first-run-title">Install MyTuskers</h2>
            <p>Keep match availability, lineup updates, and wallet activity one tap away.</p>
          </div>
        </div>

        <div className="onboarding-steps">
          <div className={`setup-step install-step ${(isStandalone || installed) ? 'is-done' : ''}`}>
            <span className="step-number">1</span>
            <div>
              <strong>{isStandalone || installed ? 'Installed on this device' : 'Add to your home screen'}</strong>
              <span>
                {isStandalone || installed
                  ? 'MyTuskers is already running like an app.'
                  : installPrompt && !installAttempted
                    ? 'Tap install, then confirm the browser prompt.'
                    : installOutcome === 'dismissed'
                      ? 'The install prompt was dismissed. You can still add it later from your browser menu.'
                    : isIos
                      ? 'In Safari, tap Share, then Add to Home Screen.'
                      : isAndroid
                        ? 'Open the browser menu and choose Install app or Add to Home screen.'
                        : 'Use your browser menu and choose Install app or Add to Home screen.'}
              </span>
            </div>
          </div>

          <div className={`setup-step install-step ${notificationState === 'granted' ? 'is-done' : ''}`}>
            <span className="step-number">2</span>
            <div>
              <strong>Turn on match notifications</strong>
              <span>
                {notificationState === 'granted'
                  ? 'Notifications are enabled for match updates.'
                  : notificationState === 'denied'
                    ? 'Notifications are blocked in this browser. Open site settings to allow MyTuskers notifications.'
                    : notificationState === 'unsupported'
                      ? 'This browser does not support web notifications.'
                      : isSecure
                        ? 'Allow notifications if you want reminders for match selection, availability, and lineup changes.'
                        : 'Local HTTP testing can show this step, but browsers usually require HTTPS before notification permission can be requested.'}
              </span>
            </div>
            {isSecure && notificationState === 'default' && <button onClick={enableNotifications}>Turn on</button>}
            {notificationMessage && <small>{notificationMessage}</small>}
          </div>
        </div>

        <div className="onboarding-actions">
          {!isStandalone && !installed && installPrompt && !installAttempted ? (
            <button className="primary-button" onClick={install} disabled={installing}>
              {installing ? 'Opening install...' : 'Install MyTuskers'}
            </button>
          ) : (
            <button className="primary-button" onClick={close}>Continue</button>
          )}
          <button className="text-button" onClick={close}>Do this later</button>
        </div>
      </div>
    </div>
  );
}

function WalletCard({ wallet, team, onSubmitExpense, onTopup, secondaryAction }) {
  const actionCount = [onSubmitExpense, onTopup, secondaryAction].filter(Boolean).length;
  const pendingTopupMinor = (wallet.topups || [])
    .filter((request) => request.status === 'SUBMITTED')
    .reduce((total, request) => total + Number(request.amountMinor || 0), 0);
  const projectedMinor = Number(wallet.projectedMinor || 0) + pendingTopupMinor;
  const isAvailableNegative = Number(wallet.availableMinor || 0) < 0;
  const isProjectedNegative = projectedMinor < 0;
  const cardStyle = {
    '--wallet-card-color': team.walletCardColor || '#063d93',
    ...(team.walletCardImageUrl
      ? {
          '--wallet-texture-opacity': 0.3,
          backgroundImage: `linear-gradient(120deg, rgba(8, 13, 24, 0.38), rgba(8, 13, 24, 0.12)), url("${assetUrl(team.walletCardImageUrl)}")`,
        }
      : {}),
  };
  return (
    <div className="wallet-card" style={cardStyle}>
      <div className="wallet-texture" />
      <div className="wallet-content">
        <div className="wallet-title-row">
          <p>My Wallet · {team.name}</p>
        </div>
        <div className={`wallet-amounts ${isAvailableNegative ? 'is-negative' : ''}`}>
          <strong>{money(wallet.availableMinor)}</strong>
          <span>{isAvailableNegative ? `${money(wallet.availableMinor)} overdrawn` : `${money(wallet.availableMinor)} available`}</span>
        </div>
        <div className="wallet-breakdown">
          <span>{wallet.pendingMinor ? `${money(wallet.pendingMinor)} pending` : 'No pending expenses'}</span>
          <span className={isProjectedNegative ? 'is-negative' : ''}>{money(projectedMinor)} projected</span>
        </div>
        {Number(wallet.earmarkedMinor || 0) > 0 && (
          <div className="wallet-earmarked">
            Held for collections {money(wallet.earmarkedMinor)}
          </div>
        )}
        {(onSubmitExpense || onTopup || secondaryAction) && (
          <div className={`wallet-card-actions actions-${actionCount}`}>
            {onSubmitExpense && (
              <button type="button" onClick={onSubmitExpense} aria-label="Submit expense" title="Submit expense">
                <ReceiptText aria-hidden="true" />
                <span>Expense</span>
              </button>
            )}
            {onTopup && (
              <button type="button" onClick={onTopup} aria-label="Top up" title="Top up">
                <PlusCircle aria-hidden="true" />
                <span>Top up</span>
              </button>
            )}
            {secondaryAction}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, label }) {
  if (!match) return <div className="soft-card"><p className="muted">No upcoming matches yet.</p></div>;
  const isSelected = match.selectionStatus === 'STARTING_XI';
  const isPublished = match.lineupStatus === 'PUBLISHED';
  const needsAvailability = new Date(match.startAt) >= new Date() && match.availabilityRequestedAt && !isPublished && match.availabilityStatus === 'NO_RESPONSE';
  return (
    <Link to={`/matches/${match.matchId}`} className="match-card">
      <div className="match-meta">
        <p className="eyebrow">{label}</p>
        <span>{formatDate(match.startAt, { time: true })}</span>
      </div>
      <h2>{match.opponent.startsWith('Training') ? match.opponent : `vs ${match.opponent}`}</h2>
      <p>{match.venueName}</p>
      <div className={isSelected ? 'status good' : 'status warn'}>
        {isSelected ? "You're in the team for the day" : isPublished ? 'Team published' : needsAvailability ? 'Availability needed' : 'Team not published yet'}
      </div>
    </Link>
  );
}

function HomeMatches({ selectedMatch, nextMatch }) {
  const cards = [];
  if (selectedMatch) cards.push({ match: selectedMatch, label: 'Your selected match' });
  if (nextMatch && nextMatch.matchId !== selectedMatch?.matchId) cards.push({ match: nextMatch, label: 'Next team match' });
  if (!cards.length) return <MatchCard match={null} />;
  return cards.map((item) => <MatchCard key={item.match.matchId} match={item.match} label={item.label} />);
}

function AvailabilityRequests({ matches }) {
  if (!matches.length) return null;
  return (
    <section className="nudge-section">
      <SectionHeading title="Availability requests" />
      <div className="availability-request-list">
        {matches.map((match) => <MatchCard match={match} label="Response needed" key={match.matchId} />)}
      </div>
    </section>
  );
}

function ExpenseNudge({ expenses, userId }) {
  const pending = expenses.find((expense) => expense.status === 'SUBMITTED' && expense.submittedByUserId === userId);
  if (!pending) return null;
  return (
    <div className="nudge-section">
      <div className="section-heading">
        <h2>Expenses pending approval</h2>
      </div>
      <div className="nudge-row">
        <span className="dot" />
        <div>
          <strong>{pending.title}</strong>
          <p>{money(pending.amountMinor)} pending approval</p>
        </div>
        <Link to={`/expenses/${pending.expenseId}`}>Details</Link>
      </div>
    </div>
  );
}

function CollectionNudge({ shares }) {
  const due = (shares || []).filter((share) => ['REQUESTED', 'REJECTED'].includes(share.status));
  const waiting = (shares || []).filter((share) => share.status === 'PAYMENT_SUBMITTED');
  if (!due.length && !waiting.length) return null;
  return (
    <div className="nudge-section">
      <div className="section-heading">
        <h2>Prepaid collections</h2>
      </div>
      {due.map((share) => (
        <div className="nudge-row" key={`${share.collectionId}-due`}>
          <span className="dot" />
          <div>
            <strong>{share.title}</strong>
            <p>{money(share.amountDueMinor)} due{share.status === 'REJECTED' ? ' · payment rejected, resubmit' : ''}</p>
          </div>
          <Link to={`/collections/${share.collectionId}`}>Confirm</Link>
        </div>
      ))}
      {waiting.map((share) => (
        <div className="nudge-row" key={`${share.collectionId}-wait`}>
          <span className="dot" />
          <div>
            <strong>{share.title}</strong>
            <p>{money(share.amountDueMinor)} waiting for captain approval</p>
          </div>
          <Link to={`/collections/${share.collectionId}`}>Details</Link>
        </div>
      ))}
    </div>
  );
}

function Wallet() {
  const session = useSession();
  const { activeTeamId } = session;
  const [data, setData] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const load = () => activeTeamId && api(`/v1/teams/${activeTeamId}/wallet/me/transactions`).then(setData);

  useEffect(() => {
    load();
  }, [activeTeamId]);

  const openForm = () => {
    setNotice('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
  };

  const openTopup = () => {
    setNotice('');
    setTopupOpen(true);
  };

  const closeTopup = () => {
    setTopupOpen(false);
  };

  const submitted = async () => {
    await load();
    closeForm();
    setNotice('Expense submitted for captain approval.');
  };

  const topupSubmitted = async () => {
    await load();
    closeTopup();
    setNotice('Topup request submitted for captain approval.');
  };

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Wallet" />
        {!data ? <SkeletonCards /> : (
          <section className="stack wallet-screen">
            <WalletCard
              wallet={{ ...data.wallet, topups: data.topups || [] }}
              team={data.team || { name: 'Player wallet', shortName: 'WT' }}
              onSubmitExpense={openForm}
              onTopup={openTopup}
            />
            {data.wallet.availableMinor < 10000 && !topupOpen && (
              <div className="wallet-alert">
                <strong>{data.wallet.availableMinor < 0 ? 'Balance overdrawn' : 'Balance running low'}</strong>
                <p>{data.wallet.availableMinor < 0 ? 'Your wallet is below zero. Top up after you make the payment outside the app, then submit it here for captain approval.' : 'Top up after you make the payment outside the app, then submit it here for captain approval.'}</p>
                <button type="button" onClick={openTopup}>Submit topup request</button>
              </div>
            )}
            {notice && <p className="notice">{notice}</p>}
            <SectionHeading title="Activity" action="Filter" />
            <div className="activity-list">
              {(data.topups || []).map((request) => <ActivityTopup request={request} key={request.requestId} />)}
              {data.expenses.map((expense) => <ActivityExpenseNote expense={expense} userId={session.user.userId} key={expense.expenseId} />)}
              {data.transactions.map((transaction) => <ActivityTransaction transaction={transaction} key={transaction.transactionId} />)}
            </div>
            {formOpen && (
              <ActionModal title="Submit expense" onClose={closeForm}>
                <ExpenseForm activeTeamId={activeTeamId} wallet={{ ...data.wallet, topups: data.topups || [] }} members={data.members || []} currentUserId={session.user.userId} onCancel={closeForm} onSubmitted={submitted} />
              </ActionModal>
            )}
            {topupOpen && (
              <ActionModal title="Submit topup request" onClose={closeTopup}>
                <TopupForm activeTeamId={activeTeamId} onCancel={closeTopup} onSubmitted={topupSubmitted} />
              </ActionModal>
            )}
          </section>
        )}
      </AppLayout>
    </Protected>
  );
}

function ActivityExpenseNote({ expense, userId }) {
  const allocation = (expense.allocations || []).find((item) => item.userId === userId);
  const shareMinor = Number(allocation?.amountMinor ?? expense.pendingAllocatedMinor ?? expense.amountMinor ?? 0);
  const isSubmitted = expense.status === 'SUBMITTED';
  const detail = isSubmitted
    ? `${money(shareMinor)} pending share`
    : expense.status === 'APPROVED'
      ? `${money(shareMinor)} share posted below`
      : 'No wallet change';
  return (
    <div className="activity-row">
      <span className={`activity-icon ${expense.status === 'APPROVED' ? 'note' : expense.status.toLowerCase()}`}>
        {expense.status === 'REJECTED' ? 'x' : isSubmitted ? '$' : 'i'}
      </span>
      <div>
        <strong>{expense.title}</strong>
        <p>Expense {expense.status.toLowerCase()} - {detail}</p>
      </div>
      {isSubmitted && <b>{money(shareMinor)}</b>}
    </div>
  );
}

function ActivityExpense({ expense }) {
  const sign = expense.status === 'APPROVED' ? '-' : '';
  return (
    <div className="activity-row">
      <span className={`activity-icon ${expense.status.toLowerCase()}`}>{expense.status === 'REJECTED' ? '×' : '$'}</span>
      <div>
        <strong>{expense.title}</strong>
        <p>Expense {expense.status.toLowerCase()}</p>
      </div>
      <b>{sign}{money(expense.amountMinor)}</b>
    </div>
  );
}

function ActivityTopup({ request }) {
  return (
    <div className="activity-row">
      <span className="activity-icon approved">+</span>
      <div>
        <strong>Topup request</strong>
        <p>{request.status.toLowerCase()}</p>
      </div>
      <b>{money(request.amountMinor)}</b>
    </div>
  );
}

function ActivityTransaction({ transaction }) {
  const positive = transaction.direction === 'CREDIT';
  return (
    <div className="activity-row">
      <span className="activity-icon approved">✓</span>
      <div>
        <strong>{transaction.reason}</strong>
        <p>{transaction.transactionType.replaceAll('_', ' ').toLowerCase()}</p>
      </div>
      <b>{positive ? '+' : '-'}{money(transaction.amountMinor)}</b>
    </div>
  );
}

function ExpenseDetail() {
  const { activeTeamId } = useSession();
  const { expenseId } = useParams();
  const [expense, setExpense] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeTeamId || !expenseId) return;
    api(`/v1/teams/${activeTeamId}/expenses/${expenseId}`).then((data) => setExpense(data.expense)).catch((err) => setError(err.message));
  }, [activeTeamId, expenseId]);

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Expense" />
        {!expense && !error && <SkeletonCards />}
        {error && <p className="error">{error}</p>}
        {expense && (
          <section className="stack">
            <div className="detail-card">
              <p className="eyebrow">{expense.status.toLowerCase()}</p>
              <h1>{expense.title}</h1>
              <p><b>{money(expense.amountMinor)}</b></p>
              <p>{expense.appliesTo?.replaceAll('_', ' ').toLowerCase()} · {expense.expenseDate || expense.createdAt?.slice(0, 10)}</p>
            </div>
            {expense.allocations?.length > 0 && (
              <div className="soft-card">
                <p className="eyebrow">Allocation snapshot</p>
                {expense.allocations.map((allocation) => (
                  <p key={allocation.userId}>{allocation.user?.displayName || allocation.userId}: {money(allocation.amountMinor)}</p>
                ))}
              </div>
            )}
          </section>
        )}
      </AppLayout>
    </Protected>
  );
}

function ExpenseForm({ activeTeamId, wallet, members, currentUserId, onCancel, onSubmitted }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [appliesTo, setAppliesTo] = useState('SELF');
  const [selectedUserIds, setSelectedUserIds] = useState([currentUserId]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const amountMinor = Math.round(Number(amount || 0) * 100);
  const activeMembers = members.filter((member) => member.status === 'ACTIVE');
  const targetIds = appliesTo === 'WHOLE_TEAM'
    ? activeMembers.map((member) => member.userId)
    : appliesTo === 'SELECTED_PLAYERS'
      ? selectedUserIds
      : [currentUserId];
  const myShareMinor = targetIds.includes(currentUserId) && targetIds.length ? Math.ceil(amountMinor / targetIds.length) : 0;
  const pendingTopupMinor = (wallet?.topups || [])
    .filter((request) => request.status === 'SUBMITTED')
    .reduce((total, request) => total + Number(request.amountMinor || 0), 0);
  const projectedMinor = Number(wallet?.availableMinor || 0) - (Number(wallet?.pendingMinor || 0) + myShareMinor) + pendingTopupMinor;

  const toggleSelected = (userId) => {
    setSelectedUserIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError('Enter an expense amount greater than zero.');
      return;
    }
    if (appliesTo === 'SELECTED_PLAYERS' && selectedUserIds.length === 0) {
      setError('Select at least one player.');
      return;
    }
    setSaving(true);
    try {
      await api(`/v1/teams/${activeTeamId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          amountMinor,
          expenseDate: expenseDate || undefined,
          appliesTo,
          selectedUserIds: appliesTo === 'SELECTED_PLAYERS' ? selectedUserIds : undefined,
        }),
      });
      await onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="section-heading"><h2>Submit expense</h2></div>
      <label><span>Description</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Match balls" /></label>
      <div className="form-grid">
        <label><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" /></label>
        <label><span>Date optional</span><input value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} type="date" /></label>
      </div>
      <label>
        <span>Applies to</span>
        <select value={appliesTo} onChange={(event) => setAppliesTo(event.target.value)}>
          <option value="SELF">My wallet only</option>
          <option value="SELECTED_PLAYERS">Selected players</option>
          <option value="WHOLE_TEAM">Team expense - all players</option>
        </select>
      </label>
      {appliesTo === 'SELECTED_PLAYERS' && (
        <div className="player-picker">
          {activeMembers.map((member) => (
            <label key={member.userId}>
              <input type="checkbox" checked={selectedUserIds.includes(member.userId)} onChange={() => toggleSelected(member.userId)} />
              <span>{member.user?.displayName || member.userId}</span>
            </label>
          ))}
        </div>
      )}
      <div className="expense-projection">
        <div><span>Your pending share</span><strong>{money(myShareMinor)}</strong></div>
        <div><span>Projected balance</span><strong>{money(projectedMinor)}</strong></div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit expense'}</button>
        <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function TopupForm({ activeTeamId, onCancel, onSubmitted }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const amountMinor = Math.round(Number(amount || 0) * 100);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError('Enter a topup amount greater than zero.');
      return;
    }
    if (!paymentConfirmed) {
      setError('Confirm that you have made the payment outside the app.');
      return;
    }
    setSaving(true);
    try {
      await api(`/v1/teams/${activeTeamId}/wallet/me/topups`, {
        method: 'POST',
        body: JSON.stringify({ amountMinor, note, paymentConfirmed }),
      });
      await onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="section-heading"><h2>Submit topup request</h2></div>
      <label><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" /></label>
      <label><span>Payment note optional</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. bank transfer reference" /></label>
      <label className="checkbox-row">
        <input type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} />
        <span>I agree I have made the payment outside MyTuskers.</span>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit topup request'}</button>
        <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Schedule() {
  const { activeTeamId } = useSession();
  const [matches, setMatches] = useState([]);
  const nextMatchRef = useRef(null);

  useEffect(() => {
    if (activeTeamId) api(`/v1/teams/${activeTeamId}/matches`).then((data) => setMatches(data.matches));
  }, [activeTeamId]);

  const nextMatch = matches.find((match) => new Date(match.startAt) >= new Date() && !['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(match.status));

  useEffect(() => {
    if (!nextMatch?.matchId) return;
    requestAnimationFrame(() => {
      nextMatchRef.current?.scrollIntoView({ block: 'center' });
    });
  }, [nextMatch?.matchId]);

  const groups = matches.reduce((acc, match) => {
    const month = new Intl.DateTimeFormat('en-AU', { month: 'long' }).format(new Date(match.startAt)).toUpperCase();
    acc[month] ||= [];
    acc[month].push(match);
    return acc;
  }, {});

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Schedule" />
        <section className="stack">
          {Object.entries(groups).map(([month, group]) => (
            <div key={month}>
              <p className="eyebrow">{month}</p>
              <div className="schedule-list">
                {group.map((match) => <ScheduleItem match={match} key={match.matchId} isNext={match.matchId === nextMatch?.matchId} nextRef={match.matchId === nextMatch?.matchId ? nextMatchRef : null} />)}
              </div>
            </div>
          ))}
        </section>
      </AppLayout>
    </Protected>
  );
}

function ScheduleItem({ match, isNext, nextRef }) {
  const date = new Date(match.startAt);
  const isClosed = ['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(match.status);
  const isPublished = match.lineupStatus === 'PUBLISHED';
  const availabilityLabel = {
    AVAILABLE: 'Available',
    UNAVAILABLE: 'Not available',
    MAYBE: 'Maybe',
    NO_RESPONSE: 'Not answered',
  }[match.availabilityStatus || 'NO_RESPONSE'];
  return (
    <Link to={`/matches/${match.matchId}`} className={`schedule-item ${isNext ? 'is-next' : ''} ${isClosed ? 'is-closed' : ''}`} ref={nextRef}>
      <div className="date-tile">
        <span>{new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(date)}</span>
        <strong>{new Intl.DateTimeFormat('en-AU', { day: '2-digit' }).format(date)}</strong>
        <span>{new Intl.DateTimeFormat('en-AU', { month: 'short' }).format(date)}</span>
      </div>
      <div>
        <h2>{match.opponent.startsWith('Training') ? match.opponent : `vs ${match.opponent}`}</h2>
        <p>{formatDate(match.startAt, { time: true })} · {match.venueName}</p>
        {isNext && <span className="mini-pill good">Next match</span>}
        {isClosed ? (
          <>
            {match.result
              ? <span className={`mini-pill ${matchResultTone[match.result] || 'neutral'}`}>{matchResultLabel[match.result] || match.result}</span>
              : <span className="mini-pill neutral">{match.status.toLowerCase()}</span>}
            {match.resultSummary && <p className="schedule-result-summary">{match.resultSummary}</p>}
          </>
        ) : isPublished ? (
          match.selectionStatus === 'STARTING_XI' && <span className="mini-pill good">You're in</span>
        ) : (
          <>
            <span className="mini-pill">{match.availabilityRequestedAt ? availabilityLabel : 'No availability request'}</span>
            <span className="mini-pill warn">Lineup not published</span>
          </>
        )}
      </div>
    </Link>
  );
}

function MatchDetail() {
  const session = useSession();
  const { activeTeamId } = session;
  const { matchId } = useParams();
  const location = useLocation();
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState('');
  const requestedTeamId = new URLSearchParams(location.search).get('teamId');
  const matchTeamId = requestedTeamId || activeTeamId;
  const teamName = session.teams.find((team) => team.teamId === matchTeamId)?.name
    || session.activeTeam?.name
    || 'Tuskers';

  const load = () => api(`/v1/teams/${matchTeamId}/matches/${matchId}`).then(setDetail);
  useEffect(() => {
    if (requestedTeamId && requestedTeamId !== activeTeamId) session.setActiveTeamId(requestedTeamId);
  }, [requestedTeamId, activeTeamId, session.setActiveTeamId]);

  useEffect(() => {
    if (matchTeamId && matchId) load();
  }, [matchTeamId, matchId]);

  const respond = async (status) => {
    setSaving(true);
    setNotice('');
    try {
      await api(`/v1/teams/${matchTeamId}/matches/${matchId}/availability/me`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await load();
      setNotice('Availability updated.');
    } finally {
      setSaving(false);
    }
  };

  const shareLineup = async () => {
    if (!detail?.lineup) return;
    setNotice('');
    setSharing(true);
    try {
      const prepared = await prepareLineupShare(detail, teamName);
      const message = await sharePreparedLineup(prepared);
      setNotice(message);
    } catch (err) {
      if (err?.name === 'AbortError') {
        setNotice('Share cancelled.');
      } else {
        setNotice(err.message || 'Could not share lineup image.');
      }
    } finally {
      setSharing(false);
    }
  };

  const matchKind = (match) => {
    const text = `${match.competition || ''} ${match.matchFormat || ''}`.toLowerCase();
    if (text.includes('training')) return 'Training';
    if (text.includes('friendly')) return 'Friendly game';
    return 'Tournament game';
  };
  const isClosed = detail && ['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(detail.match.status);

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Match" />
        {!detail ? <SkeletonCards /> : (
          <section className="stack">
            {notice && <p className="notice">{notice}</p>}
            {detail.lineup && <LineupSelectedBanner detail={detail} isClosed={isClosed} />}
            <div className="detail-card">
              <div className="detail-card-header">
                <p className="eyebrow">{matchKind(detail.match)}</p>
                <button
                  className="icon-button calendar-icon-button"
                  type="button"
                  onClick={() => addMatchToCalendar(detail.match, teamName, window.location.href)}
                  aria-label="Add to calendar"
                >
                  <CalendarPlus aria-hidden="true" />
                </button>
              </div>
              <h1>{detail.match.opponent.startsWith('Training') ? detail.match.opponent : `${teamName} vs ${detail.match.opponent}`}</h1>
              <p><b>{formatDate(detail.match.startAt, { weekday: 'short', time: true })}</b></p>
              <p>{detail.match.venueName}</p>
            </div>
            {isClosed ? (
              <>
                <ClosedMatchPanel detail={detail} />
                {detail.match.result && <MatchResultCard match={detail.match} />}
                {/* A finished match keeps its team sheet and MOTM as the record of the day. */}
                {detail.lineup && <LineupPanel detail={detail} onShare={shareLineup} sharing={sharing} />}
              </>
            ) : detail.lineup
              ? <LineupPanel detail={detail} onShare={shareLineup} sharing={sharing} />
              : detail.match.availabilityRequestedAt
                ? <AvailabilityPanel detail={detail} respond={respond} saving={saving} />
                : <NoAvailabilityRequestPanel detail={detail} />}
            {detail.canManageMatch && <div className="soft-card compact">
              <strong>Team availability</strong>
              <p>{detail.availabilitySummary.AVAILABLE} in · {detail.availabilitySummary.UNAVAILABLE} out · {detail.availabilitySummary.NO_RESPONSE} players haven't responded</p>
            </div>}
          </section>
        )}
      </AppLayout>
    </Protected>
  );
}

function ClosedMatchPanel({ detail }) {
  const label = detail.match.status === 'COMPLETED' ? 'Match complete' : detail.match.status === 'CANCELLED' ? 'Match cancelled' : 'Match closed';
  return (
    <div className="lineup-status">
      <span className="dot" />
      <strong>{label}</strong>
      <span>{detail.lineup ? 'Published team is kept for history' : 'Availability and lineup changes are closed'}</span>
    </div>
  );
}

function MatchResultCard({ match }) {
  const tone = matchResultTone[match.result] || 'neutral';
  return (
    <div className={`result-card ${tone}`}>
      <div className="result-card-head">
        <p className="eyebrow">Result</p>
        <span className={`mini-pill ${tone}`}>{matchResultLabel[match.result] || match.result}</span>
      </div>
      {match.resultSummary && <p>{match.resultSummary}</p>}
    </div>
  );
}

function NoAvailabilityRequestPanel({ detail }) {
  return (
    <div className="lineup-status">
      <span className="dot" />
      <strong>{detail.lineupHiddenReason || 'Lineup not published yet'}</strong>
      <span>Availability not requested</span>
    </div>
  );
}

function LineupSelectedBanner({ detail, isClosed }) {
  const userSelection = detail.lineup.startingPlayers.some((player) => player.userId === detail.availability.userId);
  const heading = isClosed
    ? (userSelection ? 'You played in this match' : 'Team for the day')
    : (userSelection ? "You're in the team for the day" : 'Team for the day published');
  return (
    <div className="selected-banner">
      <span><CheckCircle2 aria-hidden="true" /></span>
      <div>
        <strong>{heading}</strong>
        <p>Published {formatDate(detail.lineup.publishedAt, { time: true })}</p>
      </div>
    </div>
  );
}

function AvailabilityPanel({ detail, respond, saving }) {
  const currentStatus = detail.availability?.status || 'NO_RESPONSE';
  const hasResponded = currentStatus !== 'NO_RESPONSE';
  const choiceClass = (status, baseClass) => `availability-choice ${baseClass} ${currentStatus === status ? 'is-selected' : ''}`.trim();
  return (
    <>
      <div className="lineup-status">
        <span className="dot" />
        <strong>{detail.lineupHiddenReason || 'Lineup not published yet'}</strong>
        <span>{hasResponded ? `You answered: ${statusLabel[currentStatus] || currentStatus}` : 'Usually Thu night'}</span>
      </div>
      <div className="soft-card">
        <p className="eyebrow">Your availability</p>
        <h2>{hasResponded ? 'Change availability' : 'Can you play?'}</h2>
        <div className="availability-actions">
          <button disabled={saving} className={choiceClass('AVAILABLE', 'is-available')} onClick={() => respond('AVAILABLE')}>
            <CheckCircle2 aria-hidden="true" />
            <span>I'm in</span>
          </button>
          <button disabled={saving} className={choiceClass('MAYBE', 'is-maybe')} onClick={() => respond('MAYBE')}>
            <CircleHelp aria-hidden="true" />
            <span>Maybe</span>
          </button>
          <button disabled={saving} className={choiceClass('UNAVAILABLE', 'is-unavailable')} onClick={() => respond('UNAVAILABLE')}>
            <XCircle aria-hidden="true" />
            <span>Can't make it</span>
          </button>
        </div>
      </div>
    </>
  );
}

function LineupPanel({ detail, onShare, sharing }) {
  return (
    <>
      {detail.award && (
        <div className="award-card">
          <Award aria-hidden="true" />
          <div>
            <p className="eyebrow">Captain's Man of the Match</p>
            <strong>{detail.award.recipientDisplayName}</strong>
            {detail.award.reason && <span>{detail.award.reason}</span>}
          </div>
        </div>
      )}
      <div className="lineup-table">
        <div className="lineup-heading">
          <span>Team for the day</span>
          <button className="icon-button lineup-share-icon" type="button" onClick={onShare} disabled={sharing} aria-label="Share lineup image">
            <Share2 aria-hidden="true" />
          </button>
        </div>
        {detail.lineup.startingPlayers.map((player) => (
          <div className="player-row" key={`${player.userId || player.guestName || player.displayName}-${player.displayOrder}`}>
            <div className="avatar small">{player.initials}</div>
            <strong>{player.displayName}{player.userId === detail.availability.userId ? ' - you' : ''}</strong>
            {!player.userId && <em>guest</em>}
          </div>
        ))}
      </div>
    </>
  );
}
function More() {
  const session = useSession();
  const navigate = useNavigate();
  const [helpTopic, setHelpTopic] = useState('');

  const signOut = async () => {
    await api('/v1/auth/logout', { method: 'POST' });
    session.setSession({ user: null, teams: [], loading: false });
    navigate('/login');
  };
  return (
    <Protected>
      <AppLayout>
        <BackHeader title="More" />
        <section className="stack">
          {session.teams.length > 1 && (
            <div>
              <p className="eyebrow">Your teams</p>
              <div className="team-list">
                {session.teams.map((team) => (
                  <button className={team.teamId === session.activeTeamId ? 'is-active' : ''} key={team.teamId} onClick={() => session.setActiveTeamId(team.teamId)}>
                    <span>{team.shortName}</span>
                    <div><strong>{team.name}</strong><p>{team.sport.toLowerCase()} · {team.playerCount} players</p></div>
                    {team.teamId === session.activeTeamId && <b>✓</b>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="eyebrow">Settings</p>
            <div className="settings-list">
              {session.activeTeamId && (
                <button type="button" onClick={() => navigate('/feed/new', { state: { title: 'Post', submitLabel: 'Post', returnTo: '/feed' } })}><Heart size={18} /> Post <span>›</span></button>
              )}
              <Link to="/profile"><UserRound size={18} /> Profile <span>›</span></Link>
              <button type="button" onClick={() => setHelpTopic('notifications')}><Bell size={18} /> Notifications <span>›</span></button>
              <button type="button" onClick={() => setHelpTopic('install')}><Smartphone size={18} /> Install MyTuskers <span>›</span></button>
              <button onClick={signOut} className="danger"><LogOut size={18} /> Sign out <span>›</span></button>
            </div>
          </div>
        </section>
        {helpTopic && <MoreHelpModal topic={helpTopic} onClose={() => setHelpTopic('')} />}
      </AppLayout>
    </Protected>
  );
}

function MoreHelpModal({ topic, onClose }) {
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [installMessage, setInstallMessage] = useState('');
  const isInstall = topic === 'install';
  const canPromptInstall = typeof window !== 'undefined' && window.__mytuskersInstallPrompt;
  const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone = typeof window !== 'undefined'
    && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);

  const requestNotifications = async () => {
    try {
      const result = await enablePushNotifications();
      setPermission(result.permission);
      setNotificationMessage(result.message || '');
    } catch (err) {
      setNotificationMessage(err.message);
    }
  };

  const promptInstall = async () => {
    const prompt = window.__mytuskersInstallPrompt;
    if (!prompt) {
      setInstallMessage('Use the browser share or menu button, then choose Add to Home Screen or Install app.');
      return;
    }
    prompt.prompt();
    const choice = await prompt.userChoice;
    window.__mytuskersInstallPrompt = null;
    setInstallMessage(choice?.outcome === 'accepted'
      ? 'Install started. Open MyTuskers from your home screen once it finishes.'
      : 'Install was not completed. You can try again from the browser menu.');
  };

  return (
    <ActionModal title={isInstall ? 'Install MyTuskers' : 'Notifications'} onClose={onClose}>
      <div className="expense-form more-help">
        <div className="section-heading">
          <h2>{isInstall ? 'Install MyTuskers' : 'Notifications'}</h2>
        </div>
        {isInstall ? (
          <>
            <p>Install MyTuskers on your home screen for quick access to team wallet, matches, and availability links.</p>
            {isStandalone ? (
              <p className="notice">MyTuskers is already running as an installed app.</p>
            ) : (
              <button className="primary-button" type="button" onClick={promptInstall} disabled={!canPromptInstall && !isIos}>
                Install app
              </button>
            )}
            {installMessage && <p className="notice">{installMessage}</p>}
            <div className="instruction-list">
              <p><strong>iPhone:</strong> open Safari, tap Share, then Add to Home Screen.</p>
              <p><strong>Android:</strong> open Chrome, tap the menu, then Install app or Add to Home screen.</p>
            </div>
          </>
        ) : (
          <>
            <p>Notifications let you receive match updates and availability reminders once push delivery is connected for production.</p>
            {permission === 'granted' && <p className="notice">Notifications are enabled for this browser.</p>}
            {permission === 'denied' && <p className="error">Notifications are blocked. Open browser site settings and allow notifications for MyTuskers.</p>}
            {permission === 'unsupported' && <p className="error">This browser does not support web notifications.</p>}
            {notificationMessage && <p className="notice">{notificationMessage}</p>}
            {permission === 'default' && <button className="primary-button" type="button" onClick={requestNotifications}>Turn on notifications</button>}
            <div className="instruction-list">
              <p><strong>iPhone:</strong> install MyTuskers first, then allow notifications when iOS asks.</p>
              <p><strong>Android:</strong> allow notifications from the browser prompt or from site settings.</p>
            </div>
          </>
        )}
      </div>
    </ActionModal>
  );
}

function CaptainTools() {
  const session = useSession();
  const { activeTeamId } = session;
  const [data, setData] = useState(null);
  const [playerCandidates, setPlayerCandidates] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedInviteId, setCopiedInviteId] = useState('');

  const load = async () => {
    if (!activeTeamId) return;
    const [dashboard, candidates] = await Promise.all([
      api(`/v1/teams/${activeTeamId}/captain/dashboard`),
      api(`/v1/teams/${activeTeamId}/player-candidates`),
    ]);
    setData(dashboard);
    setPlayerCandidates(candidates.players);
  };

  useEffect(() => {
    load();
  }, [activeTeamId]);

  const act = async (message, callback) => {
    await callback();
    setNotice(message);
    await load();
  };

  const createInvite = async () => {
    const payload = await api(`/v1/teams/${activeTeamId}/invites`, { method: 'POST', body: JSON.stringify({}) });
    const copied = await copyText(joinUrl(payload.invite.token));
    setCopiedInviteId(payload.invite.inviteId);
    setNotice(copied ? 'Smart invite link copied.' : 'Smart invite link ready.');
    await load();
  };

  const copyInvite = async (invite) => {
    const copied = await copyText(joinUrl(invite.token));
    setCopiedInviteId(invite.inviteId);
    setNotice(copied ? 'Smart invite link copied.' : 'Smart invite link ready.');
  };

  const approveJoin = (requestId) => act('Join request approved.', () => api(`/v1/teams/${activeTeamId}/join-requests/${requestId}/approve`, { method: 'POST' }));

  const addExistingPlayer = async (event) => {
    event.preventDefault();
    if (!selectedPlayerId) return;
    await act('Player added to team.', () => api(`/v1/teams/${activeTeamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId: selectedPlayerId }),
    }));
    setSelectedPlayerId('');
  };

  const addablePlayers = playerCandidates.filter((player) => player.membershipStatus !== 'ACTIVE');
  const activeMembers = (data?.players || []).filter((member) => member.status === 'ACTIVE');
  const teamAdmins = activeMembers.filter((member) => isTeamOperatorRole(member.role));
  const playerMembers = activeMembers.filter((member) => member.role === 'PLAYER');

  const updateMemberRole = async (member, role) => {
    await act(role === 'TEAM_ADMIN' ? 'Team admin added.' : 'Team admin removed.', () => api(`/v1/teams/${activeTeamId}/members/${member.userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }));
    if (member.userId === session.user?.userId) await session.refresh();
  };

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Captain" />
        {!data ? <SkeletonCards /> : (
          <section className="stack">
            {notice && <p className="notice">{notice}</p>}
            <Link className="metric-card captain-balance-link" to="/captain/wallet">
              <span>Team balance</span>
              <strong>{money(data.teamWallet?.availableMinor || 0)}</strong>
              <p>Open team wallet, player wallets, and transactions</p>
            </Link>
            <Link className="metric-card" to="/captain/matches">
              <span>Match hub</span>
              <strong>{data.matchSummaries.length}</strong>
              <p>Create matches, request availability, publish and edit lineups</p>
            </Link>
            <Link className="metric-card" to="/captain/availability">
              <span>Availability list</span>
              <strong>{data.matchSummaries[0]?.captainAvailabilitySummary?.AVAILABLE ?? 0}</strong>
              <p>Keep your own confirmed list alongside what players answered</p>
            </Link>

            <ToolPanel title="Player management">
              {data.joinRequests.length === 0 && <p className="muted">No pending join requests.</p>}
              {data.joinRequests.map((request) => (
                <ActionRow key={request.requestId} title={request.user?.displayName || request.userId} detail="Pending join request" action="Approve" onAction={() => approveJoin(request.requestId)} />
              ))}
              <form className="mini-form" onSubmit={addExistingPlayer}>
                <label className="inline-field">
                  <span>Add existing player</span>
                  <select aria-label="Existing player" value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)}>
                    <option value="">Select player</option>
                    {addablePlayers.map((player) => (
                      <option key={player.userId} value={player.userId}>
                        {player.displayName || player.phone}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="outline-button" type="submit" disabled={!selectedPlayerId || addablePlayers.length === 0}>Add player</button>
              </form>
              <button className="outline-button" onClick={createInvite}>Get smart invite link</button>
              {data.invites.slice(0, 2).map((invite) => {
                const url = joinUrl(invite.token);
                return (
                  <div className="copy-link-card" key={invite.inviteId}>
                    <p className="copy-line">{url}</p>
                    <button className="copy-link-button" type="button" onClick={() => copyInvite(invite)}>
                      {copiedInviteId === invite.inviteId ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                );
              })}
              <div className="team-admin-block">
                <div className="section-heading compact-heading">
                  <h2>Team admins</h2>
                  <p>Same access as captain for this team.</p>
                </div>
                <div className="team-admin-list">
                  {teamAdmins.map((member) => (
                    <div className="team-admin-row" key={member.userId}>
                      <div>
                        <strong>{member.user?.displayName || member.userId}</strong>
                        <p>{member.role === 'CAPTAIN' ? 'Primary captain' : 'Team admin'}</p>
                      </div>
                      {member.role === 'TEAM_ADMIN' && (
                        <button className="text-danger-button" type="button" onClick={() => updateMemberRole(member, 'PLAYER')}>Remove admin</button>
                      )}
                    </div>
                  ))}
                  {playerMembers.length === 0 && <p className="muted">No players available to promote.</p>}
                  {playerMembers.map((member) => (
                    <div className="team-admin-row" key={member.userId}>
                      <div>
                        <strong>{member.user?.displayName || member.userId}</strong>
                        <p>Player</p>
                      </div>
                      <button type="button" onClick={() => updateMemberRole(member, 'TEAM_ADMIN')}>Make admin</button>
                    </div>
                  ))}
                </div>
              </div>
            </ToolPanel>

          </section>
        )}
      </AppLayout>
    </Protected>
  );
}

function ApprovalModal({ approval, members = [], onClose, onApprove, onReject, onSaveExpense }) {
  const item = approval.item;
  const isTopup = approval.type === 'topup';
  return (
    <ActionModal title={isTopup ? 'Topup approval' : 'Expense approval'} onClose={onClose}>
      <div className="expense-form">
        <div className="section-heading"><h2>{isTopup ? 'Topup approval' : 'Expense approval'}</h2></div>
        <div className="detail-card compact">
          <strong>{isTopup ? item.user?.displayName || item.userId : item.title}</strong>
          <p>{money(item.amountMinor)}</p>
          <p>{isTopup ? item.note || 'Payment marked complete outside MyTuskers.' : `${item.submitter?.displayName || item.submittedByUserId} submitted this expense.`}</p>
        </div>
        {!isTopup && item.allocations?.length > 0 && (
          <div className="soft-card compact">
            <strong>Applies to</strong>
            {item.allocations.map((allocation) => {
              const member = members.find((entry) => entry.userId === allocation.userId);
              return <p key={allocation.userId}>{member?.user?.displayName || allocation.userId}: {money(allocation.amountMinor)}</p>;
            })}
          </div>
        )}
        {!isTopup && onSaveExpense && (
          <CaptainExpenseForm
            activeTeamId={item.teamId}
            members={members}
            expense={item}
            submitLabel="Save expense changes"
            onSubmitted={onSaveExpense}
          />
        )}
        <div className="button-pair">
          <button className="primary-button" type="button" onClick={onApprove}>Approve</button>
          <button className="outline-button" type="button" onClick={onReject}>Reject</button>
        </div>
      </div>
    </ActionModal>
  );
}

function AdhocCreditForm({ activeTeamId, members, onCancel, onSubmitted }) {
  const [reason, setReason] = useState('Team credit');
  const [amount, setAmount] = useState('');
  const [appliesTo, setAppliesTo] = useState('SELECTED_PLAYERS');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const activeMembers = members.filter((member) => member.status === 'ACTIVE');
  const targetCount = appliesTo === 'WHOLE_TEAM' ? activeMembers.length : selectedUserIds.length;
  const amountMinor = Math.round(Number(amount || 0) * 100);

  const toggleSelected = (userId) => {
    setSelectedUserIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError('Enter a credit amount greater than zero.');
      return;
    }
    if (appliesTo === 'SELECTED_PLAYERS' && selectedUserIds.length === 0) {
      setError('Select at least one player.');
      return;
    }
    setSaving(true);
    try {
      await api(`/v1/teams/${activeTeamId}/wallet/credits`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          amountMinor,
          appliesTo,
          selectedUserIds: appliesTo === 'SELECTED_PLAYERS' ? selectedUserIds : undefined,
        }),
      });
      await onSubmitted(`Credit added to ${targetCount} player${targetCount === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="section-heading"><h2>Add credit</h2></div>
      <label htmlFor="adhoc-credit-reason"><span>Reason</span><input id="adhoc-credit-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label htmlFor="adhoc-credit-amount"><span>Amount per player</span><input id="adhoc-credit-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" /></label>
      <label>
        <span id="adhoc-credit-applies-label">Credit to</span>
        <select aria-labelledby="adhoc-credit-applies-label" value={appliesTo} onChange={(event) => setAppliesTo(event.target.value)}>
          <option value="SELECTED_PLAYERS">Selected players</option>
          <option value="WHOLE_TEAM">All active players</option>
        </select>
      </label>
      {appliesTo === 'SELECTED_PLAYERS' && (
        <div className="player-picker">
          {activeMembers.map((member) => (
            <label key={member.userId}>
              <input type="checkbox" checked={selectedUserIds.includes(member.userId)} onChange={() => toggleSelected(member.userId)} />
              <span>{member.user?.displayName || member.userId}</span>
            </label>
          ))}
        </div>
      )}
      <div className="expense-projection">
        <div><span>Players</span><strong>{targetCount}</strong></div>
        <div><span>Total credit</span><strong>{money(amountMinor * targetCount)}</strong></div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add credit'}</button>
        <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function CaptainExpenseForm({ activeTeamId, members, expense, submitLabel = 'Add expense', onCancel, onSubmitted }) {
  const activeMembers = members.filter((member) => member.status === 'ACTIVE');
  const defaultPaidBy = expense?.submittedByUserId || activeMembers[0]?.userId || '';
  const [title, setTitle] = useState(expense?.title || '');
  const [amount, setAmount] = useState(expense ? String(Number(expense.amountMinor || 0) / 100) : '');
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate || '');
  const [paidByUserId, setPaidByUserId] = useState(defaultPaidBy);
  const [appliesTo, setAppliesTo] = useState(expense?.appliesTo || 'SELECTED_PLAYERS');
  const [selectedUserIds, setSelectedUserIds] = useState(expense?.allocations?.map((allocation) => allocation.userId) || []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const amountMinor = Math.round(Number(amount || 0) * 100);

  const toggleSelected = (userId) => {
    setSelectedUserIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Description is required.');
      return;
    }
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError('Enter an expense amount greater than zero.');
      return;
    }
    if (appliesTo === 'SELECTED_PLAYERS' && selectedUserIds.length === 0) {
      setError('Select at least one player.');
      return;
    }
    setSaving(true);
    try {
      await api(expense ? `/v1/teams/${activeTeamId}/expenses/${expense.expenseId}` : `/v1/teams/${activeTeamId}/captain/expenses`, {
        method: expense ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title,
          amountMinor,
          expenseDate: expenseDate || undefined,
          paidByUserId,
          appliesTo,
          selectedUserIds: appliesTo === 'SELECTED_PLAYERS' ? selectedUserIds : undefined,
        }),
      });
      await onSubmitted(expense ? 'Expense updated.' : 'Expense added for approval.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="section-heading"><h2>{expense ? 'Edit expense' : 'Add expense'}</h2></div>
      <label htmlFor="captain-expense-description"><span>Description</span><input id="captain-expense-description" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Ground hire" /></label>
      <div className="form-grid">
        <label htmlFor="captain-expense-amount"><span>Amount</span><input id="captain-expense-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" /></label>
        <label htmlFor="captain-expense-date"><span>Date optional</span><input id="captain-expense-date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} type="date" /></label>
      </div>
      <label>
        <span id="captain-expense-paid-by-label">Paid by</span>
        <select aria-labelledby="captain-expense-paid-by-label" value={paidByUserId} onChange={(event) => setPaidByUserId(event.target.value)}>
          {activeMembers.map((member) => <option key={member.userId} value={member.userId}>{member.user?.displayName || member.userId}</option>)}
        </select>
      </label>
      <label>
        <span id="captain-expense-applies-label">Applies to</span>
        <select aria-labelledby="captain-expense-applies-label" value={appliesTo} onChange={(event) => setAppliesTo(event.target.value)}>
          <option value="SELF">Paid by only</option>
          <option value="SELECTED_PLAYERS">Selected players</option>
          <option value="WHOLE_TEAM">Team expense - all players</option>
        </select>
      </label>
      {appliesTo === 'SELECTED_PLAYERS' && (
        <div className="player-picker">
          {activeMembers.map((member) => (
            <label key={member.userId}>
              <input type="checkbox" checked={selectedUserIds.includes(member.userId)} onChange={() => toggleSelected(member.userId)} />
              <span>{member.user?.displayName || member.userId}</span>
            </label>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving...' : submitLabel}</button>
        {onCancel && <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function CaptainWalletPage() {
  const { activeTeamId } = useSession();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [approval, setApproval] = useState(null);
  const [creditOpen, setCreditOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const load = () => activeTeamId && api(`/v1/teams/${activeTeamId}/captain/dashboard`).then(setData);

  useEffect(() => {
    load();
  }, [activeTeamId]);

  const saveTransaction = async (transaction, values) => {
    await api(`/v1/teams/${activeTeamId}/players/${transaction.ownerUserId}/wallet/transactions/${transaction.transactionId}`, {
      method: 'PATCH',
      body: JSON.stringify(values),
    });
    setEditing(null);
    setNotice('Transaction updated.');
    await load();
  };

  const finishAction = async (message) => {
    setNotice(message);
    setCreditOpen(false);
    setExpenseOpen(false);
    await load();
  };

  const approveTopup = async (requestId) => {
    await api(`/v1/teams/${activeTeamId}/topups/${requestId}/approve`, { method: 'POST' });
    setApproval(null);
    await finishAction('Topup approved and credited.');
  };

  const rejectTopup = async (requestId) => {
    await api(`/v1/teams/${activeTeamId}/topups/${requestId}/reject`, { method: 'POST' });
    setApproval(null);
    await finishAction('Topup rejected.');
  };

  const approveExpense = async (expenseId) => {
    await api(`/v1/teams/${activeTeamId}/expenses/${expenseId}/approve`, { method: 'POST' });
    setApproval(null);
    await finishAction('Expense approved.');
  };

  const rejectExpense = async (expenseId) => {
    await api(`/v1/teams/${activeTeamId}/expenses/${expenseId}/reject`, { method: 'POST' });
    setApproval(null);
    await finishAction('Expense rejected.');
  };

  const saveApprovalExpense = async (message) => {
    setApproval(null);
    await finishAction(message);
  };

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Team wallet" />
        {!data ? <SkeletonCards /> : (
          <section className="stack">
            {notice && <p className="notice">{notice}</p>}
            <div className="metric-card captain-balance-link">
              <span>Team balance</span>
              <strong>{money(data.teamWallet?.availableMinor || 0)}</strong>
              <p>{data.team?.name}</p>
            </div>

            <ToolPanel title="Topup approvals">
              {data.pendingTopups.length === 0 && <p className="muted">No topup requests waiting.</p>}
              {data.pendingTopups.map((request) => (
                <button className="decision-row button-row" key={request.requestId} onClick={() => setApproval({ type: 'topup', item: request })}>
                  <div><strong>{request.user?.displayName || request.userId}</strong><p>{money(request.amountMinor)} - payment confirmed outside the app</p></div>
                  <span>Review</span>
                </button>
              ))}
            </ToolPanel>

            <ToolPanel title="Expense approvals">
              {data.pendingExpenses.length === 0 && <p className="muted">No submitted expenses waiting.</p>}
              {data.pendingExpenses.map((expense) => (
                <button className="decision-row button-row" key={expense.expenseId} onClick={() => setApproval({ type: 'expense', item: expense })}>
                  <div><strong>{expense.title}</strong><p>{expense.submitter?.displayName || expense.submittedByUserId} - {money(expense.amountMinor)}</p></div>
                  <span>Review</span>
                </button>
              ))}
            </ToolPanel>

            <ToolPanel
              title="Prepaid collections"
              headerAction={(
                <Link
                  className="tool-panel-add"
                  to="/captain/collections/new"
                  aria-label="New collection"
                  title="New collection"
                >
                  <PlusCircle size={22} aria-hidden="true" />
                </Link>
              )}
            >
              <p className="muted">One-off amounts such as jerseys or kit. Prepaid money is held separately from match fees.</p>
              {(data.collections || []).length === 0 && <p className="muted">No collections yet.</p>}
              {(data.collections || []).map((collection) => {
                const waiting = (collection.shares || []).filter((share) => share.status === 'PAYMENT_SUBMITTED').length;
                const prepaid = (collection.shares || []).filter((share) => ['PREPAID', 'SETTLED'].includes(share.status)).length;
                const duePlayers = (collection.shares || []).filter((share) => ['REQUESTED', 'REJECTED'].includes(share.status)).length;
                const statusHint = collection.status === 'SETTLED'
                  ? 'Settled'
                  : collection.status === 'CANCELLED'
                    ? 'Cancelled'
                    : waiting
                      ? `${waiting} waiting approval`
                      : duePlayers
                        ? `${duePlayers} still to pay`
                        : prepaid
                          ? 'Ready to settle'
                          : 'In progress';
                return (
                  <Link className="collection-list-row" key={collection.collectionId} to={`/captain/collections/${collection.collectionId}`}>
                    <div>
                      <strong>{collection.title}</strong>
                      <p>{money(collection.totalPrepaidMinor || 0)} of {money(collection.totalDueMinor || 0)} prepaid · {statusHint}</p>
                    </div>
                    <span className="collection-open-chip">Open</span>
                  </Link>
                );
              })}
            </ToolPanel>

            <div className="wallet-admin-actions">
              <button className="outline-button" onClick={() => setCreditOpen(true)}><PlusCircle size={18} /> Add credit</button>
              <button className="outline-button" onClick={() => setExpenseOpen(true)}><ReceiptText size={18} /> Add expense</button>
            </div>

            <ToolPanel title="Transactions">
              {(data.recentTransactions || []).length === 0 && <p className="muted">No wallet transactions yet.</p>}
              {(data.recentTransactions || []).map((transaction) => (
                <div className="decision-row transaction-row" key={transaction.transactionId}>
                  <div>
                    <strong>{transaction.reason}</strong>
                    <p>{transaction.user?.displayName || transaction.ownerUserId} - {transaction.transactionType.replaceAll('_', ' ').toLowerCase()}</p>
                  </div>
                  <strong className="transaction-amount">{transaction.direction === 'CREDIT' ? '+' : '-'}{money(transaction.amountMinor)}</strong>
                  <button className="icon-button edit-transaction-button" aria-label={`Edit ${transaction.reason}`} onClick={() => setEditing(transaction)}><Edit3 size={16} /></button>
                </div>
              ))}
            </ToolPanel>

            <ToolPanel title="Player wallets">
              {(data.playerWallets || []).map((wallet) => (
                <ActionRow
                  key={wallet.walletId}
                  title={wallet.user?.displayName || wallet.ownerUserId}
                  detail={`${money(wallet.availableMinor)} available - ${money(wallet.pendingMinor)} pending${Number(wallet.earmarkedMinor || 0) ? ` - ${money(wallet.earmarkedMinor)} held` : ''}`}
                />
              ))}
            </ToolPanel>

            {editing && <TransactionEditModal transaction={editing} onClose={() => setEditing(null)} onSave={saveTransaction} />}
            {approval && (
              <ApprovalModal
                approval={approval}
                members={data.players || []}
                onClose={() => setApproval(null)}
                onApprove={async () => {
                  if (approval.type === 'topup') await approveTopup(approval.item.requestId);
                  if (approval.type === 'expense') await approveExpense(approval.item.expenseId);
                }}
                onReject={async () => {
                  if (approval.type === 'topup') await rejectTopup(approval.item.requestId);
                  if (approval.type === 'expense') await rejectExpense(approval.item.expenseId);
                }}
                onSaveExpense={saveApprovalExpense}
              />
            )}
            {creditOpen && (
              <ActionModal title="Add credit" onClose={() => setCreditOpen(false)}>
                <AdhocCreditForm activeTeamId={activeTeamId} members={data.players || []} onCancel={() => setCreditOpen(false)} onSubmitted={finishAction} />
              </ActionModal>
            )}
            {expenseOpen && (
              <ActionModal title="Add expense" onClose={() => setExpenseOpen(false)}>
                <CaptainExpenseForm activeTeamId={activeTeamId} members={data.players || []} onCancel={() => setExpenseOpen(false)} onSubmitted={finishAction} />
              </ActionModal>
            )}
          </section>
        )}
      </AppLayout>
    </Protected>
  );
}

function TransactionEditModal({ transaction, onClose, onSave }) {
  const [amount, setAmount] = useState(String(Number(transaction.amountMinor || 0) / 100));
  const [direction, setDirection] = useState(transaction.direction);
  const [reason, setReason] = useState(transaction.reason || '');
  return (
    <ActionModal title="Edit transaction" onClose={onClose}>
      <form className="expense-form" onSubmit={(event) => {
        event.preventDefault();
        onSave(transaction, { amountMinor: Math.round(Number(amount || 0) * 100), direction, reason });
      }}>
        <div className="section-heading"><h2>Edit transaction</h2></div>
        <label htmlFor="transaction-edit-amount"><span>Amount</span><input id="transaction-edit-amount" data-autofocus aria-label="Transaction amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
        <label>
          <span id="transaction-edit-direction-label">Direction</span>
          <select aria-label="Transaction direction" aria-labelledby="transaction-edit-direction-label" value={direction} onChange={(event) => setDirection(event.target.value)}>
            <option value="CREDIT">Credit</option>
            <option value="DEBIT">Debit</option>
          </select>
        </label>
        <label htmlFor="transaction-edit-reason"><span>Reason</span><input id="transaction-edit-reason" aria-label="Transaction reason" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="button-pair">
          <button className="primary-button">Save</button>
          <button className="outline-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </ActionModal>
  );
}

function CaptainAvailabilityPage() {
  const { activeTeamId } = useSession();
  const [data, setData] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!activeTeamId) return;
    api(`/v1/teams/${activeTeamId}/captain/dashboard`).then((payload) => {
      setData(payload);
      setSelectedMatchId(payload.matchSummaries.find((match) => match.availabilityRequestedAt)?.matchId || payload.matchSummaries[0]?.matchId || '');
    });
  }, [activeTeamId]);

  const loadDetail = () => api(`/v1/teams/${activeTeamId}/matches/${selectedMatchId}`).then(setDetail);

  useEffect(() => {
    if (!activeTeamId || !selectedMatchId) return;
    loadDetail();
  }, [activeTeamId, selectedMatchId]);

  const captainSummary = detail?.captainAvailabilitySummary;

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Availability" />
        {!data ? <SkeletonCards /> : (
          <section className="stack">
            <label>
              <span>Match</span>
              <select aria-label="Availability match" value={selectedMatchId} onChange={(event) => setSelectedMatchId(event.target.value)}>
                {data.matchSummaries.map((match) => <option key={match.matchId} value={match.matchId}>{match.opponent.startsWith('Training') ? match.opponent : `vs ${match.opponent}`}</option>)}
              </select>
            </label>
            {detail && (
              <>
                {/* A compact strip rather than four metric cards, so the list
                    itself stays above the fold on a phone. */}
                <div className="availability-stat-strip">
                  {[
                    ['Available', detail.availabilitySummary.AVAILABLE],
                    ['Maybe', detail.availabilitySummary.MAYBE],
                    ['Out', detail.availabilitySummary.UNAVAILABLE],
                    ['No reply', detail.availabilitySummary.NO_RESPONSE],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <ToolPanel title="Captain's list">
                  {captainSummary && (
                    <p className="muted captain-availability-hint">
                      {captainSummary.AVAILABLE} confirmed, {captainSummary.MAYBE} maybe, {captainSummary.UNAVAILABLE} out,
                      {' '}{captainSummary.NOT_MARKED} not marked. Tap a player to cycle your mark.
                    </p>
                  )}
                  <CaptainAvailabilityList
                    activeTeamId={activeTeamId}
                    matchId={selectedMatchId}
                    rows={detail.availabilityRows || []}
                    onChanged={loadDetail}
                  />
                </ToolPanel>
              </>
            )}
          </section>
        )}
      </AppLayout>
    </Protected>
  );
}

function CaptainMatchesPage() {
  const { activeTeamId } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState('');
  const [matchForm, setMatchForm] = useState({ opponent: '', venueName: '', date: '', time: '', gameType: 'TOURNAMENT', matchFee: '' });
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [editingMatch, setEditingMatch] = useState(null);
  const [publishingMatch, setPublishingMatch] = useState(null);
  const [awardingMatch, setAwardingMatch] = useState(null);
  const [resultMatch, setResultMatch] = useState(null);
  const [sharingMatchId, setSharingMatchId] = useState('');
  const [copiedAvailabilityMatchId, setCopiedAvailabilityMatchId] = useState('');
  const nextMatchRef = useRef(null);
  const load = () => activeTeamId && api(`/v1/teams/${activeTeamId}/captain/dashboard`).then(setData);

  const openMatchFeedPublish = async (match, { award } = {}) => {
    try {
      const detail = await api(`/v1/teams/${activeTeamId}/matches/${match.matchId}`);
      const nextMatch = { ...match, ...detail.match };
      navigate('/feed/new', {
        state: {
          title: 'Publish to feed',
          submitLabel: 'Publish to feed',
          returnTo: '/feed',
          match: nextMatch,
          draft: buildMatchFeedDraft(nextMatch, award || detail.award),
        },
      });
    } catch (err) {
      setNotice(err.message || 'Could not prepare the feed post.');
    }
  };

  useEffect(() => {
    load();
  }, [activeTeamId]);

  const act = async (message, callback) => {
    await callback();
    setNotice(message);
    await load();
  };

  const requestAvailability = (matchId) => act('Availability requested.', () => api(`/v1/teams/${activeTeamId}/matches/${matchId}/availability-request`, { method: 'POST' }));

  const copyAvailabilityLink = async (match) => {
    if (!match.availabilityRequestedAt) {
      await api(`/v1/teams/${activeTeamId}/matches/${match.matchId}/availability-request`, { method: 'POST' });
    }
    const copied = await copyText(matchUrl(activeTeamId, match.matchId));
    setCopiedAvailabilityMatchId(match.matchId);
    setNotice(copied ? 'Availability link copied.' : 'Availability link ready.');
    await load();
  };

  const publishLineup = async (match, payload) => {
    const wasPublished = match.lineupStatus === 'PUBLISHED';
    await act(wasPublished ? 'Lineup updated.' : 'Lineup published.', () => api(`/v1/teams/${activeTeamId}/matches/${match.matchId}/lineup/publish`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }));
    setPublishingMatch(null);
  };

  const shareCaptainLineup = async (match) => {
    setSharingMatchId(match.matchId);
    setNotice('');
    try {
      const detail = await api(`/v1/teams/${activeTeamId}/matches/${match.matchId}`);
      const prepared = await prepareLineupShare(detail, data?.team?.name || 'Tuskers');
      const message = await sharePreparedLineup(prepared);
      setNotice(message);
    } catch (err) {
      if (err?.name === 'AbortError') {
        setNotice('Share cancelled.');
      } else {
        setNotice(err.message || 'Could not share lineup image.');
      }
    } finally {
      setSharingMatchId('');
    }
  };

  const saveAward = async (match, payload) => {
    const response = await api(`/v1/teams/${activeTeamId}/matches/${match.matchId}/award`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setAwardingMatch(null);
    await load();
    await openMatchFeedPublish(match, { award: response.award });
  };

  const createMatch = (event) => {
    event.preventDefault();
    const startAt = isoFromDateAndTime(matchForm.date, matchForm.time);
    if (!matchForm.opponent.trim() || !matchForm.venueName.trim()) {
      setNotice('Add an opponent and venue.');
      return Promise.resolve();
    }
    if (!startAt) {
      setNotice('Add a match date and time.');
      return Promise.resolve();
    }
    return act('Match created.', () => api(`/v1/teams/${activeTeamId}/matches`, {
      method: 'POST',
      body: JSON.stringify({ ...matchForm, matchFeeMinor: Math.round(Number(matchForm.matchFee || 0) * 100), startAt, competition: matchForm.gameType === 'FRIENDLY' ? 'Friendly' : 'Captain scheduled' }),
    })).then(() => {
      setCreateMatchOpen(false);
      setMatchForm({ opponent: '', venueName: '', date: '', time: '', gameType: 'TOURNAMENT', matchFee: '' });
    });
  };

  const editMatch = async (match, payload) => {
    await act('Match updated.', () => api(`/v1/teams/${activeTeamId}/matches/${match.matchId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }));
    setEditingMatch(null);
  };

  const updateMatchStatus = (match, status) => act(status === 'COMPLETED' ? 'Match marked complete.' : status === 'CANCELLED' ? 'Match cancelled.' : 'Match reopened.', () => api(`/v1/teams/${activeTeamId}/matches/${match.matchId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }));

  const saveMatchResult = async (match, payload) => {
    const response = await api(`/v1/teams/${activeTeamId}/matches/${match.matchId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setResultMatch(null);
    await load();
    await openMatchFeedPublish({ ...match, ...response.match });
  };

  const deleteUnpublishedMatch = (match) => {
    const confirmed = window.confirm(`Delete ${match.opponent.startsWith('Training') ? match.opponent : `vs ${match.opponent}`}?`);
    if (!confirmed) return Promise.resolve();
    return act('Match deleted.', () => api(`/v1/teams/${activeTeamId}/matches/${match.matchId}`, { method: 'DELETE' }));
  };

  const hubMatches = data?.matchSummaries || [];
  const cleanupMatches = hubMatches.filter((match) => match.status === 'CANCELLED' && match.lineupStatus !== 'PUBLISHED');
  const activeMatches = hubMatches.filter((match) => !['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(match.status));
  const upcomingMatches = activeMatches.filter((match) => new Date(match.startAt) >= new Date());
  const closeoutMatches = activeMatches.filter((match) => new Date(match.startAt) < new Date());
  const nextMatch = upcomingMatches[0];
  const groups = hubMatches.reduce((acc, match) => {
    const month = new Intl.DateTimeFormat('en-AU', { month: 'long' }).format(new Date(match.startAt)).toUpperCase();
    acc[month] ||= [];
    acc[month].push(match);
    return acc;
  }, {});

  useEffect(() => {
    if (!nextMatch?.matchId) return;
    requestAnimationFrame(() => {
      nextMatchRef.current?.scrollIntoView({ block: 'center' });
    });
  }, [nextMatch?.matchId]);

  return (
    <Protected>
      <AppLayout>
        <div className="match-hub-header">
          <button className="back-button match-hub-back" type="button" aria-label="Go back" onClick={() => navigate(-1)}>‹</button>
          <div>
            <p>{upcomingMatches.length} upcoming{closeoutMatches.length ? ` - ${closeoutMatches.length} to close` : ''}{cleanupMatches.length ? ` - ${cleanupMatches.length} cleanup` : ''}</p>
            <h1>Match hub</h1>
          </div>
          <button className="match-create-button" type="button" aria-label="Create match" onClick={() => setCreateMatchOpen(true)}>
            <PlusCircle aria-hidden="true" size={22} />
          </button>
        </div>
        {!data ? <SkeletonCards /> : (
          <section className="stack">
            {notice && <p className="notice">{notice}</p>}
            {!hubMatches.length && <p className="muted">No matches yet. Use Create match to add one.</p>}
            {Object.entries(groups).map(([month, matches]) => (
              <div key={month}>
                <p className="eyebrow">{month}</p>
                <div className="schedule-list">
                  {matches.map((match) => (
                    <CaptainMatchItem
                      key={match.matchId}
                      match={match}
                      isNext={match.matchId === nextMatch?.matchId}
                      nextRef={match.matchId === nextMatch?.matchId ? nextMatchRef : null}
                      onOpen={() => setSelectedMatch(match)}
                      onEdit={() => setEditingMatch(match)}
                      onRequestAvailability={() => requestAvailability(match.matchId)}
                      onCopyAvailability={() => copyAvailabilityLink(match)}
                      onPublishLineup={() => setPublishingMatch(match)}
                      onShareLineup={() => shareCaptainLineup(match)}
                      onAward={() => setAwardingMatch(match)}
                      onComplete={() => setResultMatch(match)}
                      onEditResult={() => setResultMatch(match)}
                      onPublishToFeed={() => openMatchFeedPublish(match)}
                      onCancel={() => updateMatchStatus(match, 'CANCELLED')}
                      onDelete={() => deleteUnpublishedMatch(match)}
                      onReopen={() => updateMatchStatus(match, 'SCHEDULED')}
                      copiedAvailability={copiedAvailabilityMatchId === match.matchId}
                      sharing={sharingMatchId === match.matchId}
                    />
                  ))}
                </div>
              </div>
            ))}
            {createMatchOpen && (
              <ActionModal title="Create match" onClose={() => setCreateMatchOpen(false)}>
                <form className="expense-form" onSubmit={createMatch}>
                  <div className="section-heading"><h2>Create match</h2></div>
                  <label htmlFor="create-match-opponent"><span>Opponent</span><input id="create-match-opponent" data-autofocus value={matchForm.opponent} onChange={(event) => setMatchForm({ ...matchForm, opponent: event.target.value })} placeholder="e.g. Hoppers Crossing CC" /></label>
                  <label htmlFor="create-match-venue"><span>Venue</span><input id="create-match-venue" value={matchForm.venueName} onChange={(event) => setMatchForm({ ...matchForm, venueName: event.target.value })} placeholder="e.g. Presidents Park, Oval 2" /></label>
                  <div className="form-grid-2 match-date-time-grid">
                    <label htmlFor="create-match-date"><span>Date</span><input id="create-match-date" type="date" value={matchForm.date} onChange={(event) => setMatchForm({ ...matchForm, date: event.target.value })} /></label>
                    <label htmlFor="create-match-time"><span>Start time</span><input id="create-match-time" type="time" value={matchForm.time} onChange={(event) => setMatchForm({ ...matchForm, time: event.target.value })} /></label>
                  </div>
                  <label>
                    <span id="create-match-type-label">Match type</span>
                    <select aria-labelledby="create-match-type-label" value={matchForm.gameType} onChange={(event) => setMatchForm({ ...matchForm, gameType: event.target.value, matchFee: event.target.value === 'FRIENDLY' ? '0' : matchForm.matchFee })}>
                      <option value="TOURNAMENT">Tournament game</option>
                      <option value="FRIENDLY">Friendly game</option>
                    </select>
                  </label>
                  <label htmlFor="create-match-player-fee"><span>Player fee cap</span><input id="create-match-player-fee" value={matchForm.matchFee} onChange={(event) => setMatchForm({ ...matchForm, matchFee: event.target.value })} inputMode="decimal" disabled={matchForm.gameType === 'FRIENDLY'} placeholder="0.00" /></label>
                  <div className="button-pair">
                    <button className="primary-button">Create match</button>
                    <button className="outline-button" type="button" onClick={() => setCreateMatchOpen(false)}>Cancel</button>
                  </div>
                </form>
              </ActionModal>
            )}
            {editingMatch && (
              <ActionModal title="Edit match" onClose={() => setEditingMatch(null)}>
                <MatchEditorForm match={editingMatch} onCancel={() => setEditingMatch(null)} onSubmit={(payload) => editMatch(editingMatch, payload)} />
              </ActionModal>
            )}
            {selectedMatch && <MatchSummaryModal activeTeamId={activeTeamId} match={selectedMatch} onClose={() => setSelectedMatch(null)} />}
            {publishingMatch && (
              <ActionModal title={publishingMatch.lineupStatus === 'PUBLISHED' ? 'Edit lineup' : 'Publish lineup'} onClose={() => setPublishingMatch(null)}>
                <PublishLineupForm
                  activeTeamId={activeTeamId}
                  match={publishingMatch}
                  players={data.players || []}
                  onCancel={() => setPublishingMatch(null)}
                  onPublish={(payload) => publishLineup(publishingMatch, payload)}
                />
              </ActionModal>
            )}
            {resultMatch && (
              <ActionModal title={resultMatch.status === 'COMPLETED' ? 'Match result' : 'Complete match'} onClose={() => setResultMatch(null)}>
                <MatchResultForm
                  match={resultMatch}
                  onCancel={() => setResultMatch(null)}
                  onSubmit={(payload) => saveMatchResult(resultMatch, payload)}
                />
              </ActionModal>
            )}
            {awardingMatch && (
              <ActionModal title="Captain's Man of the Match" onClose={() => setAwardingMatch(null)}>
                <CaptainAwardForm
                  activeTeamId={activeTeamId}
                  match={awardingMatch}
                  onCancel={() => setAwardingMatch(null)}
                  onSubmit={(payload) => saveAward(awardingMatch, payload)}
                />
              </ActionModal>
            )}
          </section>
        )}
      </AppLayout>
    </Protected>
  );
}

function CaptainMatchItem({ match, isNext, nextRef, onOpen, onEdit, onRequestAvailability, onCopyAvailability, onPublishLineup, onShareLineup, onAward, onComplete, onEditResult, onPublishToFeed, onCancel, onDelete, onReopen, copiedAvailability, sharing }) {
  const date = new Date(match.startAt);
  const isPublished = match.lineupStatus === 'PUBLISHED';
  const isPast = new Date(match.startAt) < new Date();
  const isCancelled = match.status === 'CANCELLED';
  const isCompleted = match.status === 'COMPLETED';
  const isAbandoned = match.status === 'ABANDONED';
  const isClosed = ['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(match.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const menuRef = useRef(null);
  const availabilitySummary = match.availabilitySummary || {};
  const missingCount = Number(availabilitySummary.NO_RESPONSE || 0);
  const captainSummary = match.captainAvailabilitySummary || {};
  const captainConfirmedCount = Number(captainSummary.AVAILABLE || 0);
  const captainMarkedCount = captainConfirmedCount
    + Number(captainSummary.MAYBE || 0)
    + Number(captainSummary.UNAVAILABLE || 0);

  const runMenuAction = (action) => {
    setMenuOpen(false);
    action();
  };

  // Measured before paint so a menu on the last card opens upwards instead of
  // ending up under the floating bottom nav.
  useLayoutEffect(() => {
    if (!menuOpen) {
      setDropUp(false);
      return;
    }
    const bounds = menuRef.current?.getBoundingClientRect();
    if (bounds) setDropUp(bounds.bottom > window.innerHeight - 80);
  }, [menuOpen]);

  const status = isCancelled ? { tone: 'neutral', Icon: XCircle, text: 'Cancelled' }
    : isAbandoned ? { tone: 'neutral', Icon: XCircle, text: 'Abandoned' }
    : isCompleted ? (match.result
      ? { tone: matchResultTone[match.result], Icon: CheckCircle2, text: `Result: ${matchResultLabel[match.result]}` }
      : { tone: 'warn', Icon: CircleHelp, text: 'Add result' })
    : isPast ? { tone: 'warn', Icon: CircleHelp, text: 'Needs closing' }
    : isPublished ? { tone: 'published', Icon: CheckCircle2, text: 'Lineup published' }
    : !match.availabilityRequestedAt ? { tone: 'warn', Icon: CircleHelp, text: 'No request sent' }
    : missingCount ? { tone: 'warn', Icon: CircleHelp, text: `${missingCount} to answer` }
    : { tone: 'good', Icon: CheckCircle2, text: 'All answered' };

  return (
    <div className={`schedule-item captain-match-item ${isNext ? 'is-next' : ''} ${isClosed ? 'is-closed' : ''} ${menuOpen ? 'menu-open' : ''}`} ref={nextRef}>
      <button className="date-tile captain-match-date" type="button" onClick={onOpen} aria-label="Open match details">
        <span>{new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(date)}</span>
        <strong>{new Intl.DateTimeFormat('en-AU', { day: '2-digit' }).format(date)}</strong>
        <span>{new Intl.DateTimeFormat('en-AU', { month: 'short' }).format(date)}</span>
      </button>
      <div className="captain-match-body">
        <button className="captain-match-summary" type="button" onClick={onOpen}>
          <h2>{match.opponent.startsWith('Training') ? match.opponent : `vs ${match.opponent}`}</h2>
          <p>{new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(date)} · {match.venueName}</p>
        </button>
        <div className="captain-match-badges">
          <span className={`captain-match-status ${status.tone}`}>
            <status.Icon aria-hidden="true" size={13} />
            <span>{status.text}</span>
          </span>
          {captainMarkedCount > 0 && (
            <span className="captain-match-status captain-marked" title={`Captain's list: ${captainConfirmedCount} confirmed of ${captainMarkedCount} marked`}>
              <ClipboardCheck aria-hidden="true" size={13} />
              <span>List {captainConfirmedCount}/{captainMarkedCount}</span>
            </span>
          )}
        </div>
      </div>
      <div className="match-menu-wrap">
        <button className="match-menu-button" type="button" aria-label="Match actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <MoreHorizontal aria-hidden="true" size={19} />
        </button>
        {menuOpen && (
          <div className={`match-menu ${dropUp ? 'drop-up' : ''}`} role="menu" ref={menuRef}>
            {isCancelled || isAbandoned ? (
              <>
                <button type="button" role="menuitem" onClick={() => runMenuAction(onReopen)}>Reopen match</button>
                {!isPublished && <button type="button" role="menuitem" onClick={() => runMenuAction(onDelete)}>Delete match</button>}
              </>
            ) : isCompleted ? (
              <>
                <button type="button" role="menuitem" onClick={() => runMenuAction(onEditResult)}>{match.result ? 'Edit result' : 'Add result'}</button>
                {match.result && <button className="is-primary" type="button" role="menuitem" onClick={() => runMenuAction(onPublishToFeed)}>Publish to feed</button>}
                {isPublished && <button type="button" role="menuitem" onClick={() => runMenuAction(onShareLineup)}>{sharing ? 'Preparing image' : 'Share lineup image'}</button>}
                {isPublished && <button type="button" role="menuitem" onClick={() => runMenuAction(onAward)}>Captain's MOTM</button>}
                <button type="button" role="menuitem" onClick={() => runMenuAction(onReopen)}>Reopen match</button>
              </>
            ) : (
              <>
                <button className="is-primary" type="button" role="menuitem" onClick={() => runMenuAction(onPublishLineup)}>{isPublished ? 'Edit lineup' : 'Publish lineup'}</button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(onEdit)}>Edit match</button>
                {!isPublished && (
                  <button type="button" role="menuitem" disabled={Boolean(match.availabilityRequestedAt)} onClick={() => runMenuAction(onRequestAvailability)}>
                    {match.availabilityRequestedAt ? 'Availability requested' : 'Ask availability'}
                  </button>
                )}
                {!isPublished && <button type="button" role="menuitem" onClick={() => runMenuAction(onCopyAvailability)}>{copiedAvailability ? 'Copied link' : 'Copy availability link'}</button>}
                {isPublished && <button type="button" role="menuitem" onClick={() => runMenuAction(onShareLineup)}>{sharing ? 'Preparing image' : 'Share lineup image'}</button>}
                {isPublished && <button type="button" role="menuitem" onClick={() => runMenuAction(onAward)}>Captain's MOTM</button>}
                <button type="button" role="menuitem" onClick={() => runMenuAction(onComplete)}>{isPast ? 'Mark complete' : 'Mark complete early'}</button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(onCancel)}>Cancel match</button>
                {!isPublished && <button type="button" role="menuitem" onClick={() => runMenuAction(onDelete)}>Delete match</button>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchEditorForm({ match, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    opponent: match.opponent || '',
    venueName: match.venueName || '',
    date: dateInputValue(match.startAt),
    time: timeInputValue(match.startAt),
    gameType: match.gameType || 'TOURNAMENT',
    matchFee: String(Number(match.matchFeeMinor || 0) / 100),
    competition: match.competition || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const startAt = isoFromDateAndTime(form.date, form.time);
    if (!startAt) {
      setError('Add a match date and start time.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        opponent: form.opponent,
        venueName: form.venueName,
        startAt,
        gameType: form.gameType,
        competition: form.competition || (form.gameType === 'FRIENDLY' ? 'Friendly' : 'Captain scheduled'),
        matchFeeMinor: form.gameType === 'FRIENDLY' ? 0 : Math.round(Number(form.matchFee || 0) * 100),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="section-heading"><h2>Edit match</h2></div>
      <label htmlFor="edit-match-opponent"><span>Opponent</span><input id="edit-match-opponent" data-autofocus value={form.opponent} onChange={(event) => setForm({ ...form, opponent: event.target.value })} /></label>
      <label htmlFor="edit-match-venue"><span>Venue</span><input id="edit-match-venue" value={form.venueName} onChange={(event) => setForm({ ...form, venueName: event.target.value })} /></label>
      <div className="form-grid-2 match-date-time-grid">
        <label htmlFor="edit-match-date"><span>Date</span><input id="edit-match-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        <label htmlFor="edit-match-time"><span>Start time</span><input id="edit-match-time" type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
      </div>
      <label>
        <span>Match type</span>
        <select aria-label="Match type" value={form.gameType} onChange={(event) => setForm({ ...form, gameType: event.target.value, matchFee: event.target.value === 'FRIENDLY' ? '0' : form.matchFee })}>
          <option value="TOURNAMENT">Tournament game</option>
          <option value="FRIENDLY">Friendly game</option>
        </select>
      </label>
      <label htmlFor="edit-match-player-fee"><span>Player fee cap</span><input id="edit-match-player-fee" value={form.matchFee} onChange={(event) => setForm({ ...form, matchFee: event.target.value })} inputMode="decimal" disabled={form.gameType === 'FRIENDLY'} /></label>
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Save match'}</button>
        <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

const RESULT_SUMMARY_MAX = 280;

function MatchResultForm({ match, onSubmit, onCancel }) {
  const isCompleted = match.status === 'COMPLETED';
  const [result, setResult] = useState(match.result || '');
  const [summary, setSummary] = useState(match.resultSummary || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const heading = isCompleted ? 'Match result' : 'Complete match';

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!result) {
      setError('Pick who won.');
      return;
    }
    setSaving(true);
    try {
      // Editing an already-completed match must not re-stamp completedAt, so
      // the status is only sent when the match is being closed out.
      await onSubmit({
        ...(isCompleted ? {} : { status: 'COMPLETED' }),
        result,
        resultSummary: summary.trim(),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="section-heading"><h2>{heading}</h2></div>
      <p className="muted">{match.opponent.startsWith('Training') ? match.opponent : `vs ${match.opponent}`} · {formatDate(match.startAt)}</p>
      <div>
        <span className="eyebrow" id="match-result-label">Result</span>
        <div className="segmented" role="group" aria-labelledby="match-result-label">
          {matchResultOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={result === option.value ? 'is-active' : ''}
              aria-pressed={result === option.value}
              onClick={() => setResult(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <label htmlFor="match-result-summary">
        <span>Match summary optional</span>
        <textarea
          id="match-result-summary"
          rows={3}
          maxLength={RESULT_SUMMARY_MAX}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="e.g. Won by 5 wickets chasing 142. Great spell from Arun."
        />
      </label>
      <p className="muted">{RESULT_SUMMARY_MAX - summary.length} characters left. Everyone sees this in Schedule.</p>
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : isCompleted ? 'Save result' : 'Mark complete'}</button>
        <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function PublishLineupForm({ activeTeamId, match, players, onCancel, onPublish }) {
  const activePlayers = players.filter((member) => member.status === 'ACTIVE');
  const isEditing = match.lineupStatus === 'PUBLISHED';
  const [detail, setDetail] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState(() => activePlayers.slice(0, 12).map((member) => member.userId));
  const [guestRows, setGuestRows] = useState([]);
  const [matchFee, setMatchFee] = useState(String(Number(match.matchFeeMinor || 0) / 100));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const editedRef = useRef(false);
  const availability = new Map((detail?.availabilityRows || []).map((row) => [row.userId, row.status]));
  const isTournament = !`${match.gameType || ''} ${match.competition || ''} ${match.matchFormat || ''}`.toLowerCase().includes('friendly')
    && !`${match.gameType || ''} ${match.competition || ''} ${match.matchFormat || ''}`.toLowerCase().includes('training');
  const feeMinor = isTournament ? Math.max(0, Math.round(Number(matchFee || 0) * 100)) : 0;
  const guestList = guestRows.map((row) => row.name.trim()).filter(Boolean);
  const lineupCount = selectedUserIds.length + guestList.length;

  useEffect(() => {
    api(`/v1/teams/${activeTeamId}/matches/${match.matchId}`).then(setDetail);
  }, [activeTeamId, match.matchId]);

  useEffect(() => {
    if (initialized || !detail) return;
    const existingPlayers = detail.lineup?.startingPlayers || [];
    if (editedRef.current) {
      setInitialized(true);
      return;
    }
    const existingUserIds = existingPlayers.filter((player) => player.userId).map((player) => player.userId);
    const existingGuests = existingPlayers.filter((player) => !player.userId).map((player) => player.displayName || player.guestName).filter(Boolean);
    if (existingPlayers.length) {
      setSelectedUserIds(existingUserIds);
      setGuestRows(existingGuests.map((name) => ({ id: localId(), name })));
    } else {
      // No saved lineup yet, so start from whoever the captain has confirmed.
      // That list is the whole point of keeping it, and it beats the first
      // twelve players on the roster.
      const confirmed = (detail.availabilityRows || [])
        .filter((row) => row.captainStatus === 'AVAILABLE')
        .map((row) => row.userId);
      if (confirmed.length) setSelectedUserIds(confirmed);
    }
    setInitialized(true);
  }, [activePlayers, detail, initialized]);

  const toggleSelected = (userId) => {
    editedRef.current = true;
    setSelectedUserIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  const addGuestRow = () => {
    editedRef.current = true;
    if (lineupCount >= 12) {
      setError('A lineup must have exactly 12 names. Remove someone before adding another guest.');
      return;
    }
    setError('');
    setGuestRows((current) => [...current, { id: localId(), name: '' }]);
  };

  const updateGuestRow = (id, name) => {
    editedRef.current = true;
    setGuestRows((current) => current.map((row) => row.id === id ? { ...row, name } : row));
  };

  const removeGuestRow = (id) => {
    editedRef.current = true;
    setGuestRows((current) => current.filter((row) => row.id !== id));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (lineupCount !== 12) {
      setError(`Publish exactly 12 names. Current lineup has ${lineupCount}.`);
      return;
    }
    if (isTournament && (!Number.isFinite(feeMinor) || feeMinor < 0)) {
      setError('Enter a valid capped match fee.');
      return;
    }
    setSaving(true);
    try {
      const selectedPlayers = selectedUserIds.map((userId, index) => {
        const member = activePlayers.find((item) => item.userId === userId);
        return {
          userId,
          displayOrder: index + 1,
          positionLabel: member?.playingRole?.toLowerCase() || 'player',
        };
      });
      const guestPlayers = guestList.map((guestName, index) => ({
        guestName,
        displayName: guestName,
        displayOrder: selectedPlayers.length + index + 1,
        positionLabel: 'guest',
        isGuest: true,
      }));
      await onPublish({
        startingPlayers: [...selectedPlayers, ...guestPlayers],
        reservePlayers: [],
        captainNote: '',
        matchFeeMinor: feeMinor,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expense-form publish-lineup-form" onSubmit={submit}>
      <div className="section-heading"><h2>{isEditing ? 'Edit lineup' : 'Publish lineup'}</h2></div>
      <div className="detail-card compact">
        <strong>{match.opponent.startsWith('Training') ? match.opponent : `vs ${match.opponent}`}</strong>
        <p>{formatDate(match.startAt, { time: true })}</p>
        <p>{isTournament ? 'Tournament game' : 'Friendly game'} - availability is not required to publish</p>
      </div>
      <label htmlFor="publish-match-fee">
        <span>Player fee cap</span>
        <input id="publish-match-fee" data-autofocus value={matchFee} onChange={(event) => setMatchFee(event.target.value)} inputMode="decimal" disabled={!isTournament} />
      </label>
      <p className="muted">{isTournament ? `Publishing will debit ${money(feeMinor)} from each selected registered player. Guest names are not charged.` : 'Friendly games do not charge player wallets.'}</p>
      <div className="player-picker lineup-picker">
        {activePlayers.map((member) => (
          <label key={member.userId}>
            <input type="checkbox" checked={selectedUserIds.includes(member.userId)} onChange={() => toggleSelected(member.userId)} />
            <span>{member.user?.displayName || member.userId}</span>
            <em>{statusLabel[availability.get(member.userId)] || 'No response'}</em>
          </label>
        ))}
      </div>
      <div className="guest-row-list">
        <div className="section-heading">
          <h2>Guest players</h2>
          <button className="text-button" type="button" onClick={addGuestRow}>Add guest</button>
        </div>
        {guestRows.length === 0 && <p className="muted">Add guest names only when someone is playing who is not in this team.</p>}
        {guestRows.map((row, index) => (
          <div className="guest-row" key={row.id}>
            <label htmlFor={`guest-row-${row.id}`}><span>Guest {index + 1}</span><input id={`guest-row-${row.id}`} value={row.name} onChange={(event) => updateGuestRow(row.id, event.target.value)} placeholder="Guest name" /></label>
            <button className="icon-button" type="button" aria-label={`Remove guest player row ${index + 1}`} onClick={() => removeGuestRow(row.id)}>×</button>
          </div>
        ))}
      </div>
      <div className="expense-projection">
        <div><span>Total names</span><strong>{lineupCount}/12</strong></div>
        <div><span>Wallet charges</span><strong>{selectedUserIds.length}</strong></div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary-button" type="submit" disabled={saving}>{saving ? (isEditing ? 'Saving...' : 'Publishing...') : (isEditing ? 'Save lineup' : 'Publish lineup')}</button>
        <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function CaptainAwardForm({ activeTeamId, match, onCancel, onSubmit }) {
  const [detail, setDetail] = useState(null);
  const [recipientKey, setRecipientKey] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api(`/v1/teams/${activeTeamId}/matches/${match.matchId}`).then((matchDetail) => {
      setDetail(matchDetail);
      const award = matchDetail.award;
      if (award?.recipientUserId) setRecipientKey(`USER#${award.recipientUserId}`);
      else if (award?.recipientGuestName) setRecipientKey(`GUEST#${award.recipientGuestName}`);
      else {
        const firstPlayer = matchDetail.lineup?.startingPlayers?.[0];
        if (firstPlayer) setRecipientKey(firstPlayer.userId ? `USER#${firstPlayer.userId}` : `GUEST#${firstPlayer.displayName || firstPlayer.guestName}`);
      }
      setReason(award?.reason || '');
    }).catch((err) => setError(err.message));
  }, [activeTeamId, match.matchId]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!recipientKey) {
      setError('Choose a player from the published lineup.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ recipientKey, reason });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const players = detail?.lineup?.startingPlayers || [];

  return (
    <form className="expense-form award-form" onSubmit={submit}>
      <div className="section-heading"><h2>Captain's Man of the Match</h2></div>
      {!detail && !error && <p className="muted">Loading published lineup...</p>}
      {detail && detail.lineup?.status !== 'PUBLISHED' && <p className="error">Publish the lineup before setting this award.</p>}
      {players.length > 0 && (
        <>
          <label>
            <span>Recipient</span>
            <select data-autofocus value={recipientKey} onChange={(event) => setRecipientKey(event.target.value)}>
              {players.map((player) => {
                const key = player.userId ? `USER#${player.userId}` : `GUEST#${player.displayName || player.guestName}`;
                return <option key={key} value={key}>{player.displayName || player.guestName || 'Guest player'}</option>;
              })}
            </select>
          </label>
          <label htmlFor="award-reason">
            <span>Reason optional</span>
            <textarea id="award-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={280} placeholder="e.g. game-changing fielding and calm leadership" />
          </label>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="button-pair">
        <button className="primary-button" disabled={saving || !players.length}>{saving ? 'Saving...' : 'Save award'}</button>
        <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function MatchSummaryModal({ activeTeamId, match, onClose }) {
  const [detail, setDetail] = useState(null);

  const load = () => api(`/v1/teams/${activeTeamId}/matches/${match.matchId}`).then(setDetail);

  useEffect(() => {
    load();
  }, [activeTeamId, match.matchId]);

  const captainSummary = detail?.captainAvailabilitySummary;

  return (
    <ActionModal title="Match details" onClose={onClose}>
      <div className="expense-form">
        <div className="section-heading"><h2>Match details</h2></div>
        <div className="detail-card compact">
          <strong>{match.opponent.startsWith('Training') ? match.opponent : `vs ${match.opponent}`}</strong>
          <p>{formatDate(match.startAt, { time: true })}</p>
          <p>{match.venueName}</p>
        </div>
        <div className="tool-grid">
          <MetricCard title="Available" value={String(match.availabilitySummary.AVAILABLE)} />
          <MetricCard title="Maybe" value={String(match.availabilitySummary.MAYBE)} />
          <MetricCard title="Unavailable" value={String(match.availabilitySummary.UNAVAILABLE)} />
          <MetricCard title="No response" value={String(match.availabilitySummary.NO_RESPONSE)} />
        </div>
        {captainSummary && (
          <p className="muted captain-availability-hint">
            Captain's list: {captainSummary.AVAILABLE} confirmed, {captainSummary.MAYBE} maybe, {captainSummary.UNAVAILABLE} out.
            Tap a player to change your own mark.
          </p>
        )}
        {!detail ? <p className="muted">Loading responses...</p> : (
          <CaptainAvailabilityList
            activeTeamId={activeTeamId}
            matchId={match.matchId}
            rows={detail.availabilityRows || []}
            onChanged={load}
          />
        )}
      </div>
    </ActionModal>
  );
}

function AdminTools() {
  const session = useSession();
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [notice, setNotice] = useState('');
  const [notificationPermission, setNotificationPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [notificationNotice, setNotificationNotice] = useState('');
  const [sendingTestNotification, setSendingTestNotification] = useState(false);
  const [sendingTargetNotification, setSendingTargetNotification] = useState(false);
  const [notificationTarget, setNotificationTarget] = useState({ targetType: 'TEAM', userId: '', teamId: '' });
  const [teamForm, setTeamForm] = useState({ name: 'Tuskers Juniors', shortName: 'JNR', includeAllPlayers: false });
  const activeTeams = teams.filter((team) => team.status === 'ACTIVE');
  const targetUsers = users.filter((user) => !user.globalRole);

  const load = async () => {
    const [teamData, userData, auditData] = await Promise.all([
      api('/v1/admin/teams'),
      api('/v1/admin/users'),
      api('/v1/admin/audit'),
    ]);
    setTeams(teamData.teams);
    setUsers(userData.users);
    setAudit(auditData.events);
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (message, callback) => {
    await callback();
    setNotice(message);
    await load();
    await session.refresh();
  };

  const createTeam = (event) => {
    event.preventDefault();
    return act('Team created.', () => api('/v1/admin/teams', { method: 'POST', body: JSON.stringify(teamForm) }));
  };

  const toggleArchive = (team) => act(team.status === 'ACTIVE' ? 'Team archived.' : 'Team restored.', () => api(`/v1/admin/teams/${team.teamId}/${team.status === 'ACTIVE' ? 'archive' : 'restore'}`, { method: 'POST' }));

  const deleteTeam = (team) => {
    const confirmed = window.confirm(`Delete ${team.name}? This removes memberships, matches, wallet data, invites, and audit history for this team.`);
    if (!confirmed) return Promise.resolve();
    return act('Team deleted.', () => api(`/v1/admin/teams/${team.teamId}`, { method: 'DELETE' }));
  };

  const assignCaptain = (teamId, userId) => act('Captain assigned.', () => api(`/v1/admin/teams/${teamId}/captain`, {
    method: 'PUT',
    body: JSON.stringify({ userId }),
  }));

  const updateWalletCardColor = (teamId, walletCardColor) => act('Wallet card colour updated.', () => api(`/v1/admin/teams/${teamId}`, {
    method: 'PATCH',
    body: JSON.stringify({ walletCardColor }),
  }));

  const uploadWalletCardImage = async (teamId, file) => {
    if (!file) return;
    const upload = await prepareImageUpload(file, {
      label: 'Wallet card image',
      maxDimension: 2200,
      maxOutputBytes: 6 * 1024 * 1024,
    });
    return act('Wallet card image updated.', async () => {
      if (upload.dominantColor) {
        await api(`/v1/admin/teams/${teamId}`, {
          method: 'PATCH',
          body: JSON.stringify({ walletCardColor: upload.dominantColor }),
        });
      }
      await api(`/v1/admin/teams/${teamId}/wallet-card-image`, {
        method: 'POST',
        body: JSON.stringify(upload),
      });
    });
  };

  const enableAdminNotifications = async () => {
    setNotificationNotice('');
    try {
      const result = await enablePushNotifications();
      setNotificationPermission(result.permission);
      setNotificationNotice(result.message || (result.permission === 'granted'
        ? 'Notifications are enabled on this device.'
        : 'Notification permission was not granted.'));
    } catch (err) {
      setNotificationNotice(err.message);
    }
  };

  const sendTestNotification = async () => {
    setNotificationNotice('');
    setSendingTestNotification(true);
    try {
      const result = await api('/v1/push/test', {
        method: 'POST',
        body: '{}',
      });
      if (result.sent > 0) {
        setNotificationNotice(`Sent ${result.sent} test notification${result.sent === 1 ? '' : 's'} to your registered device${result.sent === 1 ? '' : 's'}.`);
      } else {
        setNotificationNotice('No registered device found. Tap Enable on this device first, then send the test again.');
      }
    } catch (err) {
      setNotificationNotice(err.message);
    } finally {
      setSendingTestNotification(false);
    }
  };

  const sendTargetNotification = async (event) => {
    event.preventDefault();
    setNotificationNotice('');
    setSendingTargetNotification(true);
    try {
      const body = {
        targetType: notificationTarget.targetType,
        userId: notificationTarget.userId || targetUsers[0]?.userId || '',
        teamId: notificationTarget.teamId || activeTeams[0]?.teamId || '',
      };
      const result = await api('/v1/admin/push/test', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (result.subscriptions === 0) {
        setNotificationNotice(`No registered devices found for ${result.targetLabel}. Ask the recipient to enable notifications, then retry.`);
      } else if (result.sent > 0) {
        setNotificationNotice(`Sent ${result.sent} notification${result.sent === 1 ? '' : 's'} to ${result.targetLabel}. ${result.failed ? `${result.failed} failed.` : ''}`);
      } else {
        setNotificationNotice(`No notification was delivered to ${result.targetLabel}. ${result.failed ? `${result.failed} failed.` : ''}`);
      }
    } catch (err) {
      setNotificationNotice(err.message);
    } finally {
      setSendingTargetNotification(false);
    }
  };

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Global admin" />
        <section className="stack">
          {notice && <p className="notice">{notice}</p>}
          <ToolPanel title="Team hub">
            <ActionRow
              title="Teams"
              detail={`${teams.length} teams - create, edit, archive, and assign captains`}
              action="Open team hub"
              onAction={() => window.location.assign('/admin/teams')}
            />
          </ToolPanel>
          <ToolPanel title="Notifications">
            <ActionRow
              title="This device"
              detail={notificationPermission === 'granted'
                ? 'Push is enabled for this browser or installed app.'
                : 'Enable notifications on this phone before sending a test.'}
              action={notificationPermission === 'granted' ? 'Refresh setup' : 'Enable on this device'}
              onAction={enableAdminNotifications}
            />
            <ActionRow
              title="Test push"
              detail="Sends a MyTuskers test notification to your registered admin device."
              action={sendingTestNotification ? 'Sending...' : 'Send test notification'}
              onAction={sendTestNotification}
            />
            <form className="notification-test-form" onSubmit={sendTargetNotification}>
              <label>
                <span>Target</span>
                <select
                  aria-label="Notification target"
                  value={notificationTarget.targetType}
                  onChange={(event) => setNotificationTarget({ ...notificationTarget, targetType: event.target.value })}
                >
                  <option value="TEAM">Team members</option>
                  <option value="USER">One user</option>
                  <option value="SELF">My admin account</option>
                </select>
              </label>
              {notificationTarget.targetType === 'TEAM' && (
                <label>
                  <span>Team</span>
                  <select
                    aria-label="Notification team"
                    value={notificationTarget.teamId || activeTeams[0]?.teamId || ''}
                    onChange={(event) => setNotificationTarget({ ...notificationTarget, teamId: event.target.value })}
                  >
                    {activeTeams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}
                  </select>
                </label>
              )}
              {notificationTarget.targetType === 'USER' && (
                <label>
                  <span>User</span>
                  <select
                    aria-label="Notification user"
                    value={notificationTarget.userId || targetUsers[0]?.userId || ''}
                    onChange={(event) => setNotificationTarget({ ...notificationTarget, userId: event.target.value })}
                  >
                    {targetUsers.map((user) => <option key={user.userId} value={user.userId}>{user.displayName || user.email || user.phone}</option>)}
                  </select>
                </label>
              )}
              <button className="outline-button" type="submit" disabled={sendingTargetNotification}>
                {sendingTargetNotification ? 'Sending...' : 'Send targeted test'}
              </button>
            </form>
            {notificationNotice && <p className="notice">{notificationNotice}</p>}
          </ToolPanel>
          {false && <ToolPanel title="Teams">
            {teams.map((team) => (
              <div className="admin-team-row" key={team.teamId}>
                <div>
                  <strong>{team.name}</strong>
                  <p>{team.status.toLowerCase()} · captain: {users.find((user) => user.userId === team.captainUserId)?.displayName || 'unassigned'}</p>
                </div>
                <label className="inline-field">
                  <span>Wallet card colour</span>
                  <input
                    aria-label={`Wallet card colour for ${team.name}`}
                    type="color"
                    value={team.walletCardColor || '#063d93'}
                    onInput={(event) => updateWalletCardColor(team.teamId, event.target.value)}
                    onChange={(event) => updateWalletCardColor(team.teamId, event.target.value)}
                  />
                </label>
                <label className="inline-field">
                  <span>Wallet card image</span>
                  <input aria-label={`Wallet card image for ${team.name}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadWalletCardImage(team.teamId, event.target.files?.[0])} />
                </label>
                <select aria-label={`Captain for ${team.name}`} value={team.captainUserId || ''} onChange={(event) => assignCaptain(team.teamId, event.target.value)}>
                  <option value="">Captain</option>
                  {users.filter((user) => !user.globalRole).map((user) => <option key={user.userId} value={user.userId}>{user.displayName || user.phone}</option>)}
                </select>
                <button onClick={() => toggleArchive(team)}>{team.status === 'ACTIVE' ? 'Archive' : 'Restore'}</button>
                <button onClick={() => deleteTeam(team)}>Delete</button>
              </div>
            ))}
          </ToolPanel>}
          <ToolPanel title="Users">
            {users.map((user) => (
              <ActionRow key={user.userId} title={user.displayName || user.phone} detail={`${user.phone}${user.globalRole ? ' · global admin' : ''}`} />
            ))}
          </ToolPanel>
          <ToolPanel title="Audit">
            {audit.slice(0, 8).map((event) => (
              <ActionRow key={event.auditId || event.SK} title={event.action} detail={`${event.actorUserId} · ${event.targetType}`} />
            ))}
          </ToolPanel>
        </section>
      </AppLayout>
    </Protected>
  );
}

function AdminTeamHub() {
  const session = useSession();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [openTeamMenuId, setOpenTeamMenuId] = useState('');

  const load = async () => {
    const [teamData, userData] = await Promise.all([
      api('/v1/admin/teams'),
      api('/v1/admin/users'),
    ]);
    setTeams(teamData.teams);
    setUsers(userData.users);
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (message, callback) => {
    await callback();
    setNotice(message);
    await load();
    await session.refresh();
  };

  const createTeam = async (payload) => {
    await act('Team created.', () => api('/v1/admin/teams', { method: 'POST', body: JSON.stringify(payload) }));
    setCreateOpen(false);
  };

  const saveTeam = async (team, payload) => {
    let walletCardUpload = null;
    if (payload.walletCardImageFile) {
      walletCardUpload = await prepareImageUpload(payload.walletCardImageFile, {
        label: 'Wallet card image',
        maxDimension: 2200,
        maxOutputBytes: 6 * 1024 * 1024,
      });
    }
    await api(`/v1/admin/teams/${team.teamId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: payload.name,
        shortName: payload.shortName,
        walletCardColor: walletCardUpload?.dominantColor || payload.walletCardColor,
      }),
    });
    if ((payload.captainUserId || '') !== (team.captainUserId || '')) {
      await api(`/v1/admin/teams/${team.teamId}/captain`, {
        method: 'PUT',
        body: JSON.stringify({ userId: payload.captainUserId }),
      });
    }
    if (walletCardUpload) {
      await api(`/v1/admin/teams/${team.teamId}/wallet-card-image`, {
        method: 'POST',
        body: JSON.stringify(walletCardUpload),
      });
    }
    setEditingTeam(null);
    await act('Team updated.', async () => {});
  };

  const toggleArchive = async (team) => {
    await act(team.status === 'ACTIVE' ? 'Team archived.' : 'Team restored.', () => api(`/v1/admin/teams/${team.teamId}/${team.status === 'ACTIVE' ? 'archive' : 'restore'}`, { method: 'POST' }));
    setEditingTeam(null);
  };

  const deleteTeam = async (team) => {
    const confirmed = window.confirm(`Delete ${team.name}? This removes memberships, matches, wallet data, invites, and audit history for this team.`);
    if (!confirmed) return;
    await act('Team deleted.', () => api(`/v1/admin/teams/${team.teamId}`, { method: 'DELETE' }));
    setEditingTeam(null);
  };

  const captainName = (team) => users.find((user) => user.userId === team.captainUserId)?.displayName || 'Unassigned';

  return (
    <Protected>
      <AppLayout>
        <div className="match-hub-header team-hub-header">
          <button className="back-button match-hub-back" type="button" aria-label="Go back" onClick={() => navigate(-1)}>‹</button>
          <div>
            <p>{teams.length} teams</p>
            <h1>Team hub</h1>
          </div>
          <button className="match-create-button" type="button" aria-label="Create team" onClick={() => setCreateOpen(true)}>
            <PlusCircle aria-hidden="true" size={22} />
          </button>
        </div>
        <section className="stack">
          {notice && <p className="notice">{notice}</p>}
          <div className="team-hub-list">
            {teams.map((team) => (
              <article className="team-hub-card" key={team.teamId}>
                <div className="team-hub-top">
                  <div className="team-hub-mark" style={{ '--team-mark-color': team.walletCardColor || '#063d93' }}>
                    <span>{team.shortName || 'WT'}</span>
                  </div>
                  <div className="team-hub-summary">
                    <h2>{team.name}</h2>
                    <p>{team.playerCount || 0} players - captain: {captainName(team)}</p>
                  </div>
                  <div className="match-menu-wrap">
                    <button className="match-menu-button" type="button" aria-label={`Actions for ${team.name}`} aria-expanded={openTeamMenuId === team.teamId} onClick={() => setOpenTeamMenuId(openTeamMenuId === team.teamId ? '' : team.teamId)}>
                      <MoreHorizontal aria-hidden="true" size={19} />
                    </button>
                    {openTeamMenuId === team.teamId && (
                      <div className="match-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => { setOpenTeamMenuId(''); setEditingTeam(team); }}>Edit team</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className={team.status === 'ACTIVE' ? 'captain-match-status published' : 'captain-match-status warn'}>
                  <CheckCircle2 aria-hidden="true" size={14} />
                  <span>{team.status.toLowerCase()}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
        {createOpen && (
          <ActionModal title="Create team" onClose={() => setCreateOpen(false)}>
            <TeamForm mode="create" users={users} onCancel={() => setCreateOpen(false)} onSubmit={createTeam} />
          </ActionModal>
        )}
        {editingTeam && (
          <ActionModal title="Edit team" onClose={() => setEditingTeam(null)}>
            <TeamForm
              mode="edit"
              team={editingTeam}
              users={users}
              onCancel={() => setEditingTeam(null)}
              onSubmit={(payload) => saveTeam(editingTeam, payload)}
              onArchive={() => toggleArchive(editingTeam)}
              onDelete={() => deleteTeam(editingTeam)}
            />
          </ActionModal>
        )}
      </AppLayout>
    </Protected>
  );
}

function TeamForm({ mode, team, users, onSubmit, onCancel, onArchive, onDelete }) {
  const [form, setForm] = useState({
    name: team?.name || '',
    shortName: team?.shortName || '',
    captainUserId: team?.captainUserId || '',
    walletCardColor: team?.walletCardColor || '#063d93',
    includeAllPlayers: false,
    walletCardImageFile: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isCreate = mode === 'create';

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expense-form team-form" onSubmit={submit}>
      <div className="section-heading"><h2>{isCreate ? 'Create team' : 'Edit team'}</h2></div>
      <label htmlFor="team-name"><span>Team name</span><input id="team-name" data-autofocus aria-label="Team name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Tuskers Juniors" /></label>
      <label htmlFor="team-short-name"><span>Short name</span><input id="team-short-name" aria-label="Short name" value={form.shortName} onChange={(event) => setForm({ ...form, shortName: event.target.value })} placeholder="e.g. JNR" maxLength={4} /></label>
      {!isCreate && (
        <>
          <label>
            <span>Captain</span>
            <select aria-label="Captain" value={form.captainUserId} onChange={(event) => setForm({ ...form, captainUserId: event.target.value })}>
              <option value="">Unassigned</option>
              {users.filter((user) => !user.globalRole).map((user) => <option key={user.userId} value={user.userId}>{user.displayName || user.phone}</option>)}
            </select>
          </label>
          <label>
            <span>Wallet card colour</span>
            <input aria-label="Wallet card colour" type="color" value={form.walletCardColor} onChange={(event) => setForm({ ...form, walletCardColor: event.target.value })} />
          </label>
          <label>
            <span>Wallet card image</span>
            <input aria-label="Wallet card image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setForm({ ...form, walletCardImageFile: event.target.files?.[0] || null })} />
            <em className="field-help">{form.walletCardImageFile ? form.walletCardImageFile.name : 'JPEG, PNG, or WebP. Source image can be up to 15 MB.'}</em>
          </label>
        </>
      )}
      {isCreate && (
        <label className="checkbox-row">
          <input type="checkbox" checked={form.includeAllPlayers} onChange={(event) => setForm({ ...form, includeAllPlayers: event.target.checked })} />
          <span>Add all existing players</span>
        </label>
      )}
      <div className="button-pair">
        <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : isCreate ? 'Create team' : 'Save team'}</button>
        <button className="outline-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="error">{error}</p>}
      {!isCreate && (
        <div className="danger-actions">
          <button className="outline-button" type="button" onClick={onArchive}>{team.status === 'ACTIVE' ? 'Archive team' : 'Restore team'}</button>
          <button className="outline-button danger" type="button" onClick={onDelete}>Delete team</button>
        </div>
      )}
    </form>
  );
}

function JoinInvite() {
  const { token } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const autoJoinTokenRef = useRef('');

  useEffect(() => {
    localStorage.setItem(pendingInviteKey, token);
    api(`/v1/invites/${token}`).then((data) => setInvite(data.invite));
  }, [token]);

  const join = async () => {
    localStorage.setItem(pendingInviteKey, token);
    if (!session.user) {
      navigate(`/login?next=/join/${token}`);
      return;
    }
    if (session.user.needsProfile) {
      navigate('/profile');
      return;
    }
    setError('');
    setJoining(true);
    try {
      const data = await api(`/v1/invites/${token}/join`, { method: 'POST' });
      setResult(data.status === 'ACTIVE' ? 'You have joined this team.' : 'Your join request is waiting for captain approval.');
      localStorage.removeItem(pendingInviteKey);
      localStorage.setItem('mytuskers.showFirstRunOnboarding', 'true');
      await session.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (session.loading || !session.user || session.user.needsProfile || result || autoJoinTokenRef.current === token) return;
    autoJoinTokenRef.current = token;
    join();
  }, [session.loading, session.user?.userId, session.user?.needsProfile, result, token]);

  return (
    <ScreenShell>
      <section className="invite-screen">
        <div className="brand-dot">WT</div>
        <p className="eyebrow">You're invited</p>
        <h1>Join {invite?.team?.name || 'this team'}</h1>
        <p>Cricket · Wyndham Tuskers Sports Club</p>
        <div className="invite-stats"><strong>{invite?.team?.playerCount || 14}<span>players</span></strong><strong>Sat<span>next match</span></strong></div>
        {result && <p className="notice">{result}</p>}
        {error && <p className="error">{error}</p>}
        {result ? (
          <button className="primary-button" onClick={() => navigate('/')}>Continue</button>
        ) : (
          <button className="primary-button" onClick={join} disabled={joining || session.loading}>
            {joining ? 'Joining...' : session.user ? 'Join this team' : 'Sign in to join'}
          </button>
        )}
      </section>
    </ScreenShell>
  );
}

function CaptainCollectionNewPage() {
  const { activeTeamId } = useSession();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [fillAll, setFillAll] = useState('');
  const [amounts, setAmounts] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeTeamId) return;
    api(`/v1/teams/${activeTeamId}/captain/dashboard`).then((data) => {
      const active = (data.players || []).filter((member) => member.status === 'ACTIVE');
      setPlayers(active);
      setAmounts(Object.fromEntries(active.map((member) => [member.userId, ''])));
    }).catch((err) => setError(err.message));
  }, [activeTeamId]);

  const applyFillAll = () => {
    setAmounts((current) => Object.fromEntries(Object.keys(current).map((userId) => [userId, fillAll])));
  };

  const included = players
    .map((player) => ({
      userId: player.userId,
      amountMinor: Math.round(Number(amounts[player.userId] || 0) * 100),
      name: player.user?.displayName || player.userId,
    }))
    .filter((row) => row.amountMinor > 0);
  const totalMinor = included.reduce((sum, row) => sum + row.amountMinor, 0);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Enter a collection title.');
      return;
    }
    if (!included.length) {
      setError('Enter an amount owed for at least one player.');
      return;
    }
    setSaving(true);
    try {
      const data = await api(`/v1/teams/${activeTeamId}/collections`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          note: note.trim(),
          shares: included.map((row) => ({ userId: row.userId, amountMinor: row.amountMinor })),
        }),
      });
      navigate(`/captain/collections/${data.collection.collectionId}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="New collection" />
        <section className="stack">
          <form className="expense-form collection-form" onSubmit={submit}>
            <p className="muted">Set how much each player owes in one go. Leave a row blank to skip that player.</p>
            <label htmlFor="collection-title"><span>Title</span><input id="collection-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Onam jerseys 2026" required /></label>
            <label htmlFor="collection-note"><span>Note</span><input id="collection-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" /></label>
            <div className="collection-fill-all">
              <label htmlFor="collection-fill-all"><span>Fill all</span><input id="collection-fill-all" value={fillAll} onChange={(event) => setFillAll(event.target.value)} inputMode="decimal" placeholder="0.00" /></label>
              <button className="outline-button" type="button" onClick={applyFillAll}>Apply</button>
            </div>
            <div className="collection-player-list">
              {players.map((player) => (
                <label className="collection-player-row" key={player.userId} htmlFor={`collection-amount-${player.userId}`}>
                  <span>{player.user?.displayName || player.userId}</span>
                  <input
                    id={`collection-amount-${player.userId}`}
                    value={amounts[player.userId] || ''}
                    onChange={(event) => setAmounts((current) => ({ ...current, [player.userId]: event.target.value }))}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Amount owed for ${player.user?.displayName || player.userId}`}
                  />
                </label>
              ))}
            </div>
            <div className="expense-projection">
              <div><span>Players</span><strong>{included.length}</strong></div>
              <div><span>Total owed</span><strong>{money(totalMinor)}</strong></div>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="button-pair">
              <button className="primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create collection'}</button>
              <Link className="outline-button" to="/captain/wallet">Cancel</Link>
            </div>
          </form>
        </section>
      </AppLayout>
    </Protected>
  );
}

function collectionShareStatusLabel(status) {
  return ({
    REQUESTED: 'Waiting to pay',
    PAYMENT_SUBMITTED: 'Payment submitted',
    PREPAID: 'Prepaid',
    SETTLED: 'Settled',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
  })[status] || status;
}

function CaptainCollectionDetailPage() {
  const { activeTeamId } = useSession();
  const { collectionId } = useParams();
  const [collection, setCollection] = useState(null);
  const [spendAmounts, setSpendAmounts] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => activeTeamId && collectionId
    && api(`/v1/teams/${activeTeamId}/collections/${collectionId}`)
      .then((data) => {
        setCollection(data.collection);
        const prepaid = (data.collection.shares || []).filter((share) => share.status === 'PREPAID');
        setSpendAmounts(Object.fromEntries(prepaid.map((share) => [
          share.userId,
          String(Number(share.amountPrepaidMinor || 0) / 100),
        ])));
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, [activeTeamId, collectionId]);

  const decide = async (userId, decision) => {
    setBusy(`${userId}-${decision}`);
    setError('');
    try {
      await api(`/v1/teams/${activeTeamId}/collections/${collectionId}/shares/${userId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setNotice(decision === 'APPROVED' ? 'Payment approved and held for the purchase.' : 'Payment rejected.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const markPaid = async (userId) => {
    setBusy(`${userId}-paid`);
    setError('');
    try {
      await api(`/v1/teams/${activeTeamId}/collections/${collectionId}/shares/${userId}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice('Marked as paid and held for the purchase.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const settle = async (event) => {
    event.preventDefault();
    setBusy('settle');
    setError('');
    try {
      const prepaid = (collection.shares || []).filter((share) => share.status === 'PREPAID');
      await api(`/v1/teams/${activeTeamId}/collections/${collectionId}/settle`, {
        method: 'POST',
        body: JSON.stringify({
          shares: prepaid.map((share) => ({
            userId: share.userId,
            amountMinor: Math.round(Number(spendAmounts[share.userId] || 0) * 100),
          })),
        }),
      });
      setNotice('Purchase recorded against prepaid amounts.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const cancelCollectionAction = async () => {
    if (!window.confirm('Cancel this collection? Prepaid amounts will be refunded from held funds.')) return;
    setBusy('cancel');
    setError('');
    try {
      await api(`/v1/teams/${activeTeamId}/collections/${collectionId}/cancel`, { method: 'POST' });
      setNotice('Collection cancelled.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const prepaidShares = (collection?.shares || []).filter((share) => share.status === 'PREPAID');

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Collection" />
        {!collection && !error && <SkeletonCards />}
        {error && <p className="error">{error}</p>}
        {collection && (
          <section className="stack">
            {notice && <p className="notice">{notice}</p>}
            <div className="detail-card">
              <p className="eyebrow">{collection.status.toLowerCase()}</p>
              <h1>{collection.title}</h1>
              {collection.note && <p>{collection.note}</p>}
              <p>
                <b>{money(collection.totalPrepaidMinor || 0)}</b> prepaid of {money(collection.totalDueMinor || 0)}
                {Number(collection.totalSpentMinor || 0) > 0 ? ` · ${money(collection.totalSpentMinor)} spent` : ''}
              </p>
            </div>

            <ToolPanel title="Players">
              {(collection.shares || []).map((share) => (
                <div className="collection-share-row" key={share.userId}>
                  <div>
                    <strong>{share.user?.displayName || share.userId}</strong>
                    <p>
                      {money(share.amountDueMinor)} owed · {collectionShareStatusLabel(share.status)}
                      {share.paymentNote ? ` · ${share.paymentNote}` : ''}
                    </p>
                  </div>
                  {share.status === 'PAYMENT_SUBMITTED' && (
                    <div className="button-pair compact">
                      <button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => decide(share.userId, 'APPROVED')}>Approve</button>
                      <button className="outline-button" type="button" disabled={Boolean(busy)} onClick={() => decide(share.userId, 'REJECTED')}>Reject</button>
                    </div>
                  )}
                  {['REQUESTED', 'REJECTED'].includes(share.status) && collection.status === 'OPEN' && (
                    <button
                      className="outline-button"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => markPaid(share.userId)}
                    >
                      Mark paid
                    </button>
                  )}
                </div>
              ))}
            </ToolPanel>

            {collection.status === 'OPEN' && prepaidShares.length > 0 && (
              <form className="expense-form collection-form" onSubmit={settle}>
                <div className="section-heading"><h2>Record purchase</h2></div>
                <p className="muted">Spend cannot exceed each player’s prepaid amount. Leftover is released to their match-fee wallet.</p>
                <div className="collection-player-list">
                  {prepaidShares.map((share) => (
                    <label className="collection-player-row" key={share.userId} htmlFor={`spend-${share.userId}`}>
                      <span>{share.user?.displayName || share.userId} (max {money(share.amountPrepaidMinor)})</span>
                      <input
                        id={`spend-${share.userId}`}
                        value={spendAmounts[share.userId] || ''}
                        onChange={(event) => setSpendAmounts((current) => ({ ...current, [share.userId]: event.target.value }))}
                        inputMode="decimal"
                        aria-label={`Spend amount for ${share.user?.displayName || share.userId}`}
                      />
                    </label>
                  ))}
                </div>
                <button className="primary-button" disabled={busy === 'settle'}>{busy === 'settle' ? 'Saving…' : 'Record purchase'}</button>
              </form>
            )}

            {collection.status === 'OPEN' && (
              <button className="outline-button" type="button" disabled={Boolean(busy)} onClick={cancelCollectionAction}>Cancel collection</button>
            )}
            <Link className="outline-button" to="/captain/wallet">Back to team wallet</Link>
          </section>
        )}
      </AppLayout>
    </Protected>
  );
}

function PlayerCollectionPage() {
  const session = useSession();
  const { activeTeamId, user } = session;
  const { collectionId } = useParams();
  const [collection, setCollection] = useState(null);
  const [note, setNote] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => activeTeamId && collectionId
    && api(`/v1/teams/${activeTeamId}/collections/${collectionId}`)
      .then((data) => setCollection(data.collection))
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, [activeTeamId, collectionId]);

  const share = (collection?.shares || []).find((item) => item.userId === user?.userId) || (collection?.shares || [])[0];

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!paymentConfirmed) {
      setError('Confirm that you have made the payment outside MyTuskers.');
      return;
    }
    setSaving(true);
    try {
      const data = await api(`/v1/teams/${activeTeamId}/collections/${collectionId}/shares/${user.userId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ paymentConfirmed: true, note }),
      });
      setCollection(data.collection);
      setNotice('Payment submitted for captain approval.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Protected>
      <AppLayout>
        <BackHeader title="Collection" />
        {!collection && !error && <SkeletonCards />}
        {error && <p className="error">{error}</p>}
        {collection && share && (
          <section className="stack">
            {notice && <p className="notice">{notice}</p>}
            <div className="detail-card">
              <p className="eyebrow">{collectionShareStatusLabel(share.status)}</p>
              <h1>{collection.title}</h1>
              {collection.note && <p>{collection.note}</p>}
              <p><b>{money(share.amountDueMinor)}</b> owed</p>
            </div>

            {['REQUESTED', 'REJECTED'].includes(share.status) && (
              <form className="expense-form" onSubmit={submit}>
                <div className="section-heading"><h2>Confirm payment</h2></div>
                <p className="muted">Pay outside MyTuskers, then confirm here so your captain can approve and hold the amount for this purchase.</p>
                <label htmlFor="collection-payment-note"><span>Payment note</span><input id="collection-payment-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional bank reference" /></label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} />
                  <span>I agree I have made the payment outside MyTuskers.</span>
                </label>
                {error && <p className="error">{error}</p>}
                <button className="primary-button" disabled={saving}>{saving ? 'Submitting…' : 'Confirm payment'}</button>
              </form>
            )}

            {share.status === 'PAYMENT_SUBMITTED' && (
              <div className="soft-card">
                <p className="eyebrow">Waiting for captain</p>
                <p>Your {money(share.amountDueMinor)} payment is waiting for captain approval.</p>
              </div>
            )}

            {share.status === 'PREPAID' && (
              <div className="soft-card">
                <p className="eyebrow">Held for purchase</p>
                <p>{money(share.amountPrepaidMinor || share.amountDueMinor)} is held separately from your match-fee wallet until the purchase is recorded.</p>
              </div>
            )}

            {share.status === 'SETTLED' && (
              <div className="soft-card">
                <p className="eyebrow">Settled</p>
                <p>{money(share.amountSpentMinor)} was applied to this purchase.</p>
              </div>
            )}
          </section>
        )}
      </AppLayout>
    </Protected>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/profile" element={<Protected><ProfileSetup /></Protected>} />
          <Route path="/join/:token" element={<JoinInvite />} />
          <Route path="/" element={<Home />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/expenses/:expenseId" element={<ExpenseDetail />} />
          <Route path="/collections/:collectionId" element={<PlayerCollectionPage />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/feed" element={<Protected><AppLayout><FeedScreen /></AppLayout></Protected>} />
          <Route path="/feed/new" element={<Protected><AppLayout><FeedComposeScreen /></AppLayout></Protected>} />
          <Route path="/feed/:postId" element={<Protected><AppLayout><FeedPostDetail /></AppLayout></Protected>} />
          <Route path="/matches/:matchId" element={<MatchDetail />} />
          <Route path="/more" element={<More />} />
          <Route path="/captain" element={<CaptainTools />} />
          <Route path="/captain/wallet" element={<CaptainWalletPage />} />
          <Route path="/captain/collections/new" element={<CaptainCollectionNewPage />} />
          <Route path="/captain/collections/:collectionId" element={<CaptainCollectionDetailPage />} />
          <Route path="/captain/matches" element={<CaptainMatchesPage />} />
          <Route path="/captain/availability" element={<CaptainAvailabilityPage />} />
          <Route path="/admin" element={<AdminTools />} />
          <Route path="/admin/teams" element={<AdminTeamHub />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

